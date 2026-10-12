// EspConnection data access via raw SQL.
//
// Deliberately not using the generated Prisma model: the EspConnection model is new and the client
// can't be regenerated in this environment (Prisma's engine CDN is unreachable). Raw SQL needs no
// regeneration, matches how news.ts already queries, and starts returning typed model access the
// next time `prisma generate` runs on a machine with network. Columns are quoted camelCase, so rows
// come back already shaped like the type below.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EspProvider } from "./types";

export type EspConnectionRow = {
  id: string;
  organizationId: string;
  provider: EspProvider;
  apiKeyEncrypted: string;
  listId: string | null;
  listName: string | null;
  marketingOnly: boolean;
  tagPrefix: string | null;
  status: string; // active | error | disconnected
  lastError: string | null;
  lastSyncedAt: Date | null;
  lastSyncedCount: number;
  processingUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getConnection(orgId: string, provider: EspProvider): Promise<EspConnectionRow | null> {
  const rows = await prisma.$queryRaw<EspConnectionRow[]>`
    SELECT * FROM "EspConnection" WHERE "organizationId" = ${orgId} AND "provider" = ${provider} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getConnectionById(id: string): Promise<EspConnectionRow | null> {
  const rows = await prisma.$queryRaw<EspConnectionRow[]>`SELECT * FROM "EspConnection" WHERE "id" = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

/** Create or replace the key for an org+provider. Resets status to active and clears any error. */
export async function upsertConnection(orgId: string, provider: EspProvider, apiKeyEncrypted: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "EspConnection" ("id","organizationId","provider","apiKeyEncrypted","status","updatedAt")
    VALUES (gen_random_uuid()::text, ${orgId}, ${provider}, ${apiKeyEncrypted}, 'active', now())
    ON CONFLICT ("organizationId","provider")
    DO UPDATE SET "apiKeyEncrypted" = EXCLUDED."apiKeyEncrypted", "status" = 'active', "lastError" = NULL, "updatedAt" = now()`;
}

export async function setConnectionSettings(
  orgId: string,
  provider: EspProvider,
  s: { listId: string | null; listName: string | null; marketingOnly: boolean; tagPrefix: string | null },
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "EspConnection" SET "listId" = ${s.listId}, "listName" = ${s.listName},
      "marketingOnly" = ${s.marketingOnly}, "tagPrefix" = ${s.tagPrefix}, "updatedAt" = now()
    WHERE "organizationId" = ${orgId} AND "provider" = ${provider}`;
}

export async function markStatus(id: string, status: string, lastError: string | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "EspConnection" SET "status" = ${status}, "lastError" = ${lastError}, "processingUntil" = NULL, "updatedAt" = now()
    WHERE "id" = ${id}`;
}

export async function recordSync(id: string, count: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "EspConnection" SET "lastSyncedAt" = now(), "lastSyncedCount" = ${count}, "status" = 'active',
      "lastError" = NULL, "processingUntil" = NULL, "updatedAt" = now()
    WHERE "id" = ${id}`;
}

export async function deleteConnection(orgId: string, provider: EspProvider): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "EspConnection" WHERE "organizationId" = ${orgId} AND "provider" = ${provider}`;
}

/** IDs of connections with work due: configured, active, and not synced in the last 12h. */
export async function findDueEspConnections(staleHours = 12): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "EspConnection"
    WHERE "status" = 'active' AND "listId" IS NOT NULL
      AND ("lastSyncedAt" IS NULL OR "lastSyncedAt" < now() - ${Prisma.sql`make_interval(hours => ${staleHours})`})
      AND ("processingUntil" IS NULL OR "processingUntil" < now())`;
  return rows.map((r) => r.id);
}

/** Lease a connection for a sync run. Returns false if another run already holds it. */
export async function claimEspConnection(id: string, leaseMinutes = 15): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "EspConnection" SET "processingUntil" = now() + ${Prisma.sql`make_interval(mins => ${leaseMinutes})`}, "updatedAt" = now()
    WHERE "id" = ${id} AND ("processingUntil" IS NULL OR "processingUntil" < now())`;
  return n > 0;
}

/** An unsubscribe in the ESP is an opt-out from the label: mirror it onto pre-saves and imports. */
export async function markUnsubscribedByEmail(orgId: string, email: string): Promise<number> {
  const e = email.trim().toLowerCase();
  const a = await prisma.$executeRaw`
    UPDATE "PreSave" p SET "status" = 'unsubscribed'
    FROM "Release" r
    WHERE p."releaseId" = r."id" AND r."organizationId" = ${orgId} AND lower(p.email) = ${e} AND p."status" <> 'unsubscribed'`;
  const b = await prisma.$executeRaw`
    UPDATE "FanContact" SET "status" = 'unsubscribed', "updatedAt" = now()
    WHERE "organizationId" = ${orgId} AND lower("email") = ${e} AND "status" <> 'unsubscribed'`;
  return Number(a) + Number(b);
}
