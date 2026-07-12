import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { EVENT_THEMES } from "@/lib/themes";

// Carte imprimable A5 (brief 4.12) : aux couleurs du thème, mascotte, titre
// et QR code -- pointe vers le lien d'invitation, jamais de détail privé
// (adresse, date) : comme le lien lui-même, elle peut circuler avant toute
// validation (invitations papier, communions, mariages, anniversaires de
// grands-parents). Même pattern SVG + sharp que `/api/og/[shortCode]` (pas
// `next/og`/`ImageResponse`, qui corrompt `sharp` pour le reste du process --
// voir DECISIONS.md), basé uniquement sur `events_public_data` (titre +
// thème), jamais de données privées.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;
  const supabase = await createClient();
  const { data: preview } = await supabase
    .from("events_public_data")
    .select("title, theme")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!preview) {
    return new Response("Not found", { status: 404 });
  }

  const theme = EVENT_THEMES.find((th) => th.key === preview.theme) ?? EVENT_THEMES[0];
  const title = escapeXml(preview.title);
  const fontSize = title.length > 40 ? 44 : title.length > 24 ? 56 : 68;

  const mascotBuffer = await readFile(path.join(process.cwd(), "public", "mascot-og.png"));
  const mascotBase64 = mascotBuffer.toString("base64");

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${shortCode}`;
  const qrDataUrl = await QRCode.toDataURL(inviteUrl, { margin: 1, width: 720, color: { dark: "#2E1065" } });

  // A5 portrait à 300 DPI (148 x 210mm).
  const width = 1748;
  const height = 2480;

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.gradientFrom}" />
      <stop offset="100%" stop-color="${theme.gradientTo}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <image x="${width / 2 - 340}" y="160" width="680" height="680" href="data:image/png;base64,${mascotBase64}" />
  <text x="${width / 2}" y="1060" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle">${title}</text>
  <text x="${width / 2}" y="1140" font-family="sans-serif" font-size="34" fill="white" text-anchor="middle">Scanne pour découvrir l'invitation</text>
  <rect x="${width / 2 - 400}" y="1220" width="800" height="800" rx="40" fill="white" />
  <image x="${width / 2 - 360}" y="1260" width="720" height="720" href="${qrDataUrl}" />
  <text x="${width / 2}" y="${height - 100}" font-family="sans-serif" font-size="30" fill="white" text-anchor="middle" opacity="0.85">konfeti.belgacai.com</text>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="invitation-${shortCode}.png"`,
      "cache-control": "public, max-age=3600",
    },
  });
}

function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}
