import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { clearSession } from "@/app/[locale]/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { LegalPageLayout, LegalSection } from "@/components/LegalPageLayout";
import { localizedPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return localizedPageMetadata({ locale, pathname: "/cookies", title: "Gérer les cookies" });
}

export default async function CookiesPage() {
  const t = await getTranslations("CookieSettings");
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:konfeti@belgacai.com" className="font-semibold text-primary">
      {chunks}
    </a>
  );
  const adSettingsLink = (chunks: React.ReactNode) => (
    <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary">
      {chunks}
    </a>
  );

  // Même flag "ads" que la politique de confidentialité -- reste honnête :
  // "Aucun cookie publicitaire" tant que désactivé, remplacé par la vraie
  // explication AdSense dès que Thomas active la fonctionnalité.
  const supabase = await createClient();
  const { data: adsFlag } = await supabase.from("feature_flags").select("enabled").eq("key", "ads").maybeSingle();
  const adsEnabled = !!adsFlag?.enabled;

  return (
    <LegalPageLayout title={t("title")} updatedAt={t("updatedAt")}>
      <LegalSection heading={t("whatHeading")}>
        <p>{t("whatBody1")}</p>
        <p>{t("whatBody2")}</p>
      </LegalSection>

      <LegalSection heading={t("notHeading")}>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {!adsEnabled && <li>{t("notItem1")}</li>}
          <li>{t("notItem2")}</li>
          <li>{t("notItem3")}</li>
        </ul>
        <p>{t("notBody")}</p>
      </LegalSection>

      {adsEnabled && (
        <LegalSection heading={t("adsHeading")}>
          <p>{t.rich("adsBody", { a: adSettingsLink })}</p>
        </LegalSection>
      )}

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
