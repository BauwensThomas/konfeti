import Image from "next/image";
import { useTranslations } from "next-intl";
import { WaitlistForm } from "@/components/WaitlistForm";
import {
  StickerConfetti,
  StickerGift,
} from "@/components/stickers";

export default function Home() {
  const t = useTranslations("Home");

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-6 py-16 text-center sm:py-24">
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
        <p className="font-display text-xl text-foreground sm:text-2xl">
          {t("subtitle")}
        </p>
        <p className="whitespace-pre-line text-base text-foreground/80 sm:text-lg">
          {t("description")}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <p className="font-display text-lg text-foreground">
          {t("waitlistHeading")}
        </p>
        <WaitlistForm />
      </div>
    </main>
  );
}
