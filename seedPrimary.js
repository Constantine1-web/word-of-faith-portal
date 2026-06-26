const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding primary student...");

  // 1. Ensure a primary class exists
  let primaryClass = await prisma.class.findUnique({
    where: { ClassName: 'Primary 4' }
  });

  if (!primaryClass) {
    primaryClass = await prisma.class.create({
      data: {
        ClassName: 'Primary 4',
        Level: 'Primary'
      }
    });
    console.log("Created Primary 4 class.");
  } else {
    console.log("Primary 4 class already exists.");
  }

  // 2. Create the student (no user yet, so they can register)
  const admissionNo = 'WOF/2026/P01';
  let primaryStudent = await prisma.student.findUnique({
    where: { AdmissionNo: admissionNo }
  });

  if (!primaryStudent) {
    primaryStudent = await prisma.student.create({
      data: {
        AdmissionNo: admissionNo,
        ClassID: primaryClass.ClassID,
        DateOfBirth: new Date('2015-05-15'),
        ParentContact: '08011223344',
      }
    });
    console.log(`Created primary student: ${admissionNo}`);
  } else {
    console.log(`Primary student ${admissionNo} already exists.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
