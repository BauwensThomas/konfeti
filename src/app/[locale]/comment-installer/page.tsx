import { existsSync } from "fs";
import path from "path";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { InstallGuideClient } from "@/components/InstallGuideClient";

// Retour Thomas : lien depuis "Mes événements" vers une page dédiée
// expliquant comment installer la PWA, avec captures d'écran réelles (pas
// seulement le court texte déjà présent sur la landing, `Home.install*` dans
// `page.tsx`) -- + rappel explicite que les notifications (réponses, chat,
// rappels) n'existent QUE via l'app installée (`usePushSubscription`,
// `isStandalone`). Choix de la plateforme (Android/iPhone) puis étapes
// entrelacées texte+image cliquable pour agrandir : voir `InstallGuideClient.tsx`
// (composant client, l'interactivité vit là) -- cette page (Server Component)
// se contente de vérifier quelles captures existent déjà sur disque
// (`public/install-guide/*.webp`, fournies progressivement par Thomas) et de
// résoudre les traductions.
function imageSrcIfExists(filename: string): string | null {
  const publicPath = path.join(process.cwd(), "public", "install-guide", filename);
  return existsSync(publicPath) ? `/install-guide/${filename}` : null;
}

export default async function InstallGuidePage() {
  const t = await getTranslations("InstallGuide");

  function sharedNotificationSteps() {
    return [
      { number: 4, text: t("step4"), imageSrc: imageSrcIfExists("notifications-4.webp"), alt: t("step4Alt") },
      { number: 5, text: t("step5"), imageSrc: imageSrcIfExists("notifications-5.webp"), alt: t("step5Alt") },
    ];
  }

  const androidSteps = [
    { number: 1, text: t("androidStep1"), imageSrc: imageSrcIfExists("android-1.webp"), alt: t("androidStep1Alt") },
    { number: 2, text: t("androidStep2"), imageSrc: imageSrcIfExists("android-2.webp"), alt: t("androidStep2Alt") },
    { number: 3, text: t("androidStep3"), imageSrc: imageSrcIfExists("android-3.webp"), alt: t("androidStep3Alt") },
    ...sharedNotificationSteps(),
  ];

  const iosSteps = [
    { number: 1, text: t("iosStep1"), imageSrc: imageSrcIfExists("ios-1.webp"), alt: t("iosStep1Alt") },
    { number: 2, text: t("iosStep2"), imageSrc: imageSrcIfExists("ios-2.webp"), alt: t("iosStep2Alt") },
    { number: 3, text: t("iosStep3"), imageSrc: imageSrcIfExists("ios-3.webp"), alt: t("iosStep3Alt") },
    ...sharedNotificationSteps(),
  ];

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-12 sm:py-16">
      <div className="flex w-full max-w-lg flex-col items-center gap-3 text-center">
        <Image src="/mascot.webp" alt="" width={100} height={100} priority className="w-20" />
        <h1 className="font-display text-2xl font-bold text-primary sm:text-3xl">{t("heading")}</h1>
        <p className="text-base text-foreground/70">{t("intro")}</p>
        <p className="rounded-konfeti bg-primary/10 p-3 text-sm font-semibold text-primary">
          {t("notificationsNote")}
        </p>
      </div>

      <InstallGuideClient
        choosePlatformLabel={t("choosePlatform")}
        androidButtonLabel={t("androidButton")}
        iosButtonLabel={t("iosButton")}
        changePlatformLabel={t("changePlatform")}
        androidTitle={t("androidTitle")}
        iosTitle={t("iosTitle")}
        androidSteps={androidSteps}
        iosSteps={iosSteps}
        profileLinkLabel={t("profileLink")}
      />
    </main>
  );
}
