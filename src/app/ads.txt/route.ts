// Requis par Google AdSense pour éviter la revente non autorisée de
// l'inventaire publicitaire (voir AdBanner.tsx) -- vide tant qu'aucun
// identifiant AdSense réel n'est configuré, comme le reste de la
// fonctionnalité pub (feature_flags "ads").
export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  if (!clientId) {
    return new Response("", { headers: { "Content-Type": "text/plain" } });
  }

  const publisherId = clientId.replace(/^ca-/, "");
  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
