import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { EVENT_THEMES } from "@/lib/themes";

// Image de partage dynamique par événement (brief 5.7, "Open Graph dynamique").
// Basée uniquement sur `events_public_data` (titre + thème), jamais sur des
// données privées : un bot d'unfurl (WhatsApp, Messenger...) fetch cette
// route sans session authentifiée, avec au mieux les droits d'un visiteur
// non connecté (brief 1.3).
//
// Implémentée en SVG + sharp (pas `next/og`/`ImageResponse`) : ImageResponse
// embarque son propre sharp en interne, et le charger dans le même process
// que notre propre `sharp` (utilisé par les uploads de photo) corrompt
// libvips pour tout le reste du process (`sharp.libvipsVersion is not a
// function` sur toute route suivante) — voir DECISIONS.md.
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

  const theme = EVENT_THEMES.find((th) => th.key === preview?.theme) ?? EVENT_THEMES[0];
  const title = escapeXml(preview?.title ?? "Konfeti");
  const fontSize = title.length > 50 ? 40 : title.length > 30 ? 52 : 64;

  const mascotBuffer = await readFile(path.join(process.cwd(), "public", "mascot-og.png"));
  const mascotBase64 = mascotBuffer.toString("base64");

  const svg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.gradientFrom}" />
      <stop offset="100%" stop-color="${theme.gradientTo}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <image x="490" y="90" width="220" height="220" href="data:image/png;base64,${mascotBase64}" />
  <text x="600" y="440" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle">${title}</text>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png, {
    headers: {
      "content-type": "image/png",
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
