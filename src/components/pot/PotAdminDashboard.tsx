import { getTranslations } from "next-intl/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { StartOnboardingButton } from "@/components/pot/StartOnboardingButton";

// Tableau de bord cagnotte, admin uniquement (brief 4.5 : "suivi complet
// pour les admins... commission Konfeti affichée honnêtement"). Server
// Component autonome (même pattern que PollsQuotaWarningSection.tsx),
// requête directe -- réservé à l'admin par le composant appelant, jamais
// revérifié ici (même principe que le reste de l'onglet Participer).
export async function PotAdminDashboard({
  eventId,
  potOwnerId,
  viewerId,
}: {
  eventId: string;
  potOwnerId: string | null;
  viewerId: string | null;
}) {
  const t = await getTranslations("Pot");
  const supabase = await createClient();

  // Retour Thomas : seul le porteur de la cagnotte (celui qui a lié son
  // compte Stripe) voit le nom des contributeurs -- les autres admins ne
  // voient que les montants, jamais le nom ("le bouton anonyme n'a plus de
  // sens ici" -- la case à cocher a donc été retirée du formulaire de
  // contribution, l'identité est protégée par le rôle du viewer, pas par un
  // choix du contributeur).
  const isPotOwnerViewer = potOwnerId !== null && potOwnerId === viewerId;

  // Bug réel du même type que `createPotContribution` (actions/pot.ts) :
  // `profiles_select_own` (RLS) n'autorise à lire que son PROPRE profil --
  // un admin qui n'est pas le porteur de la cagnotte ne pourrait jamais lire
  // le profil du porteur avec son propre client de session. Sans effet
  // visible aujourd'hui (le bouton plus bas est de toute façon déjà gaté par
  // `potOwnerId === viewerId`), mais fragile si ce champ sert un jour à
  // autre chose -- client service-role ici, par cohérence.
  const admin = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [{ data: contributions }, { data: payouts }, { data: ownerProfile }] = await Promise.all([
    supabase
      .from("pot_contributions")
      .select(
        "id, amount_cents, fee_stripe_cents, fee_konfeti_cents, net_cents, status, created_at, rsvps(profile_id, first_name, last_name)",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          amount_cents: number;
          fee_stripe_cents: number;
          fee_konfeti_cents: number;
          net_cents: number;
          status: string;
          created_at: string;
          rsvps: { profile_id: string | null; first_name: string | null; last_name: string | null } | null;
        }[]
      >(),
    supabase
      .from("pot_payouts")
      .select("id, amount_cents, status, arrival_date, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    potOwnerId
      ? admin.from("profiles").select("stripe_onboarding_complete").eq("id", potOwnerId).single()
      : Promise.resolve({ data: null }),
  ]);

  const succeeded = (contributions ?? []).filter((c) => c.status === "succeeded");
  const totalNetCents = succeeded.reduce((sum, c) => sum + (c.net_cents ?? 0), 0);
  const totalKonfetiFeeCents = succeeded.reduce((sum, c) => sum + (c.fee_konfeti_cents ?? 0), 0);

  // Bug réel signalé par Thomas : "je vois un invité a payé et plus la vraie
  // personne qui a payé avant de quitter" -- une fois parti, la ligne rsvps
  // est anonymisée (voir `leave_or_remove_participant`), donc la jointure
  // ci-dessus revient vide même si la contribution, elle, reste bien réelle.
  // `profile_id` n'est lui jamais effacé au départ -- seule source
  // d'identité encore disponible pour retrouver le vrai nom.
  const missingNameProfileIds = succeeded
    .filter((c) => !c.rsvps?.first_name && c.rsvps?.profile_id)
    .map((c) => c.rsvps!.profile_id!);
  const realNameByProfileId = new Map<string, { first_name: string | null; last_name: string | null }>();
  if (isPotOwnerViewer && missingNameProfileIds.length > 0) {
    const { data: realProfiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", missingNameProfileIds);
    for (const p of realProfiles ?? []) {
      realNameByProfileId.set(p.id, p);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-konfeti border-2 border-primary/15 bg-white p-4 text-left">
      <p className="font-display text-lg font-bold text-foreground">{t("adminHeading")}</p>

      {/* Réservé au VRAI porteur de la cagnotte (retour Thomas : un autre
          admin voyait ce bouton alors qu'il échouerait pour lui -- pas un
          souci de sécurité, `startPotOnboarding` vérifie déjà ça
          côté serveur, mais un bouton trompeur affiché à la mauvaise
          personne). Le reste du tableau de bord reste visible de tous les
          admins, mais les noms des contributeurs restent réservés au porteur
          de la cagnotte (voir `isPotOwnerViewer` plus haut). */}
      {!ownerProfile?.stripe_onboarding_complete && potOwnerId && potOwnerId === viewerId && (
        <StartOnboardingButton eventId={eventId} />
      )}

      <p className="text-sm text-foreground">{t("adminTotalCollected", { total: (totalNetCents / 100).toFixed(2) })}</p>
      <p className="text-xs text-foreground/60">
        {t("adminKonfetiCommission", { commission: (totalKonfetiFeeCents / 100).toFixed(2) })}
      </p>

      {/* Retour Thomas : "il faut le dire dans le tableau de bord... le
          délai" -- affiché même sans historique de versement encore, pour
          fixer les attentes du porteur AVANT son premier virement. Réservé
          au porteur lui-même (c'est son délai de virement à lui, pas une
          info utile aux autres admins). */}
      {isPotOwnerViewer && <p className="text-xs text-foreground/60">{t("adminPayoutDelay")}</p>}

      {succeeded.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-foreground">
          {succeeded.map((c) => {
            // Retour Thomas : "je vois juste le prénom, je dois voir le nom
            // aussi et la date" -- nom complet toujours réservé au porteur
            // de la cagnotte (voir `isPotOwnerViewer`), la date reste visible
            // de tous les admins (elle n'identifie personne). Retour Thomas
            // suivant : "je vois un invité a payé et plus la vraie personne
            // qui a payé avant de quitter" -- repli sur `profiles` (voir
            // `realNameByProfileId` plus haut) si la ligne rsvps a été
            // anonymisée entre-temps (parti/restreint).
            const realName = c.rsvps?.profile_id ? realNameByProfileId.get(c.rsvps.profile_id) : undefined;
            const contributorName = [
              c.rsvps?.first_name ?? realName?.first_name,
              c.rsvps?.last_name ?? realName?.last_name,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="flex flex-col">
                  <span>{isPotOwnerViewer ? contributorName || t("adminContributor") : t("adminContributor")}</span>
                  <span className="text-xs text-foreground/60">
                    {new Date(c.created_at).toLocaleDateString("fr-FR")}{" "}
                    {new Date(c.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span>{((c.net_cents ?? 0) / 100).toFixed(2)}€</span>
              </li>
            );
          })}
        </ul>
      )}

      {payouts && payouts.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <p className="text-sm font-semibold text-foreground">{t("adminPayoutsHeading")}</p>
          <ul className="flex flex-col gap-1 text-sm text-foreground/80">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.arrival_date ?? "—"}</span>
                <span>{(p.amount_cents / 100).toFixed(2)}€</span>
                <span>{t(`adminPayoutStatus.${p.status}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
