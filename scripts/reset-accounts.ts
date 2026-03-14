import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.account.deleteMany({
    where: { provider: "google" },
  });
  console.log(`Deleted ${result.count} Google account records.`);
  console.log("Users will get fresh OAuth tokens (with new scopes) on next login.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
