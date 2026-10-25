import { currentKeyPrefix, decrypt, encrypt } from "./crypto";
import { prisma } from "./db";

/**
 * Re-encrypts stored secrets that are not under the current ENCRYPTION_KEY: values made with
 * ENCRYPTION_KEY_PREVIOUS, and values from before key ids existed. Runs from the scheduled release
 * check, a batch per column per run, so rotating a key needs no script and nothing run by hand.
 *
 * A value no configured key can open is left exactly as it is and counted: overwriting it would
 * destroy the only copy, and it may open again once the right key is set.
 *
 * Every encrypted column must be listed here; test:dataprotection checks the schema against it.
 */
type Column = { model: string; field: string; required?: true };

export const ENCRYPTED_COLUMNS: Column[] = [
  { model: "organization", field: "spotifyClientIdEncrypted" },
  { model: "organization", field: "spotifyClientSecretEncrypted" },
  { model: "organization", field: "soundcloudClientIdEncrypted" },
  { model: "organization", field: "soundcloudClientSecretEncrypted" },
  { model: "preSave", field: "refreshTokenEncrypted" },
  { model: "release", field: "reportTokenEncrypted" },
  { model: "signupInvite", field: "tokenEncrypted", required: true },
  { model: "espConnection", field: "apiKeyEncrypted", required: true },
];

type Delegate = {
  findMany(a: unknown): Promise<Record<string, string | null>[]>;
  updateMany(a: unknown): Promise<{ count: number }>;
};

/**
 * Pages through each column by id, so values nothing can open are stepped over rather than
 * re-read first every run (which would stall everything behind them). Stops at `deadline` and
 * reports `remaining`; the next run starts again from the top and skips what is done.
 *
 * Each write only lands if the stored value is still the one that was read: a save completing
 * (token set to NULL) or a label reconnecting mid-sweep must not get the old value written back.
 */
export async function reencryptStale(deadline = Date.now() + 20_000, batch = 200): Promise<{ reencrypted: number; unreadable: number; remaining: boolean }> {
  let reencrypted = 0;
  let unreadable = 0;
  let remaining = false;
  for (const { model, field, required } of ENCRYPTED_COLUMNS) {
    const d = (prisma as unknown as Record<string, Delegate>)[model];
    let after: string | null = null;
    for (;;) {
      if (Date.now() > deadline) return { reencrypted, unreadable, remaining: true };
      const stale: Record<string, string | null>[] = await d.findMany({
        where: {
          ...(required ? {} : { [field]: { not: null } }),
          NOT: { [field]: { startsWith: currentKeyPrefix() } },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: { id: true, [field]: true },
        orderBy: { id: "asc" },
        take: batch,
      });
      for (const r of stale) {
        let plain: string;
        try {
          plain = decrypt(r[field]!);
        } catch {
          unreadable++;
          continue;
        }
        const done = await d.updateMany({ where: { id: r.id, [field]: r[field] }, data: { [field]: encrypt(plain) } });
        reencrypted += done.count;
      }
      if (stale.length < batch) break;
      after = stale[stale.length - 1].id!;
    }
  }
  return { reencrypted, unreadable, remaining: false };
}
