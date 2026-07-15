import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";

export const metadata = { title: "Politique de confidentialité" };

export default async function ConfidentialitePage() {
  const t = await getTranslations("PrivacyPolicy");
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:konfeti@belgacai.com" className="font-semibold text-primary">
      {chunks}
    </a>
  );

  return (
    <LegalPageLayout title={t("title")} updatedAt={t("updatedAt")}>
      <LegalSection heading={t("whoHeading")}>
        <p>{t.rich("whoBody", { a: mailLink })}</p>
      </LegalSection>

      <LegalSection heading={t("dataHeading")}>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("dataItem1")}</li>
          <li>{t("dataItem2")}</li>
          <li>{t("dataItem3")}</li>
          <li>{t("dataItem4")}</li>
          <li>{t("dataItem5")}</li>
          <li>{t("dataItem6")}</li>
          <li>{t("dataItem7")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("whyHeading")}>
        <p>{t("whyIntro")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("whyItem1")}</li>
          <li>{t("whyItem2")}</li>
          <li>{t("whyItem3")}</li>
          <li>{t("whyItem4")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("whoSeesHeading")}>
        <p>{t("whoSeesBody1")}</p>
        <p>{t("whoSeesBody2")}</p>
      </LegalSection>

      <LegalSection heading={t("retentionHeading")}>
        <p>{t("retentionBody")}</p>
      </LegalSection>

      <LegalSection heading={t("sharingHeading")}>
        <p>{t("sharingIntro")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("sharingItem1")}</li>
          <li>{t("sharingItem2")}</li>
          <li>{t("sharingItem3")}</li>
          <li>{t("sharingItem4")}</li>
          <li>{t("sharingItem5")}</li>
        </ul>
        <p>{t("sharingBody")}</p>
      </LegalSection>

      <LegalSection heading={t("rightsHeading")}>
        <p>{t("rightsIntro")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("rightsItem1")}</li>
          <li>{t("rightsItem2")}</li>
          <li>{t.rich("rightsItem3", { a: mailLink })}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("cookiesHeading")}>
        <p>
          {t.rich("cookiesBody", {
            a: (chunks) => (
              <Link href="/cookies" className="font-semibold text-primary">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
