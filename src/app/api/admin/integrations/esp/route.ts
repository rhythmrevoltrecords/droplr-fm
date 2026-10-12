import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { espAudienceCount } from "@/lib/esp/audience";
import { deleteConnection, getConnection, setConnectionSettings, upsertConnection } from "@/lib/esp/db";
import { getAdapter, syncConnectionById } from "@/lib/esp";
import { EspAuthError, isEspProvider, type EspProvider } from "@/lib/esp/types";
import { planOf } from "@/lib/plans";
import { espWebhookToken } from "@/lib/esp/webhook";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

const PROVIDER: EspProvider = "mailchimp";
const providerOf = (v: unknown): EspProvider => (isEspProvider(v) ? v : PROVIDER);

/** GET → current connection state + live audience list + how many fans a sync would push. */
export async function GET(_req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!planOf(user.organization.plan).espSync) return NextResponse.json({ connected: false, planAllows: false });

  const conn = await getConnection(user.organizationId, PROVIDER);
  const audienceCount = await espAudienceCount(user.organizationId);
  if (!conn) return NextResponse.json({ connected: false, planAllows: true, audienceCount });

  // Re-list audiences so the dropdown is current; a key gone bad shows as needs-reconnect.
  let lists: { id: string; name: string }[] = [];
  let keyOk = true;
  try {
    const key = (await import("@/lib/crypto")).decrypt(conn.apiKeyEncrypted);
    lists = await getAdapter(conn.provider).listAudiences(key);
  } catch (e) {
    keyOk = !(e instanceof EspAuthError);
  }
  return NextResponse.json({
    connected: true,
    planAllows: true,
    provider: conn.provider,
    status: keyOk ? conn.status : "error",
    listId: conn.listId,
    listName: conn.listName,
    marketingOnly: conn.marketingOnly,
    tagPrefix: conn.tagPrefix,
    lastSyncedAt: conn.lastSyncedAt,
    lastSyncedCount: conn.lastSyncedCount,
    lastError: keyOk ? conn.lastError : "Mailchimp rejected the saved API key — reconnect to fix.",
    audienceCount,
    lists,
    webhookUrl: `${SITE_URL}/api/webhooks/esp/mailchimp?org=${user.organizationId}&token=${espWebhookToken(user.organizationId)}`,
  });
}

const connectSchema = z.object({
  provider: z.string().optional(),
  apiKey: z.string().trim().min(10, "Paste your Mailchimp API key.").max(200),
});

/** POST → verify a key and save it (encrypted). Returns the audiences to choose from. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Only the account owner can change integrations." }, { status: 403 });
  if (!planOf(user.organization.plan).espSync) return NextResponse.json({ error: "Audience sync is on the paid plans." }, { status: 402 });

  const parsed = connectSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  const provider = providerOf(parsed.data.provider);

  let lists: { id: string; name: string }[];
  try {
    lists = await getAdapter(provider).listAudiences(parsed.data.apiKey);
  } catch (e) {
    if (e instanceof EspAuthError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "Couldn't reach Mailchimp. Try again in a moment." }, { status: 502 });
  }
  await upsertConnection(user.organizationId, provider, encrypt(parsed.data.apiKey));
  return NextResponse.json({ ok: true, lists });
}

const patchSchema = z.union([
  z.object({
    action: z.literal("settings"),
    listId: z.string().trim().min(1, "Pick an audience.").max(100),
    listName: z.string().trim().max(200).nullable().optional(),
    marketingOnly: z.boolean().optional(),
    tagPrefix: z.string().trim().max(40).nullable().optional(),
  }),
  z.object({ action: z.literal("sync") }),
]);

/** PATCH → save list/settings, or run a bounded "sync now". */
export async function PATCH(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Only the account owner can change integrations." }, { status: 403 });
  if (!planOf(user.organization.plan).espSync) return NextResponse.json({ error: "Audience sync is on the paid plans." }, { status: 402 });

  const conn = await getConnection(user.organizationId, PROVIDER);
  if (!conn) return NextResponse.json({ error: "Connect Mailchimp first." }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });

  if (parsed.data.action === "settings") {
    await setConnectionSettings(user.organizationId, PROVIDER, {
      listId: parsed.data.listId,
      listName: parsed.data.listName ?? null,
      marketingOnly: parsed.data.marketingOnly ?? true,
      tagPrefix: parsed.data.tagPrefix ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  // sync now: bounded so the request returns fast; the hourly job finishes anything left.
  const result = await syncConnectionById(conn.id, Date.now() + 20_000);
  if (result.error === "auth") return NextResponse.json({ error: "Mailchimp rejected the key — reconnect." }, { status: 400 });
  if (result.error === "list") return NextResponse.json({ error: "That audience no longer exists — pick one again." }, { status: 400 });
  if (result.error) return NextResponse.json({ error: "Sync failed. Try again shortly." }, { status: 502 });
  return NextResponse.json({ ok: true, upserted: result.upserted, failed: result.failed, stoppedEarly: result.stoppedEarly });
}

/** DELETE → disconnect and forget the key. */
export async function DELETE(_req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Only the account owner can change integrations." }, { status: 403 });
  await deleteConnection(user.organizationId, PROVIDER);
  return NextResponse.json({ ok: true });
}
