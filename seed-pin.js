const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

function hashPin(pin) {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

async function main() {
  const testPin = "123456789012";
  const pinHash = hashPin(testPin);

  await prisma.scratch_Card.upsert({
    where: { PIN_Hash: pinHash },
    update: {},
    create: {
      PIN_Hash: pinHash,
      SerialNumber: "SN-TEST-001",
      MaxUsage: 3
    }
  });

  // Also create a test Term
  await prisma.academic_Term.upsert({
    where: { TermID: 1 },
    update: {},
    create: { SessionName: "2025/2026", TermName: "First Term", IsActive: true }
  });

  console.log("Test PIN seeded!");
  console.log("PIN: 123456789012");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
