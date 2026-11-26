"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, writeAuditLog, can } from "@/lib/authz";
import { rateLimit, validateInput, escapeHtml } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { mapSubjectNameToCbtCodes } from "@/lib/cbt-constants";
import {
  computeSubmissionTransition,
  decryptExamVaultString,
  decryptExamOptionsJson,
  decryptAnswerKeyValue,
} from "@/lib/exam-vault";

const STAFF_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMIN",
  "TEACHER",
  "FORM_MASTER",
  "Admin",
  "Teacher",
] as const;

function isExamOfficerOrAdmin(actor: { roles: Set<string>; capabilities?: Set<any> }): boolean {
  return (
    can(actor, "MANAGE_CBT") ||
    actor.roles.has("ADMIN") ||
    actor.roles.has("Admin") ||
    actor.roles.has("SUPER_ADMIN") ||
    actor.roles.has("PRINCIPAL")
  );
}

async function notifyUsersDualChannel(params: {
  senderId: number;
  recipientUserIds: number[];
  subject: string;
  bodyText: string;
  dedupeKey?: string;
}) {
  const uniqueIds = Array.from(
    new Set(params.recipientUserIds.filter((id) => Number.isInteger(id) && id > 0 && id !== params.senderId))
  );
  if (uniqueIds.length === 0) return;

  if (params.dedupeKey) {
    const rl = await rateLimit(`exam_notif:${params.dedupeKey}`, 1, 180);
    if (!rl.success) return;
  }

  try {
    const recipients = await prisma.user.findMany({
      where: { UserID: { in: uniqueIds }, IsActive: true },
      select: { UserID: true, Email: true },
    });

    for (const r of recipients) {
      await prisma.message
        .create({
          data: {
            SenderID: params.senderId,
            ReceiverID: r.UserID,
            Content: `[${params.subject}] ${params.bodyText}`,
          },
        })
        .catch(() => {});

      if (r.Email && r.Email.includes("@")) {
        sendEmail({
          to: r.Email,
          subject: `WOFS Examination Control: ${params.subject}`,
          html: `<div style="font-family:sans-serif;max-width:580px;padding:20px;border:1px solid #e2e8f0;border-radius:10px;">
            <h3 style="color:#0A2540;margin-top:0;">${escapeHtml(params.subject)}</h3>
            <p style="color:#334155;line-height:1.6;">${escapeHtml(params.bodyText)}</p>
            <p style="font-size:12px;color:#64748b;margin-top:20px;">Word of Faith Schools Examination Management Ecosystem</p>
          </div>`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[Exam Workflow Notification] Non-fatal dispatch warning:", err);
  }
}

async function getExamOfficerUserIds(): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: {
      IsActive: true,
      OR: [
        { Capabilities: { has: "MANAGE_CBT" } },
        { Role: { RoleName: { in: ["Admin", "SUPER_ADMIN", "PRINCIPAL"] } } },
        { RoleAssignments: { some: { Role: { in: ["SUPER_ADMIN", "PRINCIPAL"] } } } },
      ],
    },
    select: { UserID: true },
    take: 15,
  });
  return users.map((u) => u.UserID);
}

/**
 * Ensures a teacher has a `CbtQuestionSubmission` packet for their assigned `(classId, subjectId, examType)`
 * in the active term, linking any unattached EXAM_ONLY questions authored by this teacher for that subject.
 */
export async function getOrCreateTeacherSubmissionPacket(params: {
  classId: number;
  subjectId: number;
  examType?: "CA_TEST" | "MIDTERM" | "TERMINAL_EXAM";
  targetQuestionGoal?: number;
}) {
  try {
    const actor = await requireRole(STAFF_ROLES);
    const examOfficer = isExamOfficerOrAdmin(actor);
    const classId = Number(params.classId);
    const subjectId = Number(params.subjectId);
    const examType = params.examType || "TERMINAL_EXAM";

    const [activeTerm, assignment, subject, cls] = await Promise.all([
      prisma.academic_Term.findFirst({ where: { IsActive: true }, orderBy: { TermID: "desc" } }),
      prisma.teacher_Subject_Map.findFirst({
        where: {
          ClassID: classId,
          SubjectID: subjectId,
          ...(examOfficer ? {} : { TeacherID: actor.UserID }),
        },
      }),
      prisma.subject.findUnique({ where: { SubjectID: subjectId } }),
      prisma.class.findUnique({ where: { ClassID: classId } }),
    ]);

    if (!activeTerm) {
      return { success: false, error: "No active academic term is configured." };
    }
    if (!assignment && !examOfficer) {
      return {
        success: false,
        error: "Forbidden: You are not assigned to teach this subject in the selected class arm.",
      };
    }
    if (!subject || !cls) {
      return { success: false, error: "Class or Subject record not found." };
    }

    const ownerTeacherId = assignment?.TeacherID || actor.UserID;
    const cbtCodes = mapSubjectNameToCbtCodes(subject.SubjectName || subject.SubjectCode);
    const primaryCode = cbtCodes[0] || "general";
    const defaultTitle = `${cls.ClassName} ${subject.SubjectName} (${examType.replace(/_/g, " ")})`;

    const packet = await prisma.cbtQuestionSubmission.upsert({
      where: {
        teacherId_classId_subjectId_termId_examType: {
          teacherId: ownerTeacherId,
          classId,
          subjectId,
          termId: activeTerm.TermID,
          examType,
        },
      },
      update: {
        ...(params.targetQuestionGoal
          ? { targetQuestionGoal: Math.max(1, Math.min(100, params.targetQuestionGoal)) }
          : {}),
      },
      create: {
        teacherId: ownerTeacherId,
        classId,
        subjectId,
        subjectCode: primaryCode,
        termId: activeTerm.TermID,
        examType,
        title: defaultTitle,
        status: "DRAFT",
        targetQuestionGoal: Math.max(1, Math.min(100, params.targetQuestionGoal || 20)),
      },
    });

    // Attach any unlinked EXAM_ONLY questions authored by this teacher for this subjectCode
    if (packet.status === "DRAFT" || packet.status === "REVISION_REQUESTED") {
      await prisma.cbtQuestion.updateMany({
        where: {
          provider: "SCHOOL_INTERNAL",
          bankScope: "EXAM_ONLY",
          subjectCode: primaryCode,
          authoredById: ownerTeacherId,
          submissionId: null,
          isActive: true,
        },
        data: {
          submissionId: packet.id,
        },
      });
    }

    return {
      success: true,
      packet,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize submission packet.",
    };
  }
}

/**
 * Returns all question submission packets for the current teacher (or all assigned subjects).
 */
export async function getTeacherQuestionSubmissions() {
  try {
    const actor = await requireRole(STAFF_ROLES);
    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      orderBy: { TermID: "desc" },
    });
    if (!activeTerm) {
      return { success: false, submissions: [], error: "No active academic term." };
    }

    const submissions = await prisma.cbtQuestionSubmission.findMany({
      where: {
        termId: activeTerm.TermID,
        teacherId: actor.UserID,
      },
      include: {
        classArm: { select: { ClassName: true } },
        subject: { select: { SubjectName: true } },
        reviewer: { select: { Email: true } },
        _count: { select: { questions: { where: { isActive: true } } } },
        revisions: {
          orderBy: { revisionNo: "desc" },
          take: 5,
        },
      },
      orderBy: { lastModifiedAt: "desc" },
    });

    return {
      success: true,
      submissions: submissions.map((s) => ({
        id: s.id,
        title: s.title,
        classId: s.classId,
        className: s.classArm?.ClassName || "",
        subjectId: s.subjectId,
        subjectName: s.subject?.SubjectName || "",
        subjectCode: s.subjectCode,
        examType: s.examType,
        status: s.status,
        targetQuestionGoal: s.targetQuestionGoal,
        questionCount: s._count.questions,
        revisionNumber: s.revisionNumber,
        initialSubmittedAt: s.initialSubmittedAt ? s.initialSubmittedAt.toISOString() : null,
        lastModifiedAt: s.lastModifiedAt.toISOString(),
        deadlineAt: s.deadlineAt ? s.deadlineAt.toISOString() : null,
        reviewerEmail: s.reviewer?.Email || null,
        reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
        reviewerNotes: s.reviewerNotes || null,
        revisions: s.revisions.map((r) => ({
          id: r.id,
          revisionNo: r.revisionNo,
          action: r.action,
          actorEmail: r.actorEmail,
          notes: r.notes,
          questionCount: r.questionCount,
          createdAt: r.createdAt.toISOString(),
        })),
      })),
    };
  } catch (error: unknown) {
    return {
      success: false,
      submissions: [],
      error: error instanceof Error ? error.message : "Failed to load question submissions.",
    };
  }
}

