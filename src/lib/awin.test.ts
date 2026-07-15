import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTheForkAffiliateUrl } from "./awin";

describe("buildTheForkAffiliateUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retourne un lien TheFork direct (sans tracking) si les IDs Awin ne sont pas configurés", () => {
    vi.stubEnv("AWIN_MERCHANT_ID", "");
    vi.stubEnv("AWIN_AFFILIATE_ID", "");
    const url = buildTheForkAffiliateUrl("Chez Julie", "Bruxelles");
    expect(url).toBe("https://www.thefork.fr/search/?query=Chez%20Julie&cityName=Bruxelles");
  });

  it("retourne un lien TheFork direct sans ville si elle n'est pas fournie", () => {
    vi.stubEnv("AWIN_MERCHANT_ID", "");
    vi.stubEnv("AWIN_AFFILIATE_ID", "");
    const url = buildTheForkAffiliateUrl("Chez Julie", null);
    expect(url).toBe("https://www.thefork.fr/search/?query=Chez%20Julie");
  });

  it("enveloppe le lien via awin1.com/cread.php quand les deux IDs sont configurés", () => {
    vi.stubEnv("AWIN_MERCHANT_ID", "12345");
    vi.stubEnv("AWIN_AFFILIATE_ID", "67890");
    const url = buildTheForkAffiliateUrl("Chez Julie", "Bruxelles");
    expect(url).toBe(
      "https://www.awin1.com/cread.php?awinmid=12345&awinaffid=67890&clickref=&p=" +
        encodeURIComponent("https://www.thefork.fr/search/?query=Chez%20Julie&cityName=Bruxelles"),
    );
  });

  it("n'enveloppe pas le lien si un seul des deux IDs est configuré", () => {
    vi.stubEnv("AWIN_MERCHANT_ID", "12345");
    vi.stubEnv("AWIN_AFFILIATE_ID", "");
    const url = buildTheForkAffiliateUrl("Chez Julie", null);
    expect(url).toBe("https://www.thefork.fr/search/?query=Chez%20Julie");
  });
});
