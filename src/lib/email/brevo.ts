// Client Brevo minimal (appel REST direct, pas le SDK `@getbrevo/brevo` --
// voir DECISIONS.md : décision de ne dépendre que de la doc officielle,
// aucun skill/paquet superflu). `BREVO_API_KEY`/`EMAIL_FROM` déjà déclarés
// dans `.env.example` depuis la Phase 0, jamais utilisés jusqu'ici.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function parseSender(): { name: string; email: string } {
  const raw = process.env.EMAIL_FROM ?? "Konfeti <konfeti@belgacai.com>";
  const match = raw.match(/^(.*)<(.+)>$/);
  if (!match) return { name: "Konfeti", email: raw.trim() };
  return { name: match[1].trim(), email: match[2].trim() };
}

/**
 * Envoie un email transactionnel via l'API Brevo. Ne lève jamais
 * d'exception (les relances/rappels sont un bonus, jamais bloquant pour le
 * reste de l'app -- même philosophie que `fetchPeriodForecasts`, météo) :
 * un échec est juste loggé et renvoie `false`, à l'appelant de décider s'il
 * doit réessayer plus tard (le cron, idempotent, retentera au prochain
 * passage puisque `reminder_*_sent_at` ne sera pas posé).
 */
export async function sendTransactionalEmail({
  to,
  toName,
  subject,
  html,
}: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("BREVO_API_KEY manquante : email non envoyé.");
    return false;
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(),
        to: [{ email: to, name: toName }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Échec envoi Brevo:", response.status, body);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Échec envoi Brevo:", error);
    return false;
  }
}
