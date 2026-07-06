import { getTranslations } from "next-intl/server";
import { ProfileCompletionForm } from "@/components/ProfileCompletionForm";

export default async function ProfileCompletionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("ProfileCompletion");
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 text-center sm:py-24">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold text-primary">
          {t("heading")}
        </h1>
        <p className="text-base text-foreground/80">{t("subheading")}</p>
      </div>

      <ProfileCompletionForm next={next ?? "/mes-evenements"} />
    </main>
  );
}
