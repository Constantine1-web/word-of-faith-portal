const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // Create Roles
  const adminRole = await prisma.role.upsert({
    where: { RoleName: 'Admin' },
    update: {},
    create: { RoleName: 'Admin', Permissions: '{"all": true}' },
  });

  const teacherRole = await prisma.role.upsert({
    where: { RoleName: 'Teacher' },
    update: {},
    create: { RoleName: 'Teacher', Permissions: '{"view_classes": true, "edit_results": true}' },
  });

  const studentRole = await prisma.role.upsert({
    where: { RoleName: 'Student' },
    update: {},
    create: { RoleName: 'Student', Permissions: '{"view_results": true}' },
  });

  // Create Admin User
  const passwordHash = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { Email: 'admin@wordoffaith.com' },
    update: {},
    create: {
      Email: 'admin@wordoffaith.com',
      PasswordHash: passwordHash,
      RoleID: adminRole.RoleID,
      IsActive: true
    },
  });

  console.log("Database seeded successfully!");
  console.log("Admin Email: admin@wordoffaith.com");
  console.log("Admin Password: admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