/**
 * Teacher action: Submits (or resubmits after requested revision) a question packet to the Exam Officer.
 * Preserves `initialSubmittedAt` immutably and records a full version snapshot in `CbtSubmissionRevision`.
 */
export async function submitQuestionPacketForReview(params: {
  submissionId: string;
  notes?: string;
}) {
  try {
    const actor = await requireRole(STAFF_ROLES);
    const submission = await prisma.cbtQuestionSubmission.findUnique({
      where: { id: params.submissionId },
      include: {
        classArm: { select: { ClassName: true } },
        subject: { select: { SubjectName: true } },
        questions: {
          where: { isActive: true },
          select: { id: true, contentHash: true, topic: true, fetchedAt: true },
          orderBy: { fetchedAt: "asc" },
        },
      },
    });

    if (!submission) {
      return { success: false, error: "Question submission packet not found." };
    }

    if (submission.teacherId !== actor.UserID && !isExamOfficerOrAdmin(actor)) {
      return {
        success: false,
        error: "Forbidden: You can only submit question packets assigned to your account.",
      };
    }

    // Also link any newly authored active EXAM_ONLY questions for this teacher+subjectCode before counting
    await prisma.cbtQuestion.updateMany({
      where: {
        provider: "SCHOOL_INTERNAL",
        bankScope: "EXAM_ONLY",
        subjectCode: submission.subjectCode,
        authoredById: submission.teacherId,
        submissionId: null,
        isActive: true,
      },
      data: { submissionId: submission.id },
    });

    const activeQuestions = await prisma.cbtQuestion.findMany({
      where: { submissionId: submission.id, isActive: true },
      select: { id: true, contentHash: true, topic: true },
      orderBy: { fetchedAt: "asc" },
    });

    const transition = computeSubmissionTransition({
      currentStatus: submission.status,
      currentInitialSubmittedAt: submission.initialSubmittedAt,
      currentRevisionNumber: submission.revisionNumber,
      action: "SUBMIT",
      actorId: actor.UserID,
      teacherId: submission.teacherId,
      questionCount: activeQuestions.length,
    });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.cbtQuestionSubmission.updateMany({
        where: {
          id: submission.id,
          status: submission.status,
          revisionNumber: submission.revisionNumber,
        },
        data: {
          status: transition.nextStatus,
          initialSubmittedAt: transition.initialSubmittedAt,
          revisionNumber: transition.nextRevisionNumber,
        },
      });

      if (claimed.count === 0) {
        throw new Error(
          "Concurrent update detected on this question packet. Refresh and try submitting again."
        );
      }

      await tx.cbtSubmissionRevision.create({
        data: {
          submissionId: submission.id,
          revisionNo: transition.nextRevisionNumber,
          action: transition.revisionActionLabel,
          actorId: actor.UserID,
          actorEmail: actor.Email,
          notes: params.notes?.trim() || null,
          questionCount: activeQuestions.length,
          snapshotJson: activeQuestions.map((q, idx) => ({
            slot: idx + 1,
            questionId: q.id,
            contentHash: q.contentHash,
            topic: q.topic,
          })),
        },
      });

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action:
          transition.revisionActionLabel === "RESUBMITTED"
            ? "CBT_SUBMISSION_RESUBMITTED"
            : "CBT_SUBMISSION_INITIAL_SUBMIT",
        entity: "CbtQuestionSubmission",
        entityId: submission.id,
        newValue: {
          title: submission.title,
          questionCount: activeQuestions.length,
          revisionNo: transition.nextRevisionNumber,
          initialSubmittedAt: transition.initialSubmittedAt?.toISOString(),
        },
      });
    });

    const officerIds = await getExamOfficerUserIds();
    await notifyUsersDualChannel({
      senderId: actor.UserID,
      recipientUserIds: officerIds,
      subject: `Exam Questions Submitted: ${submission.classArm?.ClassName} ${submission.subject?.SubjectName}`,
      bodyText: `Teacher ${actor.Email} has ${transition.revisionActionLabel.toLowerCase()} ${activeQuestions.length} examination questions for ${submission.title} (Revision #${transition.nextRevisionNumber}). Please review and approve in the Examination Control Centre.`,
      dedupeKey: `submit:${submission.id}:${transition.nextRevisionNumber}`,
    });

    revalidatePath("/portal/teacher");
    revalidatePath("/portal/admin/cbt");
    return {
      success: true,
      status: transition.nextStatus,
      initialSubmittedAt: transition.initialSubmittedAt?.toISOString() || null,
      revisionNumber: transition.nextRevisionNumber,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit question packet.",
    };
  }
}

