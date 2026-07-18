import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

const plans = [
  {
    key: "free",
    name: "Free",
    priceUsd: 0,
    videosPerMonth: 1,
    thumbnailsPerVideo: 2,
    interval: "MONTH" as const,
    isHighlighted: false,
    sortOrder: 1,
    dodoProductId: process.env.DODO_FREE_PRODUCT_ID ?? null,
  },
  {
    key: "starter",
    name: "Starter",
    priceUsd: 1900,
    videosPerMonth: 4,
    thumbnailsPerVideo: 3,
    interval: "MONTH" as const,
    isHighlighted: false,
    sortOrder: 2,
    dodoProductId: process.env.DODO_STARTER_PRODUCT_ID ?? null,
  },
  {
    key: "creator",
    name: "Creator",
    priceUsd: 4900,
    videosPerMonth: 10,
    thumbnailsPerVideo: 4,
    interval: "MONTH" as const,
    isHighlighted: true,
    sortOrder: 3,
    dodoProductId: process.env.DODO_CREATOR_PRODUCT_ID ?? null,
  },
  {
    key: "pro",
    name: "Pro",
    priceUsd: 9900,
    videosPerMonth: 25,
    thumbnailsPerVideo: 6,
    interval: "MONTH" as const,
    isHighlighted: false,
    sortOrder: 4,
    dodoProductId: process.env.DODO_PRO_PRODUCT_ID ?? null,
  },
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    });
    console.log(`  ✓ ${plan.key} (${plan.name}) — ${plan.dodoProductId ?? "no product ID"}`);
  }
  console.log("\nPlans seeded successfully.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
