import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = await prisma.account.findMany({
    select: { userId: true, provider: true, scope: true, refresh_token: true },
  });
  for (const a of accounts) {
    console.log("userId:", a.userId);
    console.log("provider:", a.provider);
    console.log("scope:", a.scope);
    console.log("has refresh_token:", !!a.refresh_token);
    console.log("---");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
