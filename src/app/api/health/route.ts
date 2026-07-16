import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { runHealthCheck } from "@/lib/health-check";

// Brief 5.8 : "Health check : route /api/health (DB, cron, Stripe
// joignables) affichée sur /admin". Protégée par la session admin (cookie),
// pas de double auth avec CRON_SECRET -- usage interne au back-office
// uniquement pour l'instant.
export async function GET() {
  await requireAdminSession();
  const result = await runHealthCheck();
  return NextResponse.json(result);
}
