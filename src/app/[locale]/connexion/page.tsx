import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/LoginForm";

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("Login");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 text-center sm:py-24">
      <Image
        src="/mascot.webp"
        alt="La mascotte Konfeti"
        width={200}
        height={200}
        priority
        className="w-32"
      />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold text-primary">
          {t("heading")}
        </h1>
        <p className="text-base text-foreground/80">{t("subheading")}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {t("errorAuth")}
        </p>
      )}

      <LoginForm />
    </main>
  );
}