/**
 * Section 3 & 5: Central Examination Upload Progress Dashboard & Submission Priority Timeline
 * for the Exam Officer, Vice Principal, Principal, and Super Admin.
 */
export async function getExamUploadProgressDashboard(filters?: {
  classId?: number;
  subjectId?: number;
  teacherId?: number;
  examType?: string;
}) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMIN", "Admin", "TEACHER", "FORM_MASTER"]);
    if (!isExamOfficerOrAdmin(actor)) {
      return { success: false, error: "Forbidden: Examination Officer or Administrative privileges required." };
    }

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      orderBy: { TermID: "desc" },
    });
    if (!activeTerm) {
      return { success: false, error: "No active academic term configured." };
    }

    const examTypeFilter = filters?.examType || "TERMINAL_EXAM";

    const [allocations, submissions] = await Promise.all([
      prisma.teacher_Subject_Map.findMany({
        where: {
          ...(filters?.classId ? { ClassID: Number(filters.classId) } : {}),
          ...(filters?.subjectId ? { SubjectID: Number(filters.subjectId) } : {}),
          ...(filters?.teacherId ? { TeacherID: Number(filters.teacherId) } : {}),
        },
        include: {
          Teacher: { select: { UserID: true, Email: true } },
          Class: { select: { ClassID: true, ClassName: true, Level: true } },
          Subject: { select: { SubjectID: true, SubjectName: true, SubjectCode: true } },
        },
        orderBy: [{ Class: { ClassName: "asc" } }, { Subject: { SubjectName: "asc" } }],
      }),
      prisma.cbtQuestionSubmission.findMany({
        where: {
          termId: activeTerm.TermID,
          examType: examTypeFilter,
          ...(filters?.classId ? { classId: Number(filters.classId) } : {}),
          ...(filters?.subjectId ? { subjectId: Number(filters.subjectId) } : {}),
          ...(filters?.teacherId ? { teacherId: Number(filters.teacherId) } : {}),
        },
        include: {
          teacher: { select: { UserID: true, Email: true } },
          reviewer: { select: { UserID: true, Email: true } },
          classArm: { select: { ClassID: true, ClassName: true } },
          subject: { select: { SubjectID: true, SubjectName: true } },
          _count: { select: { questions: { where: { isActive: true } } } },
        },
      }),
    ]);

    const subMap = new Map<string, typeof submissions[number]>();
    for (const s of submissions) {
      subMap.set(`${s.teacherId}:${s.classId}:${s.subjectId}`, s);
    }

    const now = new Date();
    const combinedRows = allocations.map((alloc) => {
      const key = `${alloc.TeacherID}:${alloc.ClassID}:${alloc.SubjectID}`;
      const sub = subMap.get(key);
      const hasSubmitted = Boolean(sub?.initialSubmittedAt);
      const isOverdue = Boolean(
        sub?.deadlineAt && !hasSubmitted && new Date(sub.deadlineAt) < now
      );

      return {
        allocationId: alloc.id,
        submissionId: sub?.id || null,
        teacherId: alloc.TeacherID,
        teacherEmail: alloc.Teacher?.Email || `Staff #${alloc.TeacherID}`,
        classId: alloc.ClassID,
        className: alloc.Class?.ClassName || "",
        subjectId: alloc.SubjectID,
        subjectName: alloc.Subject?.SubjectName || "",
        subjectCode:
          sub?.subjectCode ||
          mapSubjectNameToCbtCodes(alloc.Subject?.SubjectName)[0] ||
          "general",
        examType: examTypeFilter,
        status: sub ? sub.status : "PENDING_NOT_STARTED",
        questionCount: sub?._count.questions || 0,
        targetQuestionGoal: sub?.targetQuestionGoal || 20,
        revisionNumber: sub?.revisionNumber || 0,
        initialSubmittedAt: sub?.initialSubmittedAt ? sub.initialSubmittedAt.toISOString() : null,
        lastModifiedAt: sub?.lastModifiedAt ? sub.lastModifiedAt.toISOString() : null,
        deadlineAt: sub?.deadlineAt ? sub.deadlineAt.toISOString() : null,
        isOverdue,
        reviewerEmail: sub?.reviewer?.Email || null,
        reviewedAt: sub?.reviewedAt ? sub.reviewedAt.toISOString() : null,
        reviewerNotes: sub?.reviewerNotes || null,
      };
    });

    // Sort priority timeline: teachers who submitted earliest come first (initialSubmittedAt ASC),
    // followed by unsubmitted rows.
    const timelineRows = [...combinedRows].sort((a, b) => {
      if (a.initialSubmittedAt && b.initialSubmittedAt) {
        return new Date(a.initialSubmittedAt).getTime() - new Date(b.initialSubmittedAt).getTime();
      }
      if (a.initialSubmittedAt) return -1;
      if (b.initialSubmittedAt) return 1;
      return a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName);
    });

    let rankCounter = 1;
    const rankedTimeline = timelineRows.map((row) => ({
      ...row,
      submissionRank: row.initialSubmittedAt ? rankCounter++ : null,
    }));

    const totalSubjectsRequired = rankedTimeline.length;
    const submittedCount = rankedTimeline.filter((r) => Boolean(r.initialSubmittedAt)).length;
    const outstandingCount = totalSubjectsRequired - submittedCount;
    const awaitingReviewCount = rankedTimeline.filter(
      (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
    ).length;
    const approvedCount = rankedTimeline.filter((r) => r.status === "APPROVED").length;
    const revisionRequestedCount = rankedTimeline.filter(
      (r) => r.status === "REVISION_REQUESTED"
    ).length;
    const rejectedCount = rankedTimeline.filter((r) => r.status === "REJECTED").length;
    const revisionOrRejectedCount = revisionRequestedCount + rejectedCount;
    const overdueCount = rankedTimeline.filter((r) => r.isOverdue).length;

    const latestAuditRows = await prisma.auditLog.findMany({
      where: {
        OR: [
          {
            Entity: {
              in: [
                "CbtQuestionSubmission",
                "CbtScheduledExam",
                "CbtExamRoomCode",
                "CbtAttempt",
                "CbtDayLock",
              ],
            },
          },
          { Action: { startsWith: "EXAM_" } },
          { Action: { startsWith: "CBT_SUBMISSION_" } },
        ],
      },
      include: {
        Actor: { select: { Email: true } },
      },
      orderBy: { CreatedAt: "desc" },
      take: 15,
    });

    return {
      success: true,
      termLabel: `${activeTerm.SessionName} · ${activeTerm.TermName}`,
      examType: examTypeFilter,
      kpis: {
        totalSubjectsRequired,
        submittedCount,
        outstandingCount,
        awaitingReviewCount,
        approvedCount,
        revisionRequestedCount,
        rejectedCount,
        revisionOrRejectedCount,
        overdueCount,
        completionPct:
          totalSubjectsRequired > 0
            ? Math.round((submittedCount / totalSubjectsRequired) * 100)
            : 0,
        approvalPct:
          totalSubjectsRequired > 0
            ? Math.round((approvedCount / totalSubjectsRequired) * 100)
            : 0,
      },
      timeline: rankedTimeline,
      latestActivity: latestAuditRows.map((log) => ({
        id: log.id,
        action: log.Action,
        entity: log.Entity,
        entityId: log.EntityID,
        actorEmail: log.Actor?.Email || (log.ActorID ? `User #${log.ActorID}` : "System"),
        reason: log.Reason || null,
        createdAt: log.CreatedAt.toISOString(),
      })),
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load upload progress dashboard.",
    };
  }
}

