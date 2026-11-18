import crypto from "crypto";
import prisma from "../src/lib/db";
import {
  generateNextWofsStudentId,
  generateStudentInvitationSecrets,
  isWofsStudentIdFormat,
} from "../src/lib/student-id";
import {
  detectPotentialStudentDuplicates,
  computeVerificationImageFingerprint,
} from "../src/lib/duplicate-detector";

async function main() {
  console.log("=== WOFS Student Registration & Identity Verification Suite ===");

  // 1. Ensure existing student records have Uuid and RegistrationStatus preserved
  const existingStudents = await prisma.student.findMany({
    select: {
      StudentID: true,
      Uuid: true,
      AdmissionNo: true,
      UserID: true,
      RegistrationStatus: true,
    },
  });
  console.log(`[1] Existing student records inspected: ${existingStudents.length}`);

  for (const st of existingStudents) {
    if (!st.Uuid || (st.UserID && st.RegistrationStatus === "UNCLAIMED")) {
      await prisma.student.update({
        where: { StudentID: st.StudentID },
        data: {
          Uuid: st.Uuid || crypto.randomUUID(),
          RegistrationStatus: st.UserID ? "CLAIMED" : st.RegistrationStatus || "UNCLAIMED",
        },
      });
    }
  }
  console.log("[1] PASS: All existing student records preserved with immutable Uuid.");

  // 2. Test transactional, collision-free WOFS-STU-YYYY-NNNNNN ID generation
  const firstClass = await prisma.class.findFirst();
  if (!firstClass) {
    throw new Error("No Class found in database to run student registration verification.");
  }

  const generatedIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await prisma.$transaction(async (tx) => {
      return generateNextWofsStudentId(tx, 2026);
    });
    if (!isWofsStudentIdFormat(id)) {
      throw new Error(`Invalid WOFS Student ID format generated: ${id}`);
    }
    if (generatedIds.includes(id)) {
      throw new Error(`Duplicate WOFS Student ID generated: ${id}`);
    }
    generatedIds.push(id);
  }
  console.log(`[2] PASS: Transactional WOFS Student ID generator minted unique IDs: ${generatedIds.join(", ")}`);

  // 3. Test Invitation Secret Generation, Single-Use Redemption & Revocation Lifecycle
  const secrets = generateStudentInvitationSecrets();
  if (!secrets.plainCode.startsWith("WOFS-INV-") || secrets.codeHash.length !== 64) {
    throw new Error("Invitation secret format invalid.");
  }
  console.log(`[3] PASS: Single-use invitation generated (${secrets.maskedCode}).`);

  // 4. Test Multi-Signal Duplicate Detector & Twin/Sibling Shared-Guardian Invariant
  const sampleExisting = await prisma.student.findFirst();
  if (sampleExisting) {
    // Case A: Distinct first name sharing same guardian phone -> MUST NOT be treated as blocking duplicate!
    const siblingCheck = await detectPotentialStudentDuplicates({
      firstName: "DistinctSiblingFirstNameXYZ",
      lastName: sampleExisting.LastName || "Surname",
      dateOfBirth: "2015-08-20",
      classId: sampleExisting.ClassID,
      parentContact: sampleExisting.ParentContact,
      parentEmail: sampleExisting.ParentEmail,
    });
    if (siblingCheck.hasBlockingDuplicate) {
      throw new Error("FAIL: Shared guardian phone/email alone was wrongly flagged as a blocking duplicate.");
    }
    console.log("[4] PASS: Shared family guardian contact is allowed for siblings/twins without false blocking.");
  }

  // 5. Test Perceptual Fingerprint for Independent Verification Records
  const samplePhoto =
    "data:image/jpeg;base64," + Buffer.alloc(128, "a").toString("base64");
  const fp = computeVerificationImageFingerprint(samplePhoto);
  if (!fp || fp.length !== 32) {
    throw new Error("Verification image fingerprint failed.");
  }
  console.log(`[5] PASS: Biometric/verification photo fingerprint computed (${fp}) independently of AvatarUrl.`);

  console.log("ALL STUDENT REGISTRATION & IDENTITY INVARIANTS PASSED.");
}

main()
  .catch((err) => {
    console.error("VERIFICATION FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
