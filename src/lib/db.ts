import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  if (process.env.TURSO_DATABASE_URL) {
    // Production: Turso (libSQL)
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaLibSQL(libsql as any);
    return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  // Local development: SQLite file
  return new PrismaClient();
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
