import fs from "fs";
import path from "path";
import crypto from "crypto";
import prisma from "../lib/db";
import { SAFE_USER_SELECT } from "../lib/security";

const MAX_RETAINED_BACKUPS = 14;

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  encrypted?: boolean;
  totalRows?: number;
  sha256?: string;
  tableCounts?: Record<string, number>;
  error?: string;
}

function resolveBackupEncryptionKey(): Buffer | null {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 16) return null;
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/**
 * Automated PostgreSQL Logical Snapshot & Integrity Backup Engine.
 * Exports all institutional PostgreSQL tables via Prisma (BigInt-safe, credential hashes omitted),
 * computes a cryptographic SHA-256 checksum, optionally encrypts at rest with AES-256-GCM
 * when BACKUP_ENCRYPTION_KEY is set, writes to `backups/`, and prunes old snapshots.
 */
export async function performBackup(customOutputDir?: string): Promise<BackupResult> {
  const startedAt = new Date().toISOString();
  console.log(`[BACKUP] Starting PostgreSQL logical snapshot at ${startedAt}`);

  const backupDir = customOutputDir || path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    const [
      roles,
      users,
      roleAssignments,
      classes,
      subjects,
      terms,
      feeSchedules,
      portalSettings,
      schoolNotices,
      contactInquiries,
      students,
      parents,
      parentLinks,
      enrollments,
      teacherSubjectMaps,
      results,
      subjectSubmissions,
      gradeScales,
      gradeBands,
      importBatches,
      importRows,
      unlockRequests,
      broadsheets,
      reportCards,
      formMasterReports,
      invoices,
      invoiceLineItems,
      payments,
      allocationLedgers,
      webhookEvents,
      scratchCardBatches,
      scratchCards,
      attendance,
      admissions,
      studentSequences,
      identityVerifications,
      duplicateCases,
      messages,
      cbtQuestions,
      cbtAttempts,
      cbtAttemptQuestions,
      cbtIntegrityEvents,
      cbtDayLocks,
      auditLogs,
    ] = await Promise.all([
      prisma.role.findMany(),
      prisma.user.findMany({ select: SAFE_USER_SELECT }),
      prisma.userRoleAssignment.findMany(),
      prisma.class.findMany(),
      prisma.subject.findMany(),
      prisma.academic_Term.findMany(),
      prisma.feeSchedule.findMany(),
      prisma.portalSetting.findMany(),
      prisma.schoolNotice.findMany(),
      prisma.contactInquiry.findMany(),
      prisma.student.findMany({
        select: {
          StudentID: true,
          Uuid: true,
          AdmissionNo: true,
          UserID: true,
          ClassID: true,
          FirstName: true,
          MiddleName: true,
          LastName: true,
          PreferredName: true,
          Gender: true,
          DateOfBirth: true,
          ParentName: true,
          ParentContact: true,
          ParentEmail: true,
          GuardianVerified: true,
          AvatarUrl: true,
          IdentityVerified: true,
          RegistrationStatus: true,
          EnrolmentStatus: true,
          HasPaidFees: true,
          CreatedAt: true,
          UpdatedAt: true,
        },
      }),
      prisma.parent.findMany(),
      prisma.parentStudentLink.findMany(),
      prisma.enrollment.findMany(),
      prisma.teacher_Subject_Map.findMany(),
      prisma.result.findMany(),
      prisma.subject_Submission.findMany(),
      prisma.gradeScale.findMany(),
      prisma.gradeBand.findMany(),
      prisma.importBatch.findMany(),
      prisma.importRow.findMany(),
      prisma.unlockRequest.findMany(),
      prisma.classBroadsheet.findMany(),
      prisma.reportCard.findMany(),
      prisma.form_Master_Report.findMany(),
      prisma.invoice.findMany(),
      prisma.invoiceLineItem.findMany(),
      prisma.payment_Record.findMany(),
      prisma.allocationLedger.findMany(),
      prisma.webhookEvent.findMany(),
      prisma.scratchCardBatch.findMany(),
      prisma.scratch_Card.findMany({
        select: {
          CardID: true,
          Uuid: true,
          SerialNumber: true,
          Status: true,
          UsageCount: true,
          MaxUsage: true,
          UsedBy: true,
          TermID: true,
          BatchId: true,
          IssuedAt: true,
          ActiveWindowExpires: true,
        },
      }),
      prisma.attendance.findMany(),
      prisma.admission_Application.findMany(),
      prisma.studentSequence.findMany(),
      prisma.identityVerificationRecord.findMany(),
      prisma.duplicateReviewCase.findMany(),
      prisma.message.findMany(),
      prisma.cbtQuestion.findMany(),
      prisma.cbtAttempt.findMany(),
      prisma.cbtAttemptQuestion.findMany(),
      prisma.cbtIntegrityEvent.findMany(),
      prisma.cbtDayLock.findMany(),
      prisma.auditLog.findMany({ orderBy: { CreatedAt: "desc" }, take: 10000 }),
    ]);

    const tables: Record<string, unknown[]> = {
      Role: roles,
      User: users,
      UserRoleAssignment: roleAssignments,
      Class: classes,
      Subject: subjects,
      Academic_Term: terms,
      FeeSchedule: feeSchedules,
      PortalSetting: portalSettings,
      SchoolNotice: schoolNotices,
      ContactInquiry: contactInquiries,
      Student: students,
      Parent: parents,
      ParentStudentLink: parentLinks,
      Enrollment: enrollments,
      Teacher_Subject_Map: teacherSubjectMaps,
      Result: results,
      Subject_Submission: subjectSubmissions,
      GradeScale: gradeScales,
      GradeBand: gradeBands,
      ImportBatch: importBatches,
      ImportRow: importRows,
      UnlockRequest: unlockRequests,
      ClassBroadsheet: broadsheets,
      ReportCard: reportCards,
      Form_Master_Report: formMasterReports,
      Invoice: invoices,
      InvoiceLineItem: invoiceLineItems,
      Payment_Record: payments,
      AllocationLedger: allocationLedgers,
      WebhookEvent: webhookEvents,
      ScratchCardBatch: scratchCardBatches,
      Scratch_Card: scratchCards,
      Attendance: attendance,
      Admission_Application: admissions,
      StudentSequence: studentSequences,
      IdentityVerificationRecord: identityVerifications,
      DuplicateReviewCase: duplicateCases,
      Message: messages,
      CbtQuestion: cbtQuestions,
      CbtAttempt: cbtAttempts,
      CbtAttemptQuestion: cbtAttemptQuestions,
      CbtIntegrityEvent: cbtIntegrityEvents,
      CbtDayLock: cbtDayLocks,
      AuditLog: auditLogs,
    };

    const tableCounts: Record<string, number> = {};
    let totalRows = 0;
    for (const [k, rows] of Object.entries(tables)) {
      tableCounts[k] = rows.length;
      totalRows += rows.length;
    }

    const serializedTables = JSON.stringify(tables, (_k, val) =>
      typeof val === "bigint" ? val.toString() : val
    );
    const sha256 = crypto.createHash("sha256").update(serializedTables).digest("hex");

    const envelope = {
      metadata: {
        engine: "word-of-faith-postgresql-logical-backup-v3",
        createdAt: startedAt,
        totalRows,
        tableCounts,
        dataSha256: sha256,
      },
      data: JSON.parse(serializedTables),
    };

    const plaintextPayload = JSON.stringify(envelope, null, 2);
    const encKey = resolveBackupEncryptionKey();
    const stamp = startedAt.replace(/[:.]/g, "-");

    let backupPath: string;
    let encrypted = false;
    if (encKey) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintextPayload, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      backupPath = path.join(backupDir, `wofs_pg_backup_${stamp}.enc.json`);
      fs.writeFileSync(
        backupPath,
        JSON.stringify({
          alg: "aes-256-gcm",
          iv: iv.toString("base64"),
          tag: tag.toString("base64"),
          dataSha256: sha256,
          ciphertext: ciphertext.toString("base64"),
        }),
        "utf8"
      );
      encrypted = true;
    } else {
      backupPath = path.join(backupDir, `wofs_pg_backup_${stamp}.json`);
      fs.writeFileSync(backupPath, plaintextPayload, "utf8");
    }

    // Prune older snapshots beyond MAX_RETAINED_BACKUPS
    const existing = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("wofs_pg_backup_") && f.endsWith(".json"))
      .sort();
    if (existing.length > MAX_RETAINED_BACKUPS) {
      const toRemove = existing.slice(0, existing.length - MAX_RETAINED_BACKUPS);
      for (const oldFile of toRemove) {
        fs.unlinkSync(path.join(backupDir, oldFile));
      }
    }

    console.log(
      `[BACKUP] PostgreSQL snapshot written: ${backupPath} (${totalRows} rows, encrypted=${encrypted}, sha256=${sha256.slice(0, 12)}...)`
    );

    return {
      success: true,
      backupPath,
      encrypted,
      totalRows,
      sha256,
      tableCounts,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BACKUP] PostgreSQL snapshot failed:", msg);
    return { success: false, error: msg };
  }
}
