import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EventFinishedActions } from "@/components/EventFinishedActions";

// Événement terminé (`isEventOver` : surlendemain civil automatique OU
// bouton "Terminer" cliqué par un admin, brief 4.11) : remplace la carte
// Jour J/date-adresse habituelle. Contrairement à la première version de ce
// chantier (retirée, voir DECISIONS.md), le bloc "Rentrer"/"bien rentré"
// reste affiché séparément (`GoHomeCard.tsx`, page.tsx) -- cette carte ne
// gère plus que le message de fin + la mascotte.
export async function EventFinishedCard({
  eventId,
  shortCode,
  title,
  isAdmin,
}: {
  eventId: string;
  shortCode: string;
  title: string;
  isAdmin: boolean;
}) {
  const t = await getTranslations("JourJ");

  return (
    <Card className="flex flex-col items-center gap-2 text-center">
      <Image src="/mascot-finish.webp" alt="" width={220} height={220} className="w-52" />
      <p className="font-display text-xl font-bold text-foreground">{t("finishedHeading", { title })}</p>
      {isAdmin && <EventFinishedActions eventId={eventId} shortCode={shortCode} />}
    </Card>
  );
}
