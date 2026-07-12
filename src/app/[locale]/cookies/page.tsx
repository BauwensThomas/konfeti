import { getTranslations } from "next-intl/server";
import { clearSession } from "@/app/[locale]/actions/auth";
import { Button } from "@/components/ui/Button";
import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";

export const metadata = { title: "Gérer les cookies" };

export default async function CookiesPage() {
  const t = await getTranslations("CookieSettings");
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:konfeti@belgacai.com" className="font-semibold text-primary">
      {chunks}
    </a>
  );

  return (
    <LegalPageLayout title={t("title")} updatedAt={t("updatedAt")}>
      <LegalSection heading={t("whatHeading")}>
        <p>{t("whatBody1")}</p>
        <p>{t("whatBody2")}</p>
      </LegalSection>

      <LegalSection heading={t("notHeading")}>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("notItem1")}</li>
          <li>{t("notItem2")}</li>
          <li>{t("notItem3")}</li>
        </ul>
        <p>{t("notBody")}</p>
      </LegalSection>

      <LegalSection heading={t("manageHeading")}>
        <p>{t("manageBody")}</p>
        <form action={clearSession}>
          <Button type="submit" variant="danger" size="sm">
            {t("manageButton")}
          </Button>
        </form>
      </LegalSection>

      <LegalSection heading={t("contactHeading")}>
        <p>{t.rich("contactBody", { a: mailLink })}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
