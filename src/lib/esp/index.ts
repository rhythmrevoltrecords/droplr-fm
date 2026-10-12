import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { espAudience } from "./audience";
import { getConnectionById, markStatus, recordSync } from "./db";
import { mailchimp } from "./mailchimp";
import { EspAuthError, EspListError, type EspAdapter, type EspProvider, type EspSyncResult } from "./types";

const ADAPTERS: Record<EspProvider, EspAdapter> = { mailchimp };
export function getAdapter(provider: EspProvider): EspAdapter {
  return ADAPTERS[provider];
}

/**
 * Push one connection's audience into its ESP list. Idempotent: re-running upserts the same people.
 * Records status so the UI can show "synced", "reconnect" (bad key) or "pick an audience" (gone list).
 */
export async function syncConnectionById(id: string, deadline = Date.now() + 13 * 60 * 1000): Promise<EspSyncResult> {
  const conn = await getConnectionById(id);
  if (!conn) return { attempted: 0, upserted: 0, failed: 0, stoppedEarly: false, error: "gone" };
  if (!conn.listId) {
    await markStatus(conn.id, "error", "No audience selected.");
    return { attempted: 0, upserted: 0, failed: 0, stoppedEarly: false, error: "no-list" };
  }
  // Serving-path gate: a lapsed plan stops syncing fans onward. Not a "keeps working after downgrade"
  // feature — pushing PII to a third party is an ongoing action, so it ends when the plan ends.
  const orgRow = await prisma.$queryRaw<{ plan: string | null }[]>`SELECT "plan" FROM "Organization" WHERE "id" = ${conn.organizationId} LIMIT 1`;
  if (!planOf(orgRow[0]?.plan).espSync) {
    return { attempted: 0, upserted: 0, failed: 0, stoppedEarly: false, error: "plan" };
  }
  const adapter = getAdapter(conn.provider);
  const apiKey = decrypt(conn.apiKeyEncrypted);
  const members = await espAudience(conn.organizationId);
  const tag = conn.tagPrefix?.trim() || null;

  try {
    const result = await adapter.upsertMembers(apiKey, conn.listId, members, { deadline, tag });
    if (!result.stoppedEarly) await recordSync(conn.id, result.upserted);
    return result;
  } catch (e) {
    if (e instanceof EspAuthError) {
      await markStatus(conn.id, "error", "Mailchimp rejected the API key — reconnect to fix.");
      return { attempted: members.length, upserted: 0, failed: members.length, stoppedEarly: false, error: "auth" };
    }
    if (e instanceof EspListError) {
      await markStatus(conn.id, "error", "The selected audience no longer exists — pick one again.");
      return { attempted: members.length, upserted: 0, failed: members.length, stoppedEarly: false, error: "list" };
    }
    await markStatus(conn.id, "error", e instanceof Error ? e.message.slice(0, 200) : "Sync failed.");
    return { attempted: members.length, upserted: 0, failed: members.length, stoppedEarly: false, error: "unknown" };
  }
}
