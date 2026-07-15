"use server";

import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { stripe, appUrl } from "@/lib/stripe";
import { feeBreakdownFromNet } from "@/lib/pot-fees";
import { isRateLimited } from "@/lib/rate-limit";
import { createPotContributionSchema, transferPotOwnershipSchema } from "@/lib/validation/pot";

export type PotActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "unauthorized" | "unknown" };

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Onboarding Stripe Connect Express (brief 4.5 : "l'onboarding de
// l'organisateur prend 3 minutes"). `stripe_account_id`/`stripe_onboarding_complete`
// sont hors de portée des grants clients sur `profiles` (comme le reste des
// colonnes sensibles de cette table) -- écrits ici via un client
// service_role, jamais via la session normale de l'utilisateur, pour ne
// jamais laisser un client fabriquer un faux id de compte Stripe.
export async function startPotOnboarding(
  eventId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: "not_authenticated" | "unauthorized" | "unknown" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { data: event } = await supabase.from("events").select("pot_owner, short_code").eq("id", eventId).maybeSingle();
  if (event?.pot_owner !== user.id) {
    return { ok: false, error: "unauthorized" };
  }

  const { data: profile } = await supabase.from("profiles").select("stripe_account_id").eq("id", user.id).single();

  try {
    const admin = serviceRoleClient();
    let accountId = profile?.stripe_account_id ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "BE",
        email: user.email,
      });
      accountId = account.id;
      await admin.from("profiles").update({ stripe_account_id: accountId }).eq("id", user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: appUrl(`/api/stripe/onboarding-return?shortCode=${event.short_code}`),
      return_url: appUrl(`/api/stripe/onboarding-return?shortCode=${event.short_code}`),
      type: "account_onboarding",
    });

    return { ok: true, url: accountLink.url };
  } catch {
    return { ok: false, error: "unknown" };
  }
}

