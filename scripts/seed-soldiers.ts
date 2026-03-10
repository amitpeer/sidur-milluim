import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SOLDIERS: { name: string; roles: string[] }[] = [
  // 8 drivers
  { name: "יוסי כהן", roles: ["driver"] },
  { name: "אורי לוי", roles: ["driver"] },
  { name: "תומר אברהם", roles: ["driver"] },
  { name: "עידן פרץ", roles: ["driver"] },
  { name: "רועי מזרחי", roles: ["driver"] },
  { name: "איתי דוד", roles: ["driver"] },
  { name: "נדב ביטון", roles: ["driver"] },
  { name: "גל שמעון", roles: ["driver"] },
  // 4 navigators
  { name: "אלון חדד", roles: ["navigator"] },
  { name: "דור אוחיון", roles: ["navigator"] },
  { name: "ניר ממן", roles: ["navigator"] },
  { name: "עומר גבאי", roles: ["navigator"] },
  // 6 commanders
  { name: "יונתן רוזנברג", roles: ["commander"] },
  { name: "אריאל שפירא", roles: ["commander"] },
  { name: "מאור גולדשטיין", roles: ["commander"] },
  { name: "בן צור", roles: ["commander"] },
  { name: "שי קפלן", roles: ["commander"] },
  { name: "עמית ברק", roles: ["commander"] },
  // 2 with no specific role
  { name: "ליאור סבג", roles: [] },
  { name: "דניאל חזן", roles: [] },
];

async function main() {
  // Find the active season
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!season) {
    console.error("No active season found");
    process.exit(1);
  }

  console.log(`Using season: ${season.name} (${season.id})`);

  // Create admin user matanfeuer@gmail.com
  let adminUser = await prisma.user.findUnique({
    where: { email: "matanfeuer@gmail.com" },
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: { email: "matanfeuer@gmail.com", name: "מתן פויער" },
    });
    console.log("Created admin user: matanfeuer@gmail.com");
  } else {
    console.log("Admin user already exists: matanfeuer@gmail.com");
  }

  // Create or get admin soldier profile
  const adminProfile = await prisma.soldierProfile.upsert({
    where: { userId: adminUser.id },
    create: {
      userId: adminUser.id,
      fullName: "מתן פויער",
      roles: ["commander"],
    },
    update: {},
  });

  // Add admin as season member
  await prisma.seasonMember.upsert({
    where: {
      seasonId_soldierProfileId: {
        seasonId: season.id,
        soldierProfileId: adminProfile.id,
      },
    },
    create: {
      seasonId: season.id,
      soldierProfileId: adminProfile.id,
      role: "admin",
    },
    update: { role: "admin" },
  });
  console.log("Admin added to season as admin");

  // Create 20 soldiers
  for (const soldier of SOLDIERS) {
    const email = soldier.name
      .replace(/\s+/g, ".")
      .toLowerCase()
      .replace(/[^a-z.]/g, "") + "@test.com";

    // Use a deterministic fake email
    const fakeMail = `soldier.${SOLDIERS.indexOf(soldier) + 1}@test.com`;

    let user = await prisma.user.findUnique({ where: { email: fakeMail } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: fakeMail, name: soldier.name },
      });
    }

    const profile = await prisma.soldierProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName: soldier.name,
        roles: soldier.roles,
      },
      update: {
        fullName: soldier.name,
        roles: soldier.roles,
      },
    });

    await prisma.seasonMember.upsert({
      where: {
        seasonId_soldierProfileId: {
          seasonId: season.id,
          soldierProfileId: profile.id,
        },
      },
      create: {
        seasonId: season.id,
        soldierProfileId: profile.id,
        role: "soldier",
      },
      update: {},
    });

    console.log(`Added soldier: ${soldier.name} (${soldier.roles.join(", ") || "no role"})`);
  }

  console.log("\nDone! 20 soldiers + 1 admin seeded.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
