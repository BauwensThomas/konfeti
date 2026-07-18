import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "nl", "en", "es", "pt", "de"],
  defaultLocale: "fr",
});
