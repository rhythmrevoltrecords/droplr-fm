import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Rust-free Prisma client (engineType = "client") + node-postgres adapter.
// No engine binaries to ship to Netlify functions.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const connectionString =
    process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("Database URL missing: set NETLIFY_DATABASE_URL (Netlify DB) or DATABASE_URL");
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
