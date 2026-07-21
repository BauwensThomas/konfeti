"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/Modal";

type Step = { number: number; text: string; imageSrc: string | null; alt: string };
type Platform = "android" | "ios";

// Retour Thomas : "il faut d'abord pouvoir choisir entre android ou ios,
// ensuite on affiche que ce que l'on a choisi... et c'est 1, puis l'image, 2
// puis l'image..." + "l'image doit être cliquable pour agrandir" -- composant
// client séparé de `page.tsx` (qui reste un Server Component pour
// `getTranslations`/vérifier quelles images existent déjà sur disque) :
// tout l'état (plateforme choisie, photo agrandie) est purement local à
// l'écran, pas besoin d'aller-retour serveur.
export function InstallGuideClient({
  choosePlatformLabel,
  androidButtonLabel,
  iosButtonLabel,
  changePlatformLabel,
  androidTitle,
  iosTitle,
  androidSteps,
  iosSteps,
  profileLinkLabel,
}: {
  choosePlatformLabel: string;
  androidButtonLabel: string;
  iosButtonLabel: string;
  changePlatformLabel: string;
  androidTitle: string;
  iosTitle: string;
  androidSteps: Step[];
  iosSteps: Step[];
  profileLinkLabel: string;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [enlarged, setEnlarged] = useState<{ src: string; alt: string } | null>(null);

  if (!platform) {
    return (
      <div className="flex w-full max-w-lg flex-col items-center gap-4">
        <p className="font-display text-lg font-bold text-foreground">{choosePlatformLabel}</p>
        <div className="grid w-full grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setPlatform("android")}
            className="rounded-konfeti border-2 border-primary/15 bg-white p-6 text-center text-base font-bold text-foreground shadow-konfeti hover:border-primary"
          >
            {androidButtonLabel}
          </button>
          <button
            type="button"
            onClick={() => setPlatform("ios")}
            className="rounded-konfeti border-2 border-primary/15 bg-white p-6 text-center text-base font-bold text-foreground shadow-konfeti hover:border-primary"
          >
            {iosButtonLabel}
          </button>
        </div>
      </div>
    );
  }

  const steps = platform === "android" ? androidSteps : iosSteps;
  const title = platform === "android" ? androidTitle : iosTitle;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={() => setPlatform(null)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {changePlatformLabel}
        </button>
      </div>

      <ol className="flex flex-col gap-10">
        {steps.map((step) => (
          <li key={step.number} className="flex flex-col gap-2">
            <div className="flex gap-2 text-sm text-foreground/80">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {step.number}
              </span>
              {step.text}
            </div>
            {step.imageSrc ? (
              <button
                type="button"
                onClick={() => setEnlarged({ src: step.imageSrc!, alt: step.alt })}
                className="w-full max-w-55 overflow-hidden rounded-konfeti border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- capture d'écran fournie par Thomas, agrandissable au clic */}
                <img src={step.imageSrc} alt={step.alt} className="w-full" />
              </button>
            ) : (
              <div className="flex aspect-9/16 w-full max-w-55 items-center justify-center rounded-konfeti border-2 border-dashed border-primary/20 bg-surface p-2 text-center text-[11px] text-foreground/40">
                {step.alt}
              </div>
            )}
          </li>
        ))}
      </ol>

      <Link href="/profil" className="self-start text-sm font-semibold text-primary hover:underline">
        {profileLinkLabel}
      </Link>

      <Modal open={!!enlarged} onClose={() => setEnlarged(null)} className="max-w-2xl p-2">
        {enlarged && (
          // eslint-disable-next-line @next/next/no-img-element -- agrandissement au clic de la même capture
          <img src={enlarged.src} alt={enlarged.alt} className="max-h-[85vh] w-full rounded-konfeti object-contain" />
        )}
      </Modal>
    </div>
  );
}
