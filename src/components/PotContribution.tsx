"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createPotContribution } from "@/app/[locale]/actions/pot";
import { feeBreakdownFromNet } from "@/lib/pot-fees";
import { Button } from "@/components/ui/Button";
import { StickerConfetti } from "@/components/stickers";

const SUGGESTED_AMOUNTS_CENTS = [1000, 2000, 5000, 10000];

// Contribution à la cagnotte (brief 4.5/5.6) : le contributeur choisit le
// NET qu'il veut voir arriver dans la cagnotte (retour Thomas explicite,
// "je veux X€ NET dans la cagnotte"), le détail des frais se recalcule en
// direct (pur calcul, `feeBreakdownFromNet` est une fonction pure -- aucun
// aller-retour serveur nécessaire juste pour l'affichage).
export function PotContribution({
  eventId,
  label,
  mode,
  goalCents,
  collectedCents,
  closedAt,
}: {
  eventId: string;
  label: string | null;
  mode: "goal" | "open";
  goalCents: number | null;
  collectedCents: number;
  // Retour Thomas ("est-ce que tout est bien activé si on coche [fermer
  // automatiquement] ?") : le serveur bloquait déjà tout nouveau paiement
  // une fois posé, mais rien ne le disait AVANT que quelqu'un remplisse le
  // formulaire pour rien -- affiché ici en priorité, avant même le
  // formulaire.
  closedAt: string | null;
}) {
  const t = useTranslations("Pot");
  const [netEuros, setNetEuros] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const netCents = Math.round(Number(netEuros.replace(",", ".")) * 100);
  const breakdown = Number.isFinite(netCents) && netCents > 0 ? feeBreakdownFromNet(netCents) : null;

  function handleContribute() {
    setError(null);
    if (!breakdown) return;
    startTransition(async () => {
      const result = await createPotContribution({ eventId, netCents: breakdown.netCents });
      if (result.ok) {
        window.location.href = result.url;
      } else {
        setError(t(`error.${result.error}`));
      }
    });
  }

  if (closedAt) {
    return (
      <div className="flex flex-col gap-3 rounded-konfeti border-2 border-border bg-canvas p-6">
        <p className="font-display text-lg font-bold text-foreground">{t("heading")}</p>
        {label && <p className="text-sm text-foreground/80">{label}</p>}
        <div className="flex flex-col items-center gap-2 text-center">
          <StickerConfetti className="h-12 w-12" />
          <p className="font-display text-2xl font-bold text-foreground">{t("closedTitle")}</p>
          <p className="text-lg font-semibold text-foreground/80">{(collectedCents / 100).toFixed(2)}€</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-konfeti border-2 border-primary/15 bg-white p-4 text-left">
      <p className="font-display text-lg font-bold text-foreground">{t("heading")}</p>
      {label && <p className="text-sm text-foreground/80">{label}</p>}
      {/* Retour Thomas : "ça doit être affiché que si on choisit un montant
          fixe... aucun montant si c'est cagnotte libre" -- même principe que
          l'Accueil (pas de total exposé sans objectif à comparer). */}
      {mode === "goal" && goalCents && (
        <p className="text-sm text-foreground/70">
          {t("progressGoal", { collected: (collectedCents / 100).toFixed(2), goal: (goalCents / 100).toFixed(2) })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_AMOUNTS_CENTS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setNetEuros((amount / 100).toString())}
            className="rounded-full border-2 border-primary/20 px-3 py-1 text-sm font-semibold text-primary"
          >
            {(amount / 100).toFixed(0)}€
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-left text-sm text-foreground">
        {t("amountLabel")}
        <input
          type="number"
          min="1"
          step="0.5"
          value={netEuros}
          onChange={(e) => setNetEuros(e.target.value)}
          className="rounded-konfeti border-2 border-border px-3 py-2"
        />
      </label>

      {breakdown && (
        <div className="flex flex-col gap-0.5 rounded-konfeti bg-surface p-3 text-sm text-foreground/80">
          <p className="flex items-center justify-between font-semibold text-foreground">
            <span>{t("feeBreakdownTotal")}</span>
            <span>{(breakdown.grossCents / 100).toFixed(2)}€</span>
          </p>
          <p className="flex items-center justify-between pl-3">
            <span>{t("feeBreakdownFees")}</span>
            <span>{((breakdown.stripeFeeCents + breakdown.konfetiFeeCents) / 100).toFixed(2)}€</span>
          </p>
          <p className="mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold text-foreground">
            <span>{t("feeBreakdownNet")}</span>
            <span>{(breakdown.netCents / 100).toFixed(2)}€</span>
          </p>
        </div>
      )}

      <p className="text-xs text-foreground/60">{t("finalNotice")}</p>

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      <Button variant="secondary" className="w-full" onClick={handleContribute} disabled={isPending || !breakdown}>
        {isPending ? t("contributing") : `+ ${t("contributeButton")}`}
      </Button>
    </div>
  );
}
