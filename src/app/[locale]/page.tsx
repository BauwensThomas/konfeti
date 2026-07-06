import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-lg">{t("subtitle")}</p>
    </main>
  );
}
