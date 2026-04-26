import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let _prisma: InstanceType<typeof PrismaClient> | null = null;

export function getPrisma() {
  if (!_prisma) {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL!;
    const adapter = new PrismaPg({ connectionString });
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}

export const prisma = new Proxy({} as InstanceType<typeof PrismaClient>, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});