/**
 * Exam Officer / Reviewer action: Opens a teacher's question submission packet to inspect decrypted questions
 * and full version history. Records an immutable `EXAM_SUBMISSION_OPENED_FOR_REVIEW` audit log entry.
 */
export async function inspectQuestionSubmissionForReview(submissionId: string) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMIN", "Admin", "TEACHER", "FORM_MASTER"]);
    if (!isExamOfficerOrAdmin(actor)) {
      return { success: false, error: "Forbidden: Reviewer authority required." };
    }

    const submission = await prisma.cbtQuestionSubmission.findUnique({
      where: { id: submissionId },
      include: {
        teacher: { select: { UserID: true, Email: true } },
        reviewer: { select: { UserID: true, Email: true } },
        classArm: { select: { ClassID: true, ClassName: true } },
        subject: { select: { SubjectID: true, SubjectName: true } },
        questions: {
          where: { isActive: true },
          include: { answerKey: true },
          orderBy: { fetchedAt: "asc" },
        },
        revisions: {
          orderBy: { revisionNo: "desc" },
        },
      },
    });

    if (!submission) {
      return { success: false, error: "Submission packet not found." };
    }

    // If packet was SUBMITTED and reviewer is not the author, mark UNDER_REVIEW
    if (submission.status === "SUBMITTED" && submission.teacherId !== actor.UserID) {
      await prisma.cbtQuestionSubmission.update({
        where: { id: submission.id },
        data: {
          status: "UNDER_REVIEW",
          reviewerId: actor.UserID,
        },
      });
    }

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "EXAM_SUBMISSION_OPENED_FOR_REVIEW",
      entity: "CbtQuestionSubmission",
      entityId: submission.id,
      newValue: {
        teacherId: submission.teacherId,
        subjectCode: submission.subjectCode,
        questionCount: submission.questions.length,
      },
    });

    return {
      success: true,
      submission: {
        id: submission.id,
        title: submission.title,
        teacherId: submission.teacherId,
        teacherEmail: submission.teacher.Email,
        classId: submission.classId,
        className: submission.classArm.ClassName,
        subjectId: submission.subjectId,
        subjectName: submission.subject.SubjectName,
        subjectCode: submission.subjectCode,
        examType: submission.examType,
        status:
          submission.status === "SUBMITTED" && submission.teacherId !== actor.UserID
            ? "UNDER_REVIEW"
            : submission.status,
        revisionNumber: submission.revisionNumber,
        initialSubmittedAt: submission.initialSubmittedAt
          ? submission.initialSubmittedAt.toISOString()
          : null,
        lastModifiedAt: submission.lastModifiedAt.toISOString(),
        reviewerEmail: submission.reviewer?.Email || actor.Email,
        reviewerNotes: submission.reviewerNotes,
        questions: submission.questions.map((q, idx) => ({
          id: q.id,
          position: idx + 1,
          topic: q.topic || "Exam Question",
          stem: decryptExamVaultString(q.stem),
          options: decryptExamOptionsJson(q.optionsJson),
          correctKey: decryptAnswerKeyValue(q.answerKey?.correctKey),
          explanation: decryptExamVaultString(q.answerKey?.explanation),
        })),
        revisions: submission.revisions.map((r) => ({
          id: r.id,
          revisionNo: r.revisionNo,
          action: r.action,
          actorEmail: r.actorEmail,
          notes: r.notes,
          questionCount: r.questionCount,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to inspect submission packet.",
    };
  }
}

const DecideSubmissionSchema = z.object({
  submissionId: z.string().trim().min(1),
  decision: z.enum(["APPROVE", "REQUEST_REVISION", "REJECT"]),
  reviewerNotes: z.string().trim().max(1000).optional().default(""),
  durationMinutes: z.number().int().min(5).max(180).optional().default(30),
  requireFeeClearance: z.boolean().optional().default(true),
});

/**
 * Section 4: Single-Tier Exam Officer / Vice Principal Approval Decision.
 * Enforces Separation of Duties (`actor.UserID !== submission.teacherId`).
 * On `APPROVE`, automatically provisions/updates the `CbtScheduledExam` with the approved questions pinned.
 */
export async function decideQuestionSubmissionReview(
  rawInput: z.infer<typeof DecideSubmissionSchema>
) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMIN", "Admin", "TEACHER", "FORM_MASTER"]);
    if (!isExamOfficerOrAdmin(actor)) {
      return { success: false, error: "Forbidden: Examination Officer authority required." };
    }

    const data = validateInput(DecideSubmissionSchema, rawInput);
    if (
      (data.decision === "REQUEST_REVISION" || data.decision === "REJECT") &&
      data.reviewerNotes.length < 5
    ) {
      return {
        success: false,
        error: "Please provide clear feedback notes (at least 5 characters) explaining the required corrections.",
      };
    }

    const submission = await prisma.cbtQuestionSubmission.findUnique({
      where: { id: data.submissionId },
      include: {
        classArm: { select: { ClassName: true } },
        subject: { select: { SubjectName: true } },
        questions: {
          where: { isActive: true },
          select: { id: true, contentHash: true, topic: true },
          orderBy: { fetchedAt: "asc" },
        },
      },
    });

    if (!submission) {
      return { success: false, error: "Submission packet not found." };
    }

    const transition = computeSubmissionTransition({
      currentStatus: submission.status,
      currentInitialSubmittedAt: submission.initialSubmittedAt,
      currentRevisionNumber: submission.revisionNumber,
      action: data.decision,
      actorId: actor.UserID,
      teacherId: submission.teacherId,
      questionCount: submission.questions.length,
    });

    let scheduledExamId: string | null = null;

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.cbtQuestionSubmission.updateMany({
        where: {
          id: submission.id,
          status: submission.status,
          revisionNumber: submission.revisionNumber,
        },
        data: {
          status: transition.nextStatus,
          reviewerId: actor.UserID,
          reviewedAt: new Date(),
          reviewerNotes: data.reviewerNotes || null,
        },
      });

      if (claimed.count === 0) {
        throw new Error(
          "Concurrent review conflict: another Examination Officer already updated this packet. Refresh and inspect the latest version."
        );
      }

      await tx.cbtSubmissionRevision.create({
        data: {
          submissionId: submission.id,
          revisionNo: transition.nextRevisionNumber,
          action: transition.revisionActionLabel,
          actorId: actor.UserID,
          actorEmail: actor.Email,
          notes: data.reviewerNotes || null,
          questionCount: submission.questions.length,
          snapshotJson: submission.questions.map((q, idx) => ({
            slot: idx + 1,
            questionId: q.id,
            contentHash: q.contentHash,
          })),
        },
      });

      // If APPROVED, automatically provision or sync the scheduled exam room for this class & subject
      if (data.decision === "APPROVE") {
        const existingExam = await tx.cbtScheduledExam.findFirst({
          where: {
            OR: [
              { submissionId: submission.id },
              {
                classId: submission.classId,
                subjectId: submission.subjectId,
                termId: submission.termId,
                examType: submission.examType,
              },
            ],
          },
        });

        const examRecord = existingExam
          ? await tx.cbtScheduledExam.update({
              where: { id: existingExam.id },
              data: {
                title: submission.title,
                subjectCode: submission.subjectCode,
                subjectId: submission.subjectId,
                classId: submission.classId,
                submissionId: submission.id,
                questionCount: Math.min(submission.targetQuestionGoal, submission.questions.length),
                durationMinutes: data.durationMinutes,
                requireFeeClearance: data.requireFeeClearance,
                requireAccessCode: true,
                status: existingExam.status === "LIVE" ? "LIVE" : "SCHEDULED",
                approvedById: actor.UserID,
                approvedAt: new Date(),
              },
            })
          : await tx.cbtScheduledExam.create({
              data: {
                title: submission.title,
                subjectCode: submission.subjectCode,
                subjectId: submission.subjectId,
                classId: submission.classId,
                termId: submission.termId,
                examType: submission.examType,
                submissionId: submission.id,
                status: "SCHEDULED",
                strictMode: true,
                maxStrikes: 2,
                questionCount: Math.min(submission.targetQuestionGoal, submission.questions.length),
                durationMinutes: data.durationMinutes,
                requireAccessCode: true,
                requireFeeClearance: data.requireFeeClearance,
                revealScoreAfterSubmit: false,
                answersReleased: false,
                createdById: submission.teacherId,
                approvedById: actor.UserID,
                approvedAt: new Date(),
              },
            });

        scheduledExamId = examRecord.id;

        await tx.cbtScheduledExamQuestion.deleteMany({
          where: { scheduledExamId: examRecord.id },
        });

        for (let idx = 0; idx < submission.questions.length; idx++) {
          await tx.cbtScheduledExamQuestion.create({
            data: {
              scheduledExamId: examRecord.id,
              questionId: submission.questions[idx].id,
              sortOrder: idx + 1,
            },
          });
        }
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: `CBT_SUBMISSION_${transition.revisionActionLabel}`,
        entity: "CbtQuestionSubmission",
        entityId: submission.id,
        reason: data.reviewerNotes || undefined,
        newValue: {
          status: transition.nextStatus,
          reviewerId: actor.UserID,
          scheduledExamId,
          questionCount: submission.questions.length,
        },
      });
    });

    await notifyUsersDualChannel({
      senderId: actor.UserID,
      recipientUserIds: [submission.teacherId],
      subject: `Exam Submission ${transition.nextStatus.replace(/_/g, " ")}: ${submission.title}`,
      bodyText:
        data.decision === "APPROVE"
          ? `Your examination question submission for ${submission.title} (${submission.questions.length} questions) has been APPROVED by ${actor.Email} and sealed for the Examination Room.`
          : `Your examination question submission for ${submission.title} was marked ${transition.nextStatus.replace(/_/g, " ")} by ${actor.Email}. Reviewer Note: "${data.reviewerNotes}". Please update and resubmit in your Teacher Portal.`,
      dedupeKey: `decision:${submission.id}:${transition.nextStatus}:${Date.now()}`,
    });

    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/cbt");
    revalidatePath("/portal/exam-room");

    return {
      success: true,
      status: transition.nextStatus,
      scheduledExamId,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record review decision.",
    };
  }
}

