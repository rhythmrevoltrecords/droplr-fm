import { createHash } from "node:crypto";
import { type AudienceMember, EspAuthError, EspListError, type EspAdapter, type EspList, type EspSyncResult } from "./types";

// Mailchimp Marketing API v3. Auth is HTTP Basic with any username + the API key, whose "-usXX"
// suffix is the datacenter and therefore the host. Nothing proprietary here — this is the public,
// documented API surface, used the way the docs say to use it.

const dc = (apiKey: string) => {
  const i = apiKey.lastIndexOf("-");
  const d = i >= 0 ? apiKey.slice(i + 1) : "";
  if (!/^[a-z]+\d+$/.test(d)) throw new EspAuthError("That doesn't look like a Mailchimp key — it should end in -us21 or similar.");
  return d;
};
const base = (apiKey: string) => `https://${dc(apiKey)}.api.mailchimp.com/3.0`;
const auth = (apiKey: string) => `Basic ${Buffer.from(`droplr:${apiKey}`).toString("base64")}`;
/** Mailchimp addresses a member by the MD5 of the lowercased email. */
const memberId = (email: string) => createHash("md5").update(email.trim().toLowerCase()).digest("hex");

async function call(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base(apiKey)}${path}`, {
    ...init,
    headers: { Authorization: auth(apiKey), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return res;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mailchimp: EspAdapter = {
  provider: "mailchimp",

  async listAudiences(apiKey) {
    const res = await call(apiKey, "/lists?count=1000&fields=lists.id,lists.name");
    if (res.status === 401 || res.status === 403) throw new EspAuthError("Mailchimp rejected that API key.");
    if (!res.ok) throw new Error(`Mailchimp /lists failed (${res.status}).`);
    const json = (await res.json()) as { lists?: { id: string; name: string }[] };
    return (json.lists ?? []).map((l): EspList => ({ id: l.id, name: l.name }));
  },

  async upsertMembers(apiKey, listId, members, opts) {
    const result: EspSyncResult = { attempted: 0, upserted: 0, failed: 0, stoppedEarly: false };
    // Modest concurrency: real per-member feedback beats Mailchimp's opaque async batch endpoint,
    // and lets us honour 429 the way the pre-save processor does.
    const CONCURRENCY = 5;
    let i = 0;

    async function worker() {
      while (i < members.length) {
        if (Date.now() > opts.deadline) {
          result.stoppedEarly = true;
          return;
        }
        const m = members[i++];
        result.attempted++;
        try {
          const ok = await upsertOne(apiKey, listId, m, opts.tag);
          if (ok) result.upserted++;
          else result.failed++;
        } catch (e) {
          if (e instanceof EspAuthError || e instanceof EspListError) throw e;
          result.failed++;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, members.length) }, worker));
    return result;
  },
};

async function upsertOne(apiKey: string, listId: string, m: AudienceMember, tag: string | null): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await call(apiKey, `/lists/${listId}/members/${memberId(m.email)}`, {
      method: "PUT",
      body: JSON.stringify({
        email_address: m.email,
        // status_if_new ONLY: a new address is added as subscribed (it had marketing consent), but we
        // never force status on an existing member — so anyone who unsubscribed in Mailchimp stays off.
        status_if_new: "subscribed",
        merge_fields: m.name ? { FNAME: m.name } : undefined,
      }),
    });
    if (res.status === 429) {
      await sleep(Math.min(2000 * (attempt + 1), 8000));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new EspAuthError("Mailchimp rejected the API key mid-sync.");
    if (res.status === 404) throw new EspListError("That Mailchimp audience no longer exists.");
    if (!res.ok) return false;
    if (tag) await call(apiKey, `/lists/${listId}/members/${memberId(m.email)}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [{ name: tag, status: "active" }] }),
    }).catch(() => {});
    return true;
  }
  return false; // exhausted 429 retries
}

// Exposed for unit tests (pure, no network).
export const mailchimpMemberId = memberId;
export const mailchimpDc = dc;
