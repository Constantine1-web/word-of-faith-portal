const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check if a class exists
  let mainClass = await prisma.class.findFirst();
  if (!mainClass) {
    mainClass = await prisma.class.create({
      data: { ClassName: "JSS 1A", Level: "Secondary" }
    });
  }

  // Create an unregistered student
  const student = await prisma.student.upsert({
    where: { AdmissionNo: "WOF/2026/001" },
    update: {},
    create: {
      AdmissionNo: "WOF/2026/001",
      ClassID: mainClass.ClassID,
      DateOfBirth: new Date("2012-05-14"),
      ParentContact: "parent@example.com",
    }
  });

  console.log("Unregistered dummy student seeded with AdmissionNo: WOF/2026/001");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