/**
 * Exam Officer 1-click reminder to a teacher whose question submission is outstanding.
 */
export async function sendSubmissionReminderToTeacher(params: {
  teacherId: number;
  className: string;
  subjectName: string;
  examType: string;
  customNote?: string;
}) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMIN", "Admin", "TEACHER", "FORM_MASTER"]);
    if (!isExamOfficerOrAdmin(actor)) {
      return { success: false, error: "Forbidden" };
    }

    await notifyUsersDualChannel({
      senderId: actor.UserID,
      recipientUserIds: [Number(params.teacherId)],
      subject: `Reminder: Pending Exam Questions for ${params.className} ${params.subjectName}`,
      bodyText:
        params.customNote?.trim() ||
        `Please upload and submit your ${params.examType.replace(/_/g, " ")} questions for ${params.className} — ${params.subjectName} in the Teacher Portal so the Exam Officer can review and approve them ahead of the examination schedule.`,
      dedupeKey: `remind:${params.teacherId}:${params.className}:${params.subjectName}`,
    });

    await writeAuditLog({
      actorId: actor.UserID,
      actorRoles: Array.from(actor.roles).join(","),
      action: "CBT_SUBMISSION_REMINDER_SENT",
      entity: "User",
      entityId: String(params.teacherId),
      newValue: {
        className: params.className,
        subjectName: params.subjectName,
        examType: params.examType,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send reminder.",
    };
  }
}

