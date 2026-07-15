import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { JourJActions } from "@/components/JourJActions";
import { EventWeather } from "@/components/EventWeather";
import { ArrivalInfoBlock } from "@/components/ArrivalInfoBlock";

// Mode Jour J (brief 4.11) : bascule automatique de l'Accueil pendant toute
// la journée de l'événement (voir `isJourJ`, `src/lib/event-status.ts`).
// Adresse en grand, compteur ET liste d'arrivées (admin uniquement, conforme
// au brief), bouton "Terminer" (admin, retour Thomas). Le bloc "Rentrer" et
// la checklist "bien rentré" vivent dans `GoHomeCard.tsx`, un composant
// SÉPARÉ affiché indépendamment de cette carte (retour Thomas : "les gens qui
// rentrent chez eux" ne doivent jamais disparaître, même une fois "Terminer"
// cliqué -- voir page.tsx pour le point d'intégration). Météo (brief 4.6) :
// la fenêtre J-5 à J0 couvre aussi le jour même, donc elle doit rester
// visible ici et pas seulement dans la carte "date et lieu" remplacée par
// celle-ci (bug réel corrigé : la météo disparaissait justement le jour J).
export async function JourJCard({
  eventId,
  shortCode,
  title,
  viewerRsvpId,
  isAdmin,
  locationText,
  showWeather,
  lat,
  lng,
  dateISO,
}: {
  eventId: string;
  shortCode: string;
  title: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  locationText: string | null;
  showWeather: boolean;
  lat: number | null;
  lng: number | null;
  dateISO: string | null;
}) {
  const t = await getTranslations("JourJ");
  const supabase = await createClient();

  // Compteur ET liste d'arrivées : réservés aux admins (brief 4.11 : "les
  // admins voient en temps réel QUI est là", pas juste un chiffre) --
  // requête directe sur `rsvps`, jamais exposée aux autres participants.
  let arrivedCount = 0;
  let totalCount = 0;
  let arrivedRows: { id: string; first_name: string | null }[] = [];
  if (isAdmin) {
    const { data: approvedRows } = await supabase
      .from("rsvps")
      .select("id, first_name, checked_in_at")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .order("first_name");
    const rows = approvedRows ?? [];
    totalCount = rows.length;
    arrivedRows = rows.filter((r) => r.checked_in_at);
    arrivedCount = arrivedRows.length;
  }

  let initialCheckedIn = false;
  if (viewerRsvpId) {
    const { data: myRow } = await supabase
      .from("rsvps")
      .select("checked_in_at")
      .eq("id", viewerRsvpId)
      .maybeSingle();
    initialCheckedIn = !!myRow?.checked_in_at;
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src="/mascot-jourj.webp" alt="" width={220} height={220} className="w-52" />
        <p className="font-display text-xl font-bold text-foreground">{t("heading")}</p>
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-1">
          <p className="text-center text-sm font-semibold text-primary">
            {t("arrivedCount", { arrived: arrivedCount, total: totalCount })}
          </p>
          {/* Liste, pas juste le chiffre (brief 4.11 : "les admins voient...
              qui est là"), admin uniquement. */}
          {arrivedRows.length > 0 && (
            <ul className="mx-auto flex w-full max-w-xs flex-col gap-0.5 text-sm text-foreground">
              {arrivedRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>{r.first_name ?? t("anonymous")}</span>
                  <span className="text-accent-mint">{t("arrivedHomeCheck")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showWeather && lat !== null && lng !== null && dateISO && (
        <div className="flex justify-center">
          <EventWeather lat={lat} lng={lng} dateISO={dateISO} />
        </div>
      )}

      <ArrivalInfoBlock locationText={locationText} locationLat={lat} locationLng={lng} title={title} />

      {viewerRsvpId && (
        <JourJActions
          rsvpId={viewerRsvpId}
          shortCode={shortCode}
          isAdmin={isAdmin}
          initialCheckedIn={initialCheckedIn}
        />
      )}
    </Card>
  );
}
