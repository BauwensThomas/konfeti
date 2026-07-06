import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAY_MS = 24 * 60 * 60 * 1000;

function baseEvent(overrides: Record<string, unknown>) {
  return {
    id: randomUUID(),
    short_code: `PURGE-${Math.floor(1000 + Math.random() * 9000)}`,
    title: "Événement de test purge",
    theme: "generic",
    date_mode: "fixed",
    location_text: "Test",
    status: "active",
    ...overrides,
  };
}

test("le job de purge supprime les événements annulés ou terminés depuis plus de 90 jours, pas les autres", async ({
  request,
}) => {
  const { data: userData } = await supabaseAdmin.auth.admin.createUser({
    email: `e2e-purge-${Date.now()}@example.com`,
    email_confirm: true,
  });
  const hostId = userData!.user!.id;

  const oldCancelled = baseEvent({
    status: "cancelled",
    cancelled_at: new Date(Date.now() - 100 * DAY_MS).toISOString(),
    starts_at: new Date(Date.now() - 100 * DAY_MS).toISOString(),
    host_id: hostId,
  });
  const oldFinished = baseEvent({
    starts_at: new Date(Date.now() - 100 * DAY_MS).toISOString(),
    host_id: hostId,
  });
  const recentCancelled = baseEvent({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    host_id: hostId,
  });

  try {
    const { error: insertError } = await supabaseAdmin
      .from("events")
      .insert([oldCancelled, oldFinished, recentCancelled]);
    expect(insertError).toBeNull();

    // Mauvais secret : rien ne doit être purgé
    const unauthorized = await request.get("/api/cron/purge-old-events", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(unauthorized.status()).toBe(401);

    const { data: stillThere } = await supabaseAdmin
      .from("events")
      .select("id")
      .in("id", [oldCancelled.id, oldFinished.id, recentCancelled.id]);
    expect(stillThere).toHaveLength(3);

    // Bon secret : les 2 vieux événements disparaissent, le récent reste
    const response = await request.get("/api/cron/purge-old-events", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.purged).toBeGreaterThanOrEqual(2);

    const { data: remaining } = await supabaseAdmin
      .from("events")
      .select("id")
      .in("id", [oldCancelled.id, oldFinished.id, recentCancelled.id]);
    expect(remaining?.map((e) => e.id)).toEqual([recentCancelled.id]);
  } finally {
    await supabaseAdmin.from("events").delete().eq("id", recentCancelled.id);
    await supabaseAdmin.auth.admin.deleteUser(hostId);
  }
});