/**
 * Allows the Examination Officer / Principal to configure submission deadlines for the active term,
 * automatically creating DRAFT tracker rows for assigned teachers so overdue tracking is live.
 */
export async function setSubmissionDeadlineAction(params: {
  examType: "CA_TEST" | "MIDTERM" | "TERMINAL_EXAM";
  deadlineAt: string | null;
}) {
  try {
    const actor = await requireRole(["SUPER_ADMIN", "PRINCIPAL", "ADMIN", "Admin", "TEACHER", "FORM_MASTER"]);
    if (!isExamOfficerOrAdmin(actor)) {
      return { success: false, error: "Forbidden: Examination Officer authority required." };
    }

    const activeTerm = await prisma.academic_Term.findFirst({
      where: { IsActive: true },
      orderBy: { TermID: "desc" },
    });
    if (!activeTerm) {
      return { success: false, error: "No active academic term configured." };
    }

    let deadlineDate: Date | null = null;
    if (params.deadlineAt) {
      const parsed = new Date(params.deadlineAt);
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: "Invalid submission deadline date/time." };
      }
      deadlineDate = parsed;
    }

    const allocations = await prisma.teacher_Subject_Map.findMany({
      include: {
        Class: { select: { ClassName: true } },
        Subject: { select: { SubjectName: true, SubjectCode: true } },
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const alloc of allocations) {
        const codes = mapSubjectNameToCbtCodes(alloc.Subject?.SubjectName || alloc.Subject?.SubjectCode);
        const primaryCode = codes[0] || "general";
        await tx.cbtQuestionSubmission.upsert({
          where: {
            teacherId_classId_subjectId_termId_examType: {
              teacherId: alloc.TeacherID,
              classId: alloc.ClassID,
              subjectId: alloc.SubjectID,
              termId: activeTerm.TermID,
              examType: params.examType,
            },
          },
          update: {
            deadlineAt: deadlineDate,
          },
          create: {
            teacherId: alloc.TeacherID,
            classId: alloc.ClassID,
            subjectId: alloc.SubjectID,
            subjectCode: primaryCode,
            termId: activeTerm.TermID,
            examType: params.examType,
            title: `${alloc.Class?.ClassName || "Class"} ${alloc.Subject?.SubjectName || "Subject"} (${params.examType.replace(/_/g, " ")})`,
            status: "DRAFT",
            deadlineAt: deadlineDate,
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId: actor.UserID,
        actorRoles: Array.from(actor.roles).join(","),
        action: "CBT_SUBMISSION_DEADLINE_UPDATED",
        entity: "CbtQuestionSubmission",
        entityId: `${activeTerm.TermID}:${params.examType}`,
        newValue: {
          examType: params.examType,
          deadlineAt: deadlineDate ? deadlineDate.toISOString() : null,
          affectedPapers: allocations.length,
        },
      });
    });

    revalidatePath("/portal/admin/cbt");
    revalidatePath("/portal/teacher");
    return {
      success: true,
      updatedCount: allocations.length,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update submission deadline.",
    };
  }
}
