const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function generatePin() {
  return Math.random().toString().slice(2, 14); // Generates exactly 12 digits
}

async function main() {
  console.log('Seeding 3 Scratch Cards for testing...');
  const pins = [generatePin(), generatePin(), generatePin()];

  for (let i = 0; i < pins.length; i++) {
    const pinHash = hashPin(pins[i]);
    await prisma.scratch_Card.create({
      data: {
        PIN_Hash: pinHash,
        SerialNumber: `WOF-SC-${Math.floor(1000 + Math.random() * 9000)}-${i}`,
        MaxUsage: 5,
        UsageCount: 0
      }
    });
  }

  console.log('\n================================');
  console.log('🎉 SCRATCH CARDS GENERATED 🎉');
  console.log('Please copy one of the following 12-digit PINs to test the Results portal:');
  pins.forEach((p, idx) => console.log(`Card ${idx + 1}: ${p}`));
  console.log('================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
