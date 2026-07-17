import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { StandaloneRedirect } from "@/components/StandaloneRedirect";
import { StickerConfetti, StickerGift } from "@/components/stickers";
import { IconGooglePlay } from "@/components/icons/SocialIcons";
import { ScreenshotGallery } from "@/components/ScreenshotGallery";
import { createClient } from "@/lib/supabase/server";

// Retour Thomas : "je lancerai pas l'app sans que tout soit en ordre donc tu
// peux deja mettre pour le playstore" -- compte Play Console déjà créé, mais
// l'app n'y est pas encore publiée : URL à remplacer par la vraie fiche une
// fois la publication faite.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.konfeti.app";

// Retour Thomas : "cache pour le moment" -- la fiche n'est pas encore
// publiée, le lien resterait cassé (404 Play Store) si affiché tel quel.
// Interrupteur `PLAY_STORE_PUBLISHED` plutôt qu'un commentaire à décommenter
// à la main : Thomas pourra basculer d'un simple changement de variable
// d'environnement (Vercel) le jour de la publication, sans nouveau
// déploiement de code. Lu côté serveur uniquement (Server Component, jamais
// envoyé au client) -- pas besoin du préfixe NEXT_PUBLIC_.
const PLAY_STORE_PUBLISHED = process.env.PLAY_STORE_PUBLISHED === "true";

// Page d'explication du projet (retour Thomas : plus une page de
// pré-lancement avec vidéo/waitlist, mais une vraie vitrine qui donne envie
// d'utiliser l'app) -- ceux qui cliquent un lien d'invitation
// (`/e/[shortCode]`) ne passent jamais par ici, donc pas besoin d'un
// onboarding exhaustif, juste de quoi convaincre quelqu'un qui tape
// konfeti.belgacai.com directement. `StandaloneRedirect` : seul un
// lancement depuis l'icône ajoutée à l'écran d'accueil (PWA) saute cette
// page pour aller droit sur Mes événements.
export default async function Home() {
  const t = await getTranslations("Home");

  // Retour Thomas : "il faut que tout ce qui parle de la cagnotte
  // disparaisse si désactivé" -- même flag global que partout ailleurs
  // (`feature_flags`, clé 'pot'), lu ici en anonyme (policy publique dédiée,
  // `feature_flags_select_public`) puisque cette page n'exige aucune
  // connexion.
  const supabase = await createClient();
  const { data: potFlag } = await supabase.from("feature_flags").select("enabled").eq("key", "pot").maybeSingle();
  const potFeatureEnabled = !!potFlag?.enabled;

  // Vraies captures de l'app (retour Thomas : "qu'on met plusieurs images
  // vraies de l'application"), pas des icônes génériques -- prises sur un
  // événement de démonstration réel (compte + événement créés puis
  // supprimés juste après, jamais de fausses données laissées en base).
  const features: { src: string; altKey: string; titleKey: string; textKey: string }[] = [
    {
      src: "/screenshots/screenshot-chat-2.webp",
      altKey: "screenshotChatAlt",
      titleKey: "featureChatTitle",
      textKey: "featureChatText",
    },
    {
      src: "/screenshots/screenshot-bring-2.webp",
      altKey: "screenshotBringAlt",
      titleKey: "featureBringTitle",
      textKey: "featureBringText",
    },
    {
      src: "/screenshots/screenshot-jourj.webp",
      altKey: "screenshotOverviewAlt",
      titleKey: "featureOverviewTitle",
      textKey: "featureOverviewText",
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center gap-14 px-6 py-16 text-center sm:py-24">
      <StandaloneRedirect />

      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          <Image
            src="/mascot.webp"
            alt="La mascotte Konfeti, un confetti souriant qui lève les bras"
            width={500}
            height={500}
            priority
            className="w-48 sm:w-56"
          />
          <StickerConfetti className="absolute -left-10 top-2 w-10 sm:-left-14 sm:w-12" />
          <StickerGift className="absolute -right-8 bottom-4 w-9 sm:-right-12 sm:w-11" />
        </div>

        <div className="flex max-w-md flex-col gap-3">
          <h1 className="font-display text-4xl font-bold text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <p className="font-display text-xl text-foreground sm:text-2xl">{t("subtitle")}</p>
          <p className="whitespace-pre-line text-base text-foreground/80 sm:text-lg">
            {t(potFeatureEnabled ? "description" : "descriptionNoPot")}
          </p>
        </div>

        <Link href="/creer">
          <Button>{t("ctaCreate")}</Button>
        </Link>
      </div>

      <ScreenshotGallery
        items={features.map(({ src, altKey, titleKey, textKey }) => ({
          src,
          alt: t(altKey),
          titleKey,
          title: t(titleKey),
          text: t(textKey),
        }))}
      />

      <div className="flex w-full max-w-md flex-col gap-4">
        <p className="font-display text-lg font-bold text-foreground">{t("installHeading")}</p>
        <p className="text-sm text-foreground/70">{t("installIntro")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-konfeti border-2 border-primary/15 bg-white p-4 text-left">
            <p className="text-sm font-bold text-foreground">{t("installAndroidTitle")}</p>
            <p className="text-sm text-foreground/70">{t("installAndroidSteps")}</p>
            {PLAY_STORE_PUBLISHED && (
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                <IconGooglePlay className="h-5 w-5 shrink-0" />
                {t("installAndroidPlayStore")}
              </a>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-konfeti border-2 border-primary/15 bg-white p-4 text-left">
            <p className="text-sm font-bold text-foreground">{t("installIosTitle")}</p>
            <p className="text-sm text-foreground/70">{t("installIosSteps")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
