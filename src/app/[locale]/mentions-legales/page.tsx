import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";
import { localizedPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return localizedPageMetadata({ locale, pathname: "/mentions-legales", title: "Mentions légales" });
}

export default async function MentionsLegalesPage() {
  const t = await getTranslations("LegalNotice");
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:konfeti@belgacai.com" className="font-semibold text-primary">
      {chunks}
    </a>
  );

  return (
    <LegalPageLayout title={t("title")} updatedAt={t("updatedAt")}>
      <LegalSection heading={t("publisherHeading")}>
        <p>{t.rich("publisherBody", { a: mailLink })}</p>
      </LegalSection>

      <LegalSection heading={t("hostingHeading")}>
        <p>{t("hostingBody")}</p>
      </LegalSection>

      <LegalSection heading={t("paymentHeading")}>
        <p>{t("paymentBody")}</p>
      </LegalSection>

      <LegalSection heading={t("ipHeading")}>
        <p>{t("ipBody")}</p>
      </LegalSection>

      <LegalSection heading={t("liabilityHeading")}>
        <p>{t("liabilityBody")}</p>
      </LegalSection>

      <LegalSection heading={t("contactHeading")}>
        <p>{t.rich("contactBody", { a: mailLink })}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
