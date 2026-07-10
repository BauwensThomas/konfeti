import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BringGauge, type BringUnit } from "@/components/bring/BringGauge";

type RawItemRow = {
  id: string;
  label: string;
  unit: BringUnit;
  quantity_needed: number;
};

// Version compacte de "qui apporte quoi" sur l'Accueil (brief 4.4, retour
// Thomas : "dès que quelqu'un a rajouté un produit, on a un histogramme en
// barre à côté, la quantité reçue sur quantité demandée"). Lecture seule
// (pas de contrôles), même `BringGauge` que la liste complète de l'onglet
// Participer -- ne s'affiche pas du tout tant qu'aucun item n'existe.
export async function BringAccueilGauges({ eventId }: { eventId: string }) {
  const supabase = await createClient();
  const t = await getTranslations("Bring");

  const { data: itemRows } = await supabase
    .from("bring_items")
    .select("id, label, unit, quantity_needed")
    .eq("event_id", eventId)
    .order("label")
    .returns<RawItemRow[]>();

  const items = itemRows ?? [];
  if (items.length === 0) return null;

  const itemIds = items.map((i) => i.id);
  const { data: claimRows } = await supabase
    .from("bring_claims")
    .select("item_id, quantity")
    .in("item_id", itemIds);

  const claimedByItem = new Map<string, number>();
  for (const claim of claimRows ?? []) {
    claimedByItem.set(claim.item_id, (claimedByItem.get(claim.item_id) ?? 0) + claim.quantity);
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="font-display text-lg font-bold text-foreground">{t("accueilHeading")}</p>
      {items.map((item) => (
        <BringGauge
          key={item.id}
          label={item.label}
          claimed={claimedByItem.get(item.id) ?? 0}
          needed={item.quantity_needed}
          unit={item.unit}
        />
      ))}
    </Card>
  );
}
