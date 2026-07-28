import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";
import { localizedPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return localizedPageMetadata({ locale, pathname: "/cgu", title: "Conditions générales d'utilisation" });
}

export default async function CguPage() {
  const t = await getTranslations("Terms");
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:konfeti@belgacai.com" className="font-semibold text-primary">
      {chunks}
    </a>
  );

  return (
    <LegalPageLayout title={t("title")} updatedAt={t("updatedAt")}>
      <LegalSection heading={t("objectHeading")}>
        <p>{t("objectBody")}</p>
      </LegalSection>

      <LegalSection heading={t("accountHeading")}>
        <p>{t("accountBody")}</p>
      </LegalSection>

      <LegalSection heading={t("rulesHeading")}>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("rulesItem1")}</li>
          <li>{t("rulesItem2")}</li>
          <li>{t("rulesItem3")}</li>
          <li>{t("rulesItem4")}</li>
        </ul>
        <p>{t("rulesBody")}</p>
      </LegalSection>

      <LegalSection heading={t("potHeading")}>
        <p>{t("potBody")}</p>
      </LegalSection>

      <LegalSection heading={t("liabilityHeading")}>
        <p>{t("liabilityBody1")}</p>
        <p>{t("liabilityBody2")}</p>
      </LegalSection>

      <LegalSection heading={t("deleteHeading")}>
        <p>{t("deleteBody")}</p>
      </LegalSection>

      <LegalSection heading={t("changesHeading")}>
        <p>{t("changesBody")}</p>
      </LegalSection>

      <LegalSection heading={t("contactHeading")}>
        <p>{t.rich("contactBody", { a: mailLink })}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
