import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { FeatureFlagToggle } from "@/components/admin/FeatureFlagToggle";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Labels + descriptions FR en dur (pas de colonne label/description sur
// feature_flags), brief 4.17. "recos" reste noté V2 dans le brief (encarts
// pub discrets), reporté sur décision de Thomas : flag gardé mais inerte
// pour l'instant, description honnête plutôt que de laisser croire qu'il
// change quelque chose aujourd'hui.
const FLAG_INFO: Record<string, { label: string; description: string }> = {
  pot: {
    label: "Cagnotte",
    description: "Active la cagnotte (Stripe Connect) sur les événements.",
  },
  recos: {
    label: "Recommandations locales",
    description: "Fonctionnalité V2, pas encore construite. Ce flag n'a aucun effet pour l'instant.",
  },
  chat_photos: {
    label: "Photos dans le chat",
    description: "Coupe-circuit global : désactivé, plus personne ne peut envoyer de photo dans le chat, sur aucun événement.",
  },
};

export default async function AdminFlagsPage() {
  const { data: flags } = await serviceRoleClient().from("feature_flags").select("key, enabled").order("key");

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="font-display text-lg font-bold text-foreground">Feature flags</h1>
      <ul className="flex flex-col gap-2">
        {(flags ?? []).map((flag) => {
          const info = FLAG_INFO[flag.key] ?? { label: flag.key, description: "Aucune description disponible." };
          return (
            <li key={flag.key} className="flex flex-col gap-1 rounded-konfeti border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{info.label}</span>
                <FeatureFlagToggle flagKey={flag.key} enabled={flag.enabled} />
              </div>
              <p className="text-xs text-foreground/60">{info.description}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
