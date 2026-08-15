const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany();
  const students = await prisma.student.findMany({ take: 5, include: { User: true } });
  const users = await prisma.user.findMany({ take: 5, include: { Role: true } });

  console.log('ROLES:', JSON.stringify(roles, null, 2));
  console.log('STUDENTS:', JSON.stringify(students.map(s => ({
    id: s.StudentID,
    admNo: s.AdmissionNo,
    userID: s.UserID,
    hasClaimed: !!s.UserID
  })), null, 2));
  console.log('USERS:', JSON.stringify(users.map(u => ({
    id: u.UserID,
    email: u.Email,
    role: u.Role.RoleName
  })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
