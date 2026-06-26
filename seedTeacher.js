const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const teacherRole = await prisma.role.findUnique({ where: { RoleName: 'Teacher' } });
  if (!teacherRole) return console.log('Teacher role not found');

  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const teacher = await prisma.user.upsert({
    where: { Email: 'teacher@wordoffaith.edu.ng' },
    update: {},
    create: {
      Email: 'teacher@wordoffaith.edu.ng',
      PasswordHash: hashedPassword,
      RoleID: teacherRole.RoleID,
      IsActive: true,
    }
  });

  const math = await prisma.subject.upsert({
    where: { SubjectID: 1 },
    update: {},
    create: { SubjectName: 'Mathematics', ClassLevel: 'JSS' }
  });

  const jss1 = await prisma.class.upsert({
    where: { ClassName: 'JSS 1A' },
    update: {},
    create: { ClassName: 'JSS 1A', Level: 'Secondary' }
  });

  const term = await prisma.academic_Term.upsert({
    where: { TermID: 1 },
    update: {},
    create: { SessionName: '2026/2027', TermName: 'First Term', IsActive: true }
  });

  await prisma.teacher_Subject_Map.upsert({
    where: { TeacherID_SubjectID_ClassID: { TeacherID: teacher.UserID, SubjectID: math.SubjectID, ClassID: jss1.ClassID } },
    update: {},
    create: { TeacherID: teacher.UserID, SubjectID: math.SubjectID, ClassID: jss1.ClassID }
  });

  const studentUser = await prisma.user.upsert({
    where: { Email: 'student1@wordoffaith.edu.ng' },
    update: {},
    create: {
      Email: 'student1@wordoffaith.edu.ng',
      PasswordHash: hashedPassword,
      RoleID: 3, // Assuming 3 is student
      IsActive: true,
    }
  });

  await prisma.student.upsert({
    where: { AdmissionNo: 'WOF/2026/001' },
    update: {},
    create: {
      UserID: studentUser.UserID,
      AdmissionNo: 'WOF/2026/001',
      ClassID: jss1.ClassID,
      DateOfBirth: new Date('2014-01-01'),
      ParentContact: '08000000000',
      PreferredName: 'John Doe'
    }
  });

  console.log('Test data created. Teacher email: teacher@wordoffaith.edu.ng | Password: password123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
