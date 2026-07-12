"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

// Bouton Partager (brief 4.2) : feuille de partage native (WhatsApp, SMS,
// copie du lien...) si le navigateur la supporte, sinon copie directe du
// lien dans le presse-papier. Bouton "QR code" séparé (brief 4.12) : le QR
// simple est généré CÔTÉ CLIENT (librairie `qrcode`, zéro coût serveur,
// conforme au brief), la carte imprimable (composée avec le thème/la
// mascotte) reste générée côté serveur (`/api/invitation-card/[shortCode]`,
// même pattern SVG + sharp que `/api/og/[shortCode]`).
export function ShareEventButton({
  title,
  url,
  shortCode,
}: {
  title: string;
  url: string;
  shortCode: string;
}) {
  const t = useTranslations("EventPage");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrOpen || qrDataUrl) return;
    QRCode.toDataURL(url, { margin: 1, width: 512, color: { dark: "#2E1065" } }).then(setQrDataUrl);
  }, [qrOpen, qrDataUrl, url]);

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Partage annulé par la personne : rien à faire.
      }
      return;
    }

    // La copie peut échouer pour des raisons hors de notre contrôle (page
    // sans focus, permission refusée, contexte non sécurisé...) : sans ce
    // try/catch, un échec silencieux ne donnait aucun retour à la personne.
    try {
      await navigator.clipboard.writeText(url);
      setError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={handleShare} className="h-11 text-sm">
        {copied ? t("shareCopied") : error ? t("shareError") : t("shareButton")}
      </Button>
      <Button variant="secondary" onClick={() => setQrOpen(true)} className="h-11 text-sm">
        {t("qrButton")}
      </Button>
      <Modal open={qrOpen} onClose={() => setQrOpen(false)}>
        <p className="font-display text-lg font-bold text-foreground">{t("qrHeading")}</p>
        <p className="text-sm text-foreground/70">{t("qrSubheading")}</p>
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client, pas un asset local optimisable par next/image
          <img src={qrDataUrl} alt="" width={256} height={256} className="mx-auto" />
        )}
        <div className="flex flex-col gap-2">
          {/* `<a download>` : jamais un `<button>` imbriqué dans le `<a>`
              (HTML invalide, contenu interactif dans du contenu interactif --
              bug réel signalé par Thomas : le clic ne déclenchait pas le
              téléchargement de façon fiable). `buttonClassName` stylise le
              lien directement, même pattern déjà utilisé ailleurs dans
              l'app pour un `Link` de navigation. */}
          {qrDataUrl && (
            <a href={qrDataUrl} download={`qr-${shortCode}.png`} className={buttonClassName({ variant: "secondary", className: "w-full" })}>
              {t("qrDownload")}
            </a>
          )}
          <a
            href={`/api/invitation-card/${shortCode}`}
            download={`invitation-${shortCode}.png`}
            className={buttonClassName({ variant: "secondary", className: "w-full" })}
          >
            {t("qrCardDownload")}
          </a>
          <Button variant="ghost" onClick={() => setQrOpen(false)}>
            {t("qrClose")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
