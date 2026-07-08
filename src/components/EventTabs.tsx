"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type TabKey = "accueil" | "chat" | "personnes" | "participer";

const TABS: TabKey[] = ["accueil", "chat", "personnes", "participer"];

export function EventTabs({
  accueil,
  personnes,
  pendingCount = 0,
}: {
  accueil: ReactNode;
  personnes?: ReactNode;
  pendingCount?: number;
}) {
  const t = useTranslations("EventPage");
  const [active, setActive] = useState<TabKey>("accueil");

  return (
    <div className="flex w-full max-w-lg lg:max-w-2xl flex-col gap-4">
      <div className="flex rounded-full bg-surface p-1 shadow-konfeti">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`relative flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              active === tab ? "bg-primary text-white" : "text-foreground/70"
            }`}
          >
            {t(`tabs.${tab}`)}
            {tab === "personnes" && pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-coral px-1 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {active === "accueil" ? (
        accueil
      ) : active === "personnes" && personnes ? (
        personnes
      ) : (
        <p className="py-16 text-center text-sm text-foreground/60">{t("comingSoon")}</p>
      )}
    </div>
  );
}
