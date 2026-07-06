import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // La limite par défaut (1 Mo) est trop basse pour une vraie photo envoyée
    // depuis un téléphone ; le Server Action uploadEventPhoto la redimensionne
    // et la compresse (WebP) une fois reçue, mais elle doit d'abord arriver
    // entière. MAX_UPLOAD_BYTES (src/app/[locale]/actions/upload.ts) reste la
    // limite fonctionnelle réelle (8 Mo), un peu de marge est laissée ici
    // pour l'overhead multipart/form-data.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