// Contribution à la cagnotte (brief 4.5/5.6) : le contributeur choisit le
// NET qu'il veut voir arriver dans la cagnotte (retour Thomas explicite),
// `feeBreakdownFromNet` calcule le montant réellement facturé. Charge
// "destination" (Konfeti reste le marchand de référence, la part de
// l'organisateur part directement chez lui via `transfer_data.destination`,
// la commission Konfeti via `application_fee_amount`) -- l'écriture en base
// (statut encore 'pending' à ce stade) passe par service_role, cette table
// n'accorde AUCUNE écriture cliente directe (voir rls_policies.sql, "les
// écritures... passent uniquement par le webhook Stripe").
export async function createPotContribution(
  input: { eventId: string; netCents: number },
): Promise<{ ok: true; url: string } | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "pot_unavailable" | "unknown" }> {
  const parsed = createPotContributionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`createPotContribution:${user.id}`, 20, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  // Retour Thomas ("aucun moyen de faire un paiement" une fois l'accès
  // cagnotte accordé à un participant "restricted") : `events` (lu plus bas
  // via service-role, voir commentaire suivant) n'est de toute façon pas
  // accessible du tout à un restricted via RLS -- il faut donc vérifier ICI,
  // explicitement, que l'appelant a un vrai droit de contribuer (approuvé,
  // OU restricted avec l'accès cagnotte explicitement accordé par un admin),
  // avant de basculer sur une lecture privilégiée qui, elle, ignore la RLS.
  const { data: myRsvp } = await supabase
    .from("rsvps")
    .select("id, status, pot_access_granted")
    .eq("event_id", parsed.data.eventId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!myRsvp || !(myRsvp.status === "approved" || (myRsvp.status === "restricted" && myRsvp.pot_access_granted))) {
    return { ok: false, error: "pot_unavailable" };
  }

  // Bug réel signalé par Thomas ("La cagnotte n'est pas disponible" pour un
  // simple invité qui contribue, alors que ça fonctionnait pour
  // l'organisateur) : `profiles_select_own` (RLS) n'autorise à lire QUE son
  // propre profil -- avec le client de session du contributeur, cette
  // lecture du profil du PORTEUR de la cagnotte revenait toujours vide sauf
  // quand contributeur et porteur étaient la même personne. Client
  // service-role ici, comme les autres lectures/écritures privilégiées de ce
  // fichier -- sert aussi à lire `events` (RLS `events_select_full_for_
  // participants` n'autorise ni un simple restricted ni même un approuvé
  // "cagnotte seule", l'autorisation vient d'être vérifiée explicitement
  // juste au-dessus, jamais déléguée à la RLS ici).
  const admin = serviceRoleClient();

  const { data: event } = await admin
    .from("events")
    .select("pot_enabled, pot_closed_at, pot_owner, title, short_code")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (!event?.pot_enabled || event.pot_closed_at || !event.pot_owner) {
    return { ok: false, error: "pot_unavailable" };
  }

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("id", event.pot_owner)
    .single();

  if (!ownerProfile?.stripe_onboarding_complete || !ownerProfile.stripe_account_id) {
    return { ok: false, error: "pot_unavailable" };
  }

  const breakdown = feeBreakdownFromNet(parsed.data.netCents);

  try {
    const { data: contribution, error: insertError } = await admin
      .from("pot_contributions")
      .insert({
        event_id: parsed.data.eventId,
        rsvp_id: myRsvp?.id ?? null,
        amount_cents: breakdown.grossCents,
        fee_stripe_cents: breakdown.stripeFeeCents,
        fee_konfeti_cents: breakdown.konfetiFeeCents,
        net_cents: breakdown.netCents,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !contribution) {
      return { ok: false, error: "unknown" };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: breakdown.grossCents,
            product_data: { name: `Cagnotte — ${event.title}` },
          },
        },
      ],
      // Bug réel découvert en test (Thomas, en comparant les vrais montants
      // Stripe) : sur une charge "destination", Stripe ne déduit du
      // transfert vers le compte connecté QUE `application_fee_amount` --
      // jamais le vrai frais Stripe (celui-ci reste entièrement à la charge
      // de la PLATEFORME). Envoyer seulement `konfetiFeeCents` ici laissait
      // l'organisateur recevoir le brut moins la seule commission (donc PLUS
      // que le net promis au contributeur), pendant que Konfeti absorbait
      // seul tout le vrai frais Stripe sur sa fine commission. Il faut
      // envoyer la totalité des frais (frais Stripe estimés + commission)
      // pour que le transfert ne laisse à l'organisateur QUE `netCents`, la
      // différence entre commission perçue et vrai frais Stripe restant la
      // marge réelle de Konfeti (jamais touchée par ce total envoyé à Stripe).
      payment_intent_data: {
        application_fee_amount: breakdown.stripeFeeCents + breakdown.konfetiFeeCents,
        transfer_data: { destination: ownerProfile.stripe_account_id },
      },
      success_url: appUrl(`/e/${event.short_code}?pot=success`),
      cancel_url: appUrl(`/e/${event.short_code}?pot=cancelled`),
    });

    await admin
      .from("pot_contributions")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", contribution.id);

    return { ok: true, url: session.url! };
  } catch {
    return { ok: false, error: "unknown" };
  }
}

// Transfert de la cagnotte (brief 4.8) : simple appel RPC, toute la
// vérification des droits (admin approuvé de CET événement) est faite par
// `transfer_pot_ownership` (SQL, security definer) elle-même.
export async function transferPotOwnership(eventId: string, newOwnerProfileId: string): Promise<PotActionResult> {
  const parsed = transferPotOwnershipSchema.safeParse({ eventId, newOwnerProfileId });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`transferPotOwnership:${user.id}`, 10, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("transfer_pot_ownership", {
    p_event_id: parsed.data.eventId,
    p_new_owner_profile_id: parsed.data.newOwnerProfileId,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  return { ok: true };
}
