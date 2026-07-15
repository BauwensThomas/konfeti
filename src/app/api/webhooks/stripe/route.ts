import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Webhook Stripe (brief : "vérification de signature obligatoire") -- seul
// point d'écriture réelle sur `pot_contributions`/`pot_payouts` (RLS déjà
// posée en Phase 1 : aucun grant client sur ces deux tables). Body brut
// (`request.text()`, jamais `request.json()`) : la vérification de
// signature a besoin des octets exacts envoyés par Stripe.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { data: contribution } = await supabase
        .from("pot_contributions")
        .update({
          status: "succeeded",
          stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_checkout_session_id", session.id)
        .select("event_id, net_cents")
        .maybeSingle();

      if (contribution?.event_id) {
        await maybeCloseCompletedPot(contribution.event_id);
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await supabase
        .from("pot_contributions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_checkout_session_id", session.id);
      break;
    }

    // Événement Connect (`event.account` renseigné) : synchronise le statut
    // d'onboarding de l'organisateur -- jamais déduit du retour de
    // navigation lui-même (voir onboarding-return/route.ts).
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await supabase
        .from("profiles")
        .update({ stripe_onboarding_complete: !!account.charges_enabled && !!account.payouts_enabled })
        .eq("stripe_account_id", account.id);
      break;
    }

    // Événements Connect de versement. Limitation connue : un versement
    // Stripe est par COMPTE connecté (peut agréger plusieurs cagnottes du
    // même organisateur), alors que `pot_payouts.event_id` suppose un
    // versement par événement -- simplification pour la V1, on l'attribue à
    // l'événement à cagnotte active le plus récent de cet organisateur (cas
    // courant : un seul événement à cagnotte à la fois).
    case "payout.paid":
    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      const accountId = event.account;
      if (!accountId) break;

      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_account_id", accountId)
        .maybeSingle();

      const { data: ownerEvent } = ownerProfile
        ? await supabase
            .from("events")
            .select("id")
            .eq("pot_owner", ownerProfile.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };

      if (ownerEvent?.id) {
        await supabase.from("pot_payouts").upsert(
          {
            event_id: ownerEvent.id,
            stripe_payout_id: payout.id,
            amount_cents: payout.amount,
            status: event.type === "payout.paid" ? "paid" : "failed",
            arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : null,
          },
          { onConflict: "stripe_payout_id" },
        );
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

// `pot_close_at_goal` (brief) : une fois l'objectif atteint, ferme la
// cagnotte automatiquement -- sans effet en mode `open` (pas d'objectif).
async function maybeCloseCompletedPot(eventId: string) {
  const { data: eventRow } = await supabase
    .from("events")
    .select("pot_mode, pot_goal_cents, pot_close_at_goal, pot_closed_at")
    .eq("id", eventId)
    .single();

  if (!eventRow || eventRow.pot_mode !== "goal" || !eventRow.pot_close_at_goal || eventRow.pot_closed_at) return;
  if (!eventRow.pot_goal_cents) return;

  const { data: succeeded } = await supabase
    .from("pot_contributions")
    .select("net_cents")
    .eq("event_id", eventId)
    .eq("status", "succeeded");

  const total = (succeeded ?? []).reduce((sum, row) => sum + (row.net_cents ?? 0), 0);
  if (total >= eventRow.pot_goal_cents) {
    await supabase.from("events").update({ pot_closed_at: new Date().toISOString() }).eq("id", eventId);
  }
}
