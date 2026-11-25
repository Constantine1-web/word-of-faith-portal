"use client";

import { useState, useMemo } from "react";
import { deleteStudent } from "@/app/actions/admin";
import {
  createAdminStudentRecord,
  updateAdminStudentRecord,
  generateStudentInvitation,
  revokeStudentInvitation,
  previewBulkStudentImport,
  commitBulkStudentImport,
  reviewManualVerificationRequest,
  resolveDuplicateReviewCase,
  getStudentRegistrationDashboardData,
} from "@/app/actions/studentRegistration";
import { lookupStudentByEmail, sendDirectStudentMessage } from "@/app/actions/messaging";
import {
  FiTrash2,
  FiPlus,
  FiMail,
  FiPhone,
  FiMessageSquare,
  FiSearch,
  FiSend,
  FiCheckCircle,
  FiExternalLink,
  FiX,
  FiKey,
  FiUploadCloud,
  FiUserCheck,
  FiAlertTriangle,
  FiPrinter,
  FiEdit2,
  FiCopy,
  FiShield,
  FiDownload,
  FiRefreshCw,
  FiCreditCard,
} from "react-icons/fi";
import StudentIdCardStudio, { type StudentIdCardRecord } from "@/components/portal/StudentIdCardStudio";
import { escapeHtml } from "@/lib/html-escape";

export default function StudentsClient({
  initialStudents,
  classes,
  initialVerificationRequests = [],
  initialDuplicateCases = [],
  initialSummary,
  activeSessionName = "2026/2027",
}: {
  initialStudents: any[];
  classes: any[];
  initialVerificationRequests?: any[];
  initialDuplicateCases?: any[];
  initialSummary?: {
    totalStudents: number;
    awaitingClaim: number;
    claimedAccounts: number;
    pendingOtp: number;
    pendingManualVerification: number;
    openDuplicateCases: number;
    expiredOrRevokedInvites: number;
    missingGuardianContact: number;
  };
  activeSessionName?: string;
}) {
  const [students, setStudents] = useState<any[]>(initialStudents);
  const [verificationRequests, setVerificationRequests] = useState<any[]>(
    initialVerificationRequests
  );
  const [duplicateCases, setDuplicateCases] = useState<any[]>(initialDuplicateCases);
  const [summary, setSummary] = useState(
    initialSummary || {
      totalStudents: initialStudents.length,
      awaitingClaim: 0,
      claimedAccounts: 0,
      pendingOtp: 0,
      pendingManualVerification: initialVerificationRequests.length,
      openDuplicateCases: initialDuplicateCases.length,
      expiredOrRevokedInvites: 0,
      missingGuardianContact: 0,
    }
  );

  const [activeTab, setActiveTab] = useState<
    "DIRECTORY" | "BULK_IMPORT" | "MANUAL_QUEUE" | "DUPLICATES"
  >("DIRECTORY");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Add Individual Student Modal/Form State (No AdmissionNo required!)
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    gender: "Female",
    dateOfBirth: "2012-05-15",
    classId: classes.length > 0 ? classes[0].ClassID : 1,
    enrolmentStatus: "ACTIVE" as "ACTIVE" | "PROMOTED" | "REPEATING" | "WITHDRAWN",
    parentName: "",
    parentContact: "",
    parentEmail: "",
    isTwinOrSiblingException: false,
    siblingExceptionNote: "",
    generateInvitation: true,
    invitationExpiryDays: 14,
  });
  const [duplicateMatchesOnAdd, setDuplicateMatchesOnAdd] = useState<any[] | null>(null);

  // Generated Invitation Slip Modal State
  const [activeInviteModal, setActiveInviteModal] = useState<{
    studentName: string;
    wofsStudentId: string;
    className: string;
    plainCode: string;
    inviteUrl: string;
    expiresAt: string;
    whatsappUrl?: string | null;
  } | null>(null);

  // Edit Student Record Modal State
  const [editingStudent, setEditingStudent] = useState<any | null>(null);

  // Printable CR80 Student ID Card Modal State
  const [idCardStudents, setIdCardStudents] = useState<StudentIdCardRecord[] | null>(null);

  // Bulk CSV Import State
  const [csvText, setCsvText] = useState("");
  const [defaultBulkClassId, setDefaultBulkClassId] = useState<number>(
    classes.length > 0 ? classes[0].ClassID : 1
  );
  const [bulkPreview, setBulkPreview] = useState<any | null>(null);
  const [bulkCommitResult, setBulkCommitResult] = useState<any | null>(null);

  // Manual Verification Review Note State
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [reviewTargetStudents, setReviewTargetStudents] = useState<Record<string, string>>({});

  // Duplicate Resolution Note State
  const [dupNotes, setDupNotes] = useState<Record<string, string>>({});

  // Direct Student Messaging Modal State
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [studentEmailInput, setStudentEmailInput] = useState("");
  const [resolvedStudent, setResolvedStudent] = useState<{
    studentId?: number;
    studentName: string;
    admissionNo: string;
    className: string;
    registrationEmail: string;
    studentPhone: string;
  } | null>(null);
  const [phoneOverride, setPhoneOverride] = useState("");
  const [msgSubject, setMsgSubject] = useState("Official Notice from Word of Faith Schools");
  const [msgBody, setMsgBody] = useState("");
  const [channels, setChannels] = useState<("EMAIL" | "WHATSAPP" | "SMS")[]>([
    "EMAIL",
    "WHATSAPP",
    "SMS",
  ]);
  const [dispatching, setDispatching] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<{
    type: "success" | "error";
    text: string;
    whatsappUrl?: string | null;
    smsUrl?: string | null;
    emailSent?: boolean;
  } | null>(null);

  const refreshDashboard = async () => {
    const res = await getStudentRegistrationDashboardData();
    if (res.success) {
      setStudents(res.students || []);
      setVerificationRequests(res.verificationRequests || []);
      setDuplicateCases(res.duplicateCases || []);
      if (res.summary) setSummary(res.summary);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (classFilter !== "ALL" && String(s.ClassID) !== classFilter) {
        return false;
      }
      const regStatus =
        s.effectiveRegStatus ||
        s.RegistrationStatus ||
        (s.UserID ? "CLAIMED" : "UNCLAIMED");

      if (statusFilter === "AWAITING_CLAIM" && regStatus === "CLAIMED") return false;
      if (statusFilter === "CLAIMED" && regStatus !== "CLAIMED") return false;
      if (statusFilter === "PENDING_OTP" && regStatus !== "PENDING_OTP") return false;
      if (statusFilter === "INVITE_EXPIRED" && regStatus !== "INVITE_EXPIRED") return false;
      if (statusFilter === "NO_GUARDIAN" && s.hasGuardianContact !== false) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const name = (
        s.PreferredName ||
        `${s.FirstName || ""} ${s.MiddleName || ""} ${s.LastName || ""}`
      ).toLowerCase();
      const adm = (s.AdmissionNo || "").toLowerCase();
      const regEmail = (s.User?.Email || s.ParentEmail || "").toLowerCase();
      const phone = (s.ParentContact || "").toLowerCase();
      const clsName = (s.Class?.ClassName || "").toLowerCase();
      return (
        name.includes(q) ||
        adm.includes(q) ||
        regEmail.includes(q) ||
        phone.includes(q) ||
        clsName.includes(q)
      );
    });
  }, [students, classFilter, statusFilter, searchQuery]);

  // Create Individual Student Record
  const handleCreateStudent = async (
    e: React.FormEvent,
    forceCreateWithDuplicateFlag = false
  ) => {
    e.preventDefault();
    setLoading(true);
    setBannerFeedback(null);

    const res = await createAdminStudentRecord({
      ...formData,
      forceCreateWithDuplicateFlag,
    });
    setLoading(false);

    if (!res.success && (res as any).requiresDuplicateConfirmation) {
      setDuplicateMatchesOnAdd((res as any).duplicateMatches || []);
      return;
    }

    if (res.success && res.student) {
      setDuplicateMatchesOnAdd(null);
      setShowAdd(false);
      setFormData({
        firstName: "",
        lastName: "",
        middleName: "",
        gender: "Female",
        dateOfBirth: "2012-05-15",
        classId: classes.length > 0 ? classes[0].ClassID : 1,
        enrolmentStatus: "ACTIVE",
        parentName: "",
        parentContact: "",
        parentEmail: "",
        isTwinOrSiblingException: false,
        siblingExceptionNote: "",
        generateInvitation: true,
        invitationExpiryDays: 14,
      });

      setBannerFeedback({
        type: "success",
        text: `Student record created with permanent ID ${res.student.wofsStudentId}!`,
      });

      if (res.invitation) {
        setActiveInviteModal({
          studentName:
            res.student.PreferredName ||
            `${res.student.FirstName} ${res.student.LastName}`,
          wofsStudentId: res.student.wofsStudentId,
          className: res.student.Class?.ClassName || "Assigned Class",
          plainCode: res.invitation.plainCode,
          inviteUrl: res.invitation.inviteUrl || "",
          expiresAt: res.invitation.expiresAt.split("T")[0],
          whatsappUrl: res.invitation.whatsappUrl,
        });
      }

      await refreshDashboard();
    } else {
      setBannerFeedback({
        type: "error",
        text: res.error || "Failed to register student.",
      });
    }
  };

  // Save Edited Student Record
  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setLoading(true);
    const res = await updateAdminStudentRecord({
      studentId: editingStudent.StudentID,
      firstName: editingStudent.FirstName || "",
      lastName: editingStudent.LastName || "",
      middleName: editingStudent.MiddleName || "",
      gender: editingStudent.Gender || "Unspecified",
      dateOfBirth: editingStudent.DateOfBirth
        ? new Date(editingStudent.DateOfBirth).toISOString().split("T")[0]
        : "",
      classId: Number(editingStudent.ClassID),
      enrolmentStatus: editingStudent.EnrolmentStatus || "ACTIVE",
      parentName: editingStudent.ParentName || "",
      parentContact: editingStudent.ParentContact || "",
      parentEmail: editingStudent.ParentEmail || "",
      siblingExceptionNote: editingStudent.SiblingExceptionNote || "",
    });
    setLoading(false);

    if (res.success) {
      setEditingStudent(null);
      setBannerFeedback({
        type: "success",
        text: "Student record updated successfully.",
      });
      await refreshDashboard();
    } else {
      setBannerFeedback({
        type: "error",
        text: res.error || "Failed to update student record.",
      });
    }
  };

  // Generate Single-Use Invitation for a Student
  const handleIssueInvitation = async (student: any, sendDispatchNow = false) => {
    setLoading(true);
    setBannerFeedback(null);
    const res = await generateStudentInvitation({
      studentId: student.StudentID,
      channel: sendDispatchNow ? "EMAIL" : "SLIP",
      expiryDays: 14,
      sendDispatchNow,
    });
    setLoading(false);

    if (res.success && res.invitation) {
      setActiveInviteModal({
        studentName: res.invitation.studentName,
        wofsStudentId: res.invitation.wofsStudentId,
        className: res.invitation.className,
        plainCode: res.invitation.plainCode,
        inviteUrl: res.invitation.inviteUrl,
        expiresAt: res.invitation.expiresAt.split("T")[0],
        whatsappUrl: res.invitation.whatsappUrl,
      });
      await refreshDashboard();
    } else {
      setBannerFeedback({
        type: "error",
        text: res.error || "Failed to generate invitation.",
      });
    }
  };

  const handleRevokeInvitation = async (claimId: string, wofsId: string) => {
    const reason = prompt(
      `Enter reason for revoking the active invitation for ${wofsId}:`,
      "Revoked by administrator"
    );
    if (reason === null) return;
    setLoading(true);
    const res = await revokeStudentInvitation(claimId, reason);
    setLoading(false);
    if (res.success) {
      setBannerFeedback({
        type: "success",
        text: `Invitation for ${wofsId} has been revoked.`,
      });
      await refreshDashboard();
    } else {
      setBannerFeedback({
        type: "error",
        text: res.error || "Failed to revoke invitation.",
      });
    }
  };

  const handlePrintSlip = (slip: {
    studentName: string;
    wofsStudentId: string;
    className: string;
    plainCode: string;
    inviteUrl: string;
    expiresAt: string;
  }) => {
    const win = window.open("", "_blank", "width=760,height=650");
    if (!win) return;
    const safeId = escapeHtml(slip.wofsStudentId);
    const safeName = escapeHtml(slip.studentName);
    const safeClass = escapeHtml(slip.className);
    const safeCode = escapeHtml(slip.plainCode);
    const safeExp = escapeHtml(slip.expiresAt);
    const safeUrl = escapeHtml(slip.inviteUrl);
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Registration Slip — ${safeId}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #0f172a; }
            .slip { border: 2px solid #0A2540; border-radius: 12px; padding: 28px; max-width: 620px; margin: 0 auto; }
            .header { border-bottom: 3px double #15803d; padding-bottom: 12px; margin-bottom: 18px; text-align: center; }
            .school { font-size: 20px; font-weight: 800; color: #0A2540; text-transform: uppercase; margin: 0; }
            .sub { font-size: 12px; color: #15803d; font-weight: 700; margin-top: 4px; }
            .box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 16px 0; }
            .code { font-family: monospace; font-size: 22px; font-weight: 900; color: #15803d; letter-spacing: 2px; }
          </style>
        </head>
        <body>
          <div class="slip">
            <div class="header">
              <p class="school">Word of Faith Schools</p>
              <p class="sub">OFFICIAL STUDENT PORTAL REGISTRATION INVITATION SLIP</p>
            </div>
            <p><strong>Student Name:</strong> ${safeName}</p>
            <p><strong>Assigned Class:</strong> ${safeClass}</p>
            <p><strong>Permanent WOFS Student ID:</strong> <code style="font-size: 16px; font-weight: bold;">${safeId}</code></p>
            <div class="box">
              <div style="font-size: 12px; text-transform: uppercase; color: #475569; font-weight: bold;">Single-Use Registration Invitation Code</div>
              <div class="code">${safeCode}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Valid until: ${safeExp} &middot; Redeemable once at <strong>/portal/register</strong></div>
            </div>
            <p style="font-size: 12px; color: #475569;">Direct Claim Link: ${safeUrl}</p>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // Bulk Import Handlers
  const handleDownloadCsvTemplate = () => {
    const template = [
      "FirstName,LastName,MiddleName,Gender,DateOfBirth,ClassName,ParentName,ParentPhone,ParentEmail,TwinOrSibling",
      "Chisom,Okafor,Grace,Female,2013-04-12,JSS 1A,Mrs. Okafor,08031234567,parent1@example.com,NO",
      "Kelechi,Okafor,David,Male,2013-04-12,JSS 1A,Mrs. Okafor,08031234567,parent1@example.com,YES",
    ].join("\n");
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "WOFS_Bulk_Student_Registration_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handlePreviewBulk = async () => {
    setLoading(true);
    setBannerFeedback(null);
    setBulkCommitResult(null);
    const res = await previewBulkStudentImport(csvText, defaultBulkClassId);
    setLoading(false);
    if (res.success) {
      setBulkPreview(res);
    } else {
      setBannerFeedback({ type: "error", text: res.error || "Failed to preview CSV." });
    }
  };

  const handleCommitBulk = async () => {
    if (!bulkPreview?.rows) return;
    const validRows = bulkPreview.rows
      .filter((r: any) => r.status !== "ERROR" && r.classId)
      .map((r: any) => ({
        rowNumber: r.rowNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName,
        gender: r.gender,
        dateOfBirth: r.dateOfBirth,
        classId: r.classId,
        parentName: r.parentName,
        parentContact: r.parentContact,
        parentEmail: r.parentEmail,
        isTwinOrSiblingException: r.isTwinOrSiblingException,
      }));

    setLoading(true);
    const res = await commitBulkStudentImport(validRows);
    setLoading(false);
    if (res.success) {
      setBulkCommitResult(res);
      setBulkPreview(null);
      setCsvText("");
      await refreshDashboard();
    } else {
      setBannerFeedback({ type: "error", text: res.error || "Bulk import failed." });
    }
  };

  // Manual Verification Queue Review Handler
  const handleManualReviewDecision = async (
    requestId: string,
    decision: "APPROVED" | "IN_PERSON_REQUIRED" | "DECLINED"
  ) => {
    const reason =
      (reviewReasons[requestId] || "").trim() ||
      (decision === "APPROVED"
        ? "Verified against school class register"
        : decision === "IN_PERSON_REQUIRED"
        ? "Please report to the school administrative office for in-person verification"
        : "");

    if (!reason) {
      alert("Please enter a verification reason or note before submitting your decision.");
      return;
    }

    const targetId = reviewTargetStudents[requestId]
      ? parseInt(reviewTargetStudents[requestId], 10)
      : undefined;

    setLoading(true);
    const res = await reviewManualVerificationRequest({
      requestId,
      decision,
      reason,
      targetStudentId: targetId,
    });
    setLoading(false);

    if (res.success) {
      setBannerFeedback({
        type: "success",
        text:
          decision === "APPROVED"
            ? `Request approved! Assigned WOFS ID: ${(res as any).wofsStudentId}`
            : `Request marked as ${decision.replace(/_/g, " ")}.`,
      });
      await refreshDashboard();
    } else {
      setBannerFeedback({
        type: "error",
        text: res.error || "Failed to process verification decision.",
      });
    }
  };

  // Duplicate Review Case Handler
  const handleResolveDuplicate = async (
    caseId: string,
    resolution: "CLEARED_TWIN_SIBLING" | "CLEARED_DISTINCT" | "CONFIRMED_DUPLICATE"
  ) => {
    const note =
      (dupNotes[caseId] || "").trim() ||
      (resolution === "CLEARED_TWIN_SIBLING"
        ? "Verified Twin / Sibling exception sharing family guardian contact"
        : resolution === "CLEARED_DISTINCT"
        ? "Verified distinct student records"
        : "Confirmed duplicate registration attempt");

    setLoading(true);
    const res = await resolveDuplicateReviewCase({
      caseId,
      resolution,
      resolutionNote: note,
    });
    setLoading(false);

    if (res.success) {
      setBannerFeedback({
        type: "success",
        text: `Duplicate review case resolved as ${resolution.replace(/_/g, " ")}.`,
      });
      await refreshDashboard();
    } else {
      setBannerFeedback({
        type: "error",
        text: res.error || "Failed to resolve duplicate case.",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this student record?")) return;
    const res = await deleteStudent(id);
    if (res.success) {
      setStudents(students.filter((s) => s.StudentID !== id));
    } else {
      alert(res.error);
    }
  };

  const openDirectMessageForStudent = (student?: any) => {
    setDispatchFeedback(null);
    if (student) {
      const regEmail = student.User?.Email || student.ParentEmail || "";
      const phone =
        student.ParentContact && student.ParentContact !== "08000000000"
          ? student.ParentContact
          : "";
      const name =
        student.PreferredName ||
        `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
        student.AdmissionNo;

      setStudentEmailInput(regEmail || student.AdmissionNo);
      setResolvedStudent({
        studentId: student.StudentID,
        studentName: name,
        admissionNo: student.AdmissionNo,
        className: student.Class?.ClassName || "General",
        registrationEmail: regEmail,
        studentPhone: phone,
      });
      setPhoneOverride(phone);
    } else {
      setStudentEmailInput("");
      setResolvedStudent(null);
      setPhoneOverride("");
    }
    setShowMessageModal(true);
  };

  const handleLookupByEmail = async () => {
    if (!studentEmailInput.trim()) return;
    setLookingUp(true);
    setDispatchFeedback(null);
    const res = await lookupStudentByEmail(studentEmailInput.trim());
    setLookingUp(false);
    if (res.success && res.student) {
      setResolvedStudent(res.student);
      setPhoneOverride(
        res.student.studentPhone && res.student.studentPhone !== "08000000000"
          ? res.student.studentPhone
          : ""
      );
    } else {
      setResolvedStudent(null);
      setDispatchFeedback({
        type: "error",
        text: res.error || "Student not found by that email or WOFS Student ID.",
      });
    }
  };

  const toggleChannel = (ch: "EMAIL" | "WHATSAPP" | "SMS") => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetIdentifier = resolvedStudent?.studentId || studentEmailInput.trim();
    if (!targetIdentifier || channels.length === 0) return;

    setDispatching(true);
    setDispatchFeedback(null);

    const res = await sendDirectStudentMessage({
      studentIdentifier: targetIdentifier,
      subject: msgSubject,
      message: msgBody,
      channels,
      phoneOverride: phoneOverride.trim() || undefined,
    });

    setDispatching(false);
    if (res.success) {
      setDispatchFeedback({
        type: "success",
        text: `Direct message dispatched for ${res.studentName} (${res.admissionNo}).`,
        whatsappUrl: res.whatsappUrl,
        smsUrl: res.smsUrl,
        emailSent: res.emailSent,
      });
    } else {
      setDispatchFeedback({
        type: "error",
        text: res.error || "Failed to send direct message.",
      });
    }
  };

  return (
    <div>
      {/* Top KPI Summary Cards (Requirement 8) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 175px), 1fr))",
          gap: "0.85rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          { label: "Total Students", value: summary.totalStudents, filter: "ALL" },
          { label: "Awaiting Claim", value: summary.awaitingClaim, filter: "AWAITING_CLAIM" },
          { label: "Claimed Accounts", value: summary.claimedAccounts, filter: "CLAIMED" },
          { label: "Pending OTP", value: summary.pendingOtp, filter: "PENDING_OTP" },
          {
            label: "Manual Review Queue",
            value: summary.pendingManualVerification,
            tab: "MANUAL_QUEUE" as const,
          },
          {
            label: "Duplicate / Twin Cases",
            value: summary.openDuplicateCases,
            tab: "DUPLICATES" as const,
          },
          {
            label: "Expired / Revoked Invites",
            value: summary.expiredOrRevokedInvites,
            filter: "INVITE_EXPIRED",
          },
          {
            label: "No Guardian Contact",
            value: summary.missingGuardianContact,
            filter: "NO_GUARDIAN",
          },
        ].map((kpi, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (kpi.tab) {
                setActiveTab(kpi.tab);
              } else if (kpi.filter) {
                setActiveTab("DIRECTORY");
                setStatusFilter(kpi.filter);
              }
            }}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-sm)",
              padding: "0.85rem 1rem",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: "1.45rem",
                fontWeight: 800,
                color: "var(--text-heading)",
                marginTop: "0.2rem",
              }}
            >
              {kpi.value}
            </div>
          </button>
        ))}
      </div>

      {/* Mode Navigation Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border-primary)",
          paddingBottom: "0.75rem",
        }}
      >
        {[
          {
            id: "DIRECTORY",
            label: `Student Directory & Invitations (${students.length})`,
            icon: <FiKey />,
          },
          {
            id: "BULK_IMPORT",
            label: "Bulk CSV / Roster Import",
            icon: <FiUploadCloud />,
          },
          {
            id: "MANUAL_QUEUE",
            label: `Manual Verification Queue (${summary.pendingManualVerification})`,
            icon: <FiUserCheck />,
          },
          {
            id: "DUPLICATES",
            label: `Duplicate & Twin Review (${summary.openDuplicateCases})`,
            icon: <FiAlertTriangle />,
          },
        ].map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.6rem 1.1rem",
                borderRadius: "var(--radius-sm)",
                border: isActive
                  ? "1px solid var(--brand-primary)"
                  : "1px solid var(--border-primary)",
                background: isActive ? "var(--brand-primary)" : "var(--bg-card)",
                color: isActive ? "var(--brand-primary-text)" : "var(--text-primary)",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {bannerFeedback && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1.25rem",
            background:
              bannerFeedback.type === "error"
                ? "var(--status-error-bg)"
                : "var(--status-success-bg)",
            color:
              bannerFeedback.type === "error"
                ? "var(--status-error-text)"
                : "var(--status-success-text)",
            border: `1px solid ${
              bannerFeedback.type === "error"
                ? "var(--status-error-border)"
                : "var(--status-success-border)"
            }`,
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{bannerFeedback.text}</span>
          <button
            type="button"
            onClick={() => setBannerFeedback(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <FiX />
          </button>
        </div>
      )}

      {/* ====================================================================
          TAB 1: STUDENT DIRECTORY & REGISTRATION INVITATIONS
         ==================================================================== */}
      {activeTab === "DIRECTORY" && (
        <>
          {/* Filter & Action Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.25rem",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", flex: "1 1 420px" }}>
              <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "360px" }}>
                <FiSearch
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search name, WOFS-STU ID, class, or contact..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: "2.25rem" }}
                />
              </div>

              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="form-input"
                style={{ width: "auto", minWidth: "150px" }}
              >
                <option value="ALL">All Classes &amp; Arms</option>
                {classes.map((c) => (
                  <option key={c.ClassID} value={String(c.ClassID)}>
                    {c.ClassName}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-input"
                style={{ width: "auto", minWidth: "165px" }}
              >
                <option value="ALL">All Registration States</option>
                <option value="AWAITING_CLAIM">Awaiting Account Claim</option>
                <option value="CLAIMED">Claimed Accounts</option>
                <option value="PENDING_OTP">Pending OTP Verification</option>
                <option value="INVITE_EXPIRED">Expired / Revoked Invites</option>
                <option value="NO_GUARDIAN">Missing Guardian Contact</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  if (filteredStudents.length === 0) {
                    setBannerFeedback({
                      type: "error",
                      text: "No matching students in the current filter to generate ID cards for.",
                    });
                    return;
                  }
                  setIdCardStudents(filteredStudents.slice(0, 60));
                }}
                className="btn btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                title="Generate CR80 printable Student ID cards for the filtered students"
              >
                <FiCreditCard /> Batch ID Cards ({Math.min(filteredStudents.length, 60)})
              </button>

              <button
                type="button"
                onClick={() => openDirectMessageForStudent()}
                className="btn btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
              >
                <FiSend /> Direct Message
              </button>

              <button
                type="button"
                onClick={() => {
                  setDuplicateMatchesOnAdd(null);
                  setShowAdd(!showAdd);
                }}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
              >
                <FiPlus /> Register New Student
              </button>
            </div>
          </div>

          {/* Register Individual Student Form (Auto-mints WOFS-STU-YYYY-NNNNNN) */}
          {showAdd && (
            <form
              onSubmit={(e) => handleCreateStudent(e, false)}
              style={{
                background: "var(--bg-card)",
                padding: "1.5rem",
                borderRadius: "var(--radius-md)",
                marginBottom: "1.75rem",
                display: "grid",
                gap: "1rem",
                boxShadow: "var(--shadow-sm)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, color: "var(--text-heading)" }}>
                    Register New Student Record
                  </h3>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                    No old admission number is required. A permanent <strong>WOFS-STU</strong> ID and single-use claim invitation will be generated automatically.
                  </p>
                </div>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    background: "var(--status-info-bg)",
                    color: "var(--status-info-text)",
                    border: "1px solid var(--status-info-border)",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                  }}
                >
                  Auto-ID: WOFS-STU-{new Date().getFullYear()}-XXXXXX
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
                  gap: "0.85rem",
                }}
              >
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Chisom"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Surname / Last Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Okafor"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Middle Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Optional"
                    value={formData.middleName}
                    onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Gender *</label>
                  <select
                    className="form-input"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Assigned Class &amp; Arm *</label>
                  <select
                    className="form-input"
                    value={formData.classId}
                    onChange={(e) =>
                      setFormData({ ...formData, classId: parseInt(e.target.value, 10) })
                    }
                  >
                    {classes.map((c) => (
                      <option key={c.ClassID} value={c.ClassID}>
                        {c.ClassName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Parent / Guardian Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Mrs. Grace Okafor"
                    value={formData.parentName}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Guardian Phone (WhatsApp / SMS)</label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="e.g. 08031234567"
                    value={formData.parentContact}
                    onChange={(e) => setFormData({ ...formData, parentContact: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Guardian Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Optional guardian email"
                    value={formData.parentEmail}
                    onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1.5rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                  background: "var(--bg-secondary)",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.generateInvitation}
                    onChange={(e) =>
                      setFormData({ ...formData, generateInvitation: e.target.checked })
                    }
                  />
                  Generate single-use registration invitation immediately
                </label>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.isTwinOrSiblingException}
                    onChange={(e) =>
                      setFormData({ ...formData, isTwinOrSiblingException: e.target.checked })
                    }
                  />
                  Twin / Sibling Exception (shares family contact or birth date)
                </label>
              </div>

              {formData.isTwinOrSiblingException && (
                <div>
                  <label className="form-label">Twin / Sibling Exception Note</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Twin sibling of Chisom Okafor in JSS 1A"
                    value={formData.siblingExceptionNote}
                    onChange={(e) =>
                      setFormData({ ...formData, siblingExceptionNote: e.target.value })
                    }
                  />
                </div>
              )}

              {/* Duplicate Detection Warning Box */}
              {duplicateMatchesOnAdd && duplicateMatchesOnAdd.length > 0 && (
                <div
                  style={{
                    background: "var(--status-warning-bg)",
                    color: "var(--status-warning-text)",
                    border: "1px solid var(--status-warning-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "1rem",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <FiAlertTriangle /> Possible Duplicate Student Record Detected
                  </div>
                  <ul style={{ margin: "0 0 0.75rem 1.25rem", fontSize: "0.85rem" }}>
                    {duplicateMatchesOnAdd.map((m, i) => (
                      <li key={i}>
                        <strong>{m.fullName}</strong> ({m.wofsStudentId}) in{" "}
                        <strong>{m.className}</strong> &middot; DOB: {m.dateOfBirth} &middot;{" "}
                        {Math.round(m.confidenceScore * 100)}% similarity
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        setFormData((prev) => ({ ...prev, isTwinOrSiblingException: true }));
                        handleCreateStudent(e as any, true);
                      }}
                      className="btn btn-primary"
                      style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem" }}
                    >
                      Approve as Twin / Sibling &amp; Create Record
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplicateMatchesOnAdd(null)}
                      className="btn btn-outline"
                      style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading ? "Registering Student..." : "Create Student & Generate WOFS ID"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Students Directory Table */}
          <div
            style={{
              overflowX: "auto",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-sm)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border-primary)",
                  }}
                >
                  <th style={{ padding: "0.85rem 1rem", textAlign: "left", fontSize: "0.8rem" }}>
                    Student Name
                  </th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "left", fontSize: "0.8rem" }}>
                    Permanent WOFS ID
                  </th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "left", fontSize: "0.8rem" }}>
                    Class &amp; Arm
                  </th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "left", fontSize: "0.8rem" }}>
                    Account &amp; Invite Status
                  </th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "left", fontSize: "0.8rem" }}>
                    Guardian Contact
                  </th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "right", fontSize: "0.8rem" }}>
                    Registration &amp; Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      No student records match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const isClaimed = Boolean(s.UserID && s.User?.IsActive);
                    const regStatus =
                      s.effectiveRegStatus ||
                      s.RegistrationStatus ||
                      (isClaimed ? "CLAIMED" : "UNCLAIMED");
                    const phone =
                      s.ParentContact && s.ParentContact !== "08000000000"
                        ? s.ParentContact
                        : null;
                    const email = s.User?.Email || s.ParentEmail || null;

                    return (
                      <tr
                        key={s.StudentID}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <td style={{ padding: "0.85rem 1rem" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-heading)" }}>
                            {s.PreferredName ||
                              `${s.FirstName || ""} ${s.LastName || ""}`.trim() ||
                              s.AdmissionNo}
                          </div>
                          {s.SiblingExceptionNote && (
                            <div
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--status-info-text)",
                                fontWeight: 600,
                              }}
                            >
                              Twin/Sibling: {s.SiblingExceptionNote}
                            </div>
                          )}
                        </td>

                        <td
                          style={{
                            padding: "0.85rem 1rem",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            fontSize: "0.88rem",
                            color: "var(--text-heading)",
                          }}
                        >
                          {s.AdmissionNo}
                        </td>

                        <td style={{ padding: "0.85rem 1rem", fontSize: "0.88rem" }}>
                          <div>{s.Class?.ClassName || "Unassigned"}</div>
                          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                            {s.EnrolmentStatus || "ACTIVE"}
                          </div>
                        </td>

                        <td style={{ padding: "0.85rem 1rem", fontSize: "0.82rem" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "999px",
                              fontWeight: 700,
                              fontSize: "0.74rem",
                              background:
                                regStatus === "CLAIMED"
                                  ? "var(--status-success-bg)"
                                  : regStatus === "PENDING_OTP" || regStatus === "INVITED"
                                  ? "var(--status-info-bg)"
                                  : "var(--status-warning-bg)",
                              color:
                                regStatus === "CLAIMED"
                                  ? "var(--status-success-text)"
                                  : regStatus === "PENDING_OTP" || regStatus === "INVITED"
                                  ? "var(--status-info-text)"
                                  : "var(--status-warning-text)",
                            }}
                          >
                            {regStatus.replace(/_/g, " ")}
                          </span>
                          {s.latestClaim && !isClaimed && (
                            <div
                              style={{
                                fontSize: "0.73rem",
                                color: "var(--text-muted)",
                                marginTop: "0.2rem",
                                fontFamily: "monospace",
                              }}
                            >
                              {s.latestClaim.maskedCode} ({s.latestClaim.status})
                            </div>
                          )}
                        </td>

                        <td style={{ padding: "0.85rem 1rem", fontSize: "0.84rem" }}>
                          {email ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <FiMail size={13} color="var(--brand-primary)" /> {email}
                            </div>
                          ) : null}
                          {phone ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <FiPhone size={13} color="var(--status-info-text)" /> {phone}
                            </div>
                          ) : null}
                          {!email && !phone && (
                            <span
                              style={{
                                fontSize: "0.76rem",
                                color: "var(--status-warning-text)",
                                fontWeight: 600,
                              }}
                            >
                              No guardian contact on file
                            </span>
                          )}
                        </td>

                        <td
                          style={{
                            padding: "0.85rem 1rem",
                            textAlign: "right",
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "0.4rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {!isClaimed && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleIssueInvitation(s, false)}
                                title="Generate Single-Use Registration Invitation Slip"
                                style={{
                                  background: "var(--status-info-bg)",
                                  color: "var(--status-info-text)",
                                  border: "1px solid var(--status-info-border)",
                                  borderRadius: "6px",
                                  padding: "0.38rem 0.65rem",
                                  fontSize: "0.78rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.3rem",
                                }}
                              >
                                <FiKey size={13} /> Invite Slip
                              </button>

                              {s.latestClaim && s.latestClaim.status === "ACTIVE" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRevokeInvitation(s.latestClaim.id, s.AdmissionNo)
                                  }
                                  title="Revoke Active Invitation"
                                  style={{
                                    background: "var(--status-warning-bg)",
                                    color: "var(--status-warning-text)",
                                    border: "1px solid var(--status-warning-border)",
                                    borderRadius: "6px",
                                    padding: "0.38rem 0.55rem",
                                    fontSize: "0.76rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Revoke
                                </button>
                              )}
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setIdCardStudents([s])}
                            title="Preview & Print CR80 Student ID Card with QR Verification"
                            style={{
                              background: "var(--status-purple-bg)",
                              color: "var(--status-purple-text)",
                              border: "1px solid var(--status-purple-border)",
                              borderRadius: "6px",
                              padding: "0.38rem 0.55rem",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <FiCreditCard size={13} /> ID Card
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingStudent({ ...s })}
                            title="Review & Edit Student Record"
                            style={{
                              background: "var(--bg-secondary)",
                              color: "var(--text-primary)",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "6px",
                              padding: "0.38rem 0.55rem",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <FiEdit2 size={13} /> Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => openDirectMessageForStudent(s)}
                            title="Send Direct Email, WhatsApp, or SMS"
                            style={{
                              background: "var(--status-success-bg)",
                              color: "var(--status-success-text)",
                              border: "1px solid var(--status-success-border)",
                              borderRadius: "6px",
                              padding: "0.38rem 0.6rem",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <FiMessageSquare size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(s.StudentID)}
                            title="Delete Student"
                            style={{
                              color: "var(--status-error-text)",
                              background: "var(--status-error-bg)",
                              border: "1px solid var(--status-error-border)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              padding: "0.38rem 0.55rem",
                            }}
                          >
                            <FiTrash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ====================================================================
          TAB 2: BULK CSV / SPREADSHEET STUDENT IMPORT WIZARD
         ==================================================================== */}
      {activeTab === "BULK_IMPORT" && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: "var(--text-heading)" }}>
                Bulk Student Registration &amp; Invitation Generator
              </h3>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                Import class rosters from CSV or Excel without requiring admission numbers. Every student automatically receives a unique <strong>WOFS-STU</strong> ID and a single-use claim invitation.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              className="btn btn-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <FiDownload /> Download CSV Template
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="form-label">Upload CSV File</label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleCsvFileUpload}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">Default Class (if blank in CSV)</label>
              <select
                className="form-input"
                value={defaultBulkClassId}
                onChange={(e) => setDefaultBulkClassId(parseInt(e.target.value, 10))}
              >
                {classes.map((c) => (
                  <option key={c.ClassID} value={c.ClassID}>
                    {c.ClassName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label">
              Or Paste CSV Rows (FirstName,LastName,MiddleName,Gender,DateOfBirth,ClassName,ParentName,ParentPhone,ParentEmail,TwinOrSibling)
            </label>
            <textarea
              rows={5}
              className="form-input"
              placeholder="Chisom,Okafor,Grace,Female,2013-04-12,JSS 1A,Mrs. Okafor,08031234567,parent@example.com,NO"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </div>

          <button
            type="button"
            onClick={handlePreviewBulk}
            disabled={loading || !csvText.trim()}
            className="btn btn-primary"
          >
            {loading ? "Validating Records..." : "Validate & Preview Bulk Import"}
          </button>

          {bulkPreview && (
            <div style={{ marginTop: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1rem",
                  padding: "0.85rem 1rem",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-heading)" }}>
                  Validation Summary: {bulkPreview.summary.validCount} Valid &middot;{" "}
                  {bulkPreview.summary.duplicateWarningCount} Duplicate Warnings &middot;{" "}
                  {bulkPreview.summary.errorCount} Errors
                </div>
                <button
                  type="button"
                  onClick={handleCommitBulk}
                  disabled={loading || bulkPreview.summary.validCount === 0}
                  className="btn btn-primary"
                >
                  {loading
                    ? "Importing & Generating WOFS IDs..."
                    : `Commit Import (${bulkPreview.summary.validCount} Students)`}
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)" }}>
                      <th style={{ padding: "0.6rem", textAlign: "left" }}>Row</th>
                      <th style={{ padding: "0.6rem", textAlign: "left" }}>Full Name</th>
                      <th style={{ padding: "0.6rem", textAlign: "left" }}>DOB</th>
                      <th style={{ padding: "0.6rem", textAlign: "left" }}>Class</th>
                      <th style={{ padding: "0.6rem", textAlign: "left" }}>Guardian</th>
                      <th style={{ padding: "0.6rem", textAlign: "left" }}>Validation Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.rows.map((r: any) => (
                      <tr
                        key={r.rowNumber}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <td style={{ padding: "0.6rem" }}>#{r.rowNumber}</td>
                        <td style={{ padding: "0.6rem", fontWeight: 700 }}>
                          {r.firstName} {r.middleName} {r.lastName}
                        </td>
                        <td style={{ padding: "0.6rem" }}>{r.dateOfBirth}</td>
                        <td style={{ padding: "0.6rem" }}>{r.className}</td>
                        <td style={{ padding: "0.6rem" }}>
                          {r.parentName || r.parentContact || r.parentEmail || "None"}
                        </td>
                        <td style={{ padding: "0.6rem" }}>
                          {r.status === "ERROR" ? (
                            <span style={{ color: "var(--status-error-text)", fontWeight: 700 }}>
                              Error: {r.errors.join(", ")}
                            </span>
                          ) : r.warnings.length > 0 ? (
                            <span style={{ color: "var(--status-warning-text)", fontWeight: 600 }}>
                              {r.warnings.join("; ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--status-success-text)", fontWeight: 700 }}>
                              Ready to Import
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {bulkCommitResult && (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1.25rem",
                background: "var(--status-success-bg)",
                color: "var(--status-success-text)",
                border: "1px solid var(--status-success-border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--status-success-text)" }}>
                Bulk Import Complete: {bulkCommitResult.importedCount} Imported &middot;{" "}
                {bulkCommitResult.rejectedCount} Skipped/Rejected
              </h4>
              {bulkCommitResult.importedSlips?.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.82rem",
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)" }}>
                        <th style={{ padding: "0.55rem", textAlign: "left" }}>Student Name</th>
                        <th style={{ padding: "0.55rem", textAlign: "left" }}>Class</th>
                        <th style={{ padding: "0.55rem", textAlign: "left" }}>
                          Permanent WOFS ID
                        </th>
                        <th style={{ padding: "0.55rem", textAlign: "left" }}>
                          One-Time Invite Code
                        </th>
                        <th style={{ padding: "0.55rem", textAlign: "right" }}>Slip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkCommitResult.importedSlips.map((slip: any) => (
                        <tr
                          key={slip.wofsStudentId}
                          style={{ borderBottom: "1px solid var(--border-subtle)" }}
                        >
                          <td style={{ padding: "0.55rem", fontWeight: 700 }}>{slip.fullName}</td>
                          <td style={{ padding: "0.55rem" }}>{slip.className}</td>
                          <td style={{ padding: "0.55rem", fontFamily: "monospace", fontWeight: 700 }}>
                            {slip.wofsStudentId}
                          </td>
                          <td style={{ padding: "0.55rem", fontFamily: "monospace", fontWeight: 800 }}>
                            {slip.invitationCode}
                          </td>
                          <td style={{ padding: "0.55rem", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() =>
                                handlePrintSlip({
                                  studentName: slip.fullName,
                                  wofsStudentId: slip.wofsStudentId,
                                  className: slip.className,
                                  plainCode: slip.invitationCode,
                                  inviteUrl: slip.inviteUrl,
                                  expiresAt: slip.expiresAt,
                                })
                              }
                              className="btn btn-outline"
                              style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                            >
                              <FiPrinter /> Print Slip
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 3: MANUAL REGISTRATION VERIFICATION QUEUE (Pathway 4)
         ==================================================================== */}
      {activeTab === "MANUAL_QUEUE" && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ margin: "0 0 0.35rem 0", color: "var(--text-heading)" }}>
            Manual Registration Verification Queue
          </h3>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
            Review registration requests from students without verified guardian contact details on file. Verify against school records or conduct an in-person check before approving.
          </p>

          {verificationRequests.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--text-muted)",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              No manual verification requests in the queue.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              {verificationRequests.map((req) => {
                const isResolved = req.status === "APPROVED" || req.status === "DECLINED";
                return (
                  <div
                    key={req.id}
                    style={{
                      border: "1px solid var(--border-primary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "1.1rem",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.65rem",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: "0.85rem",
                            color: "var(--text-heading)",
                            marginRight: "0.65rem",
                          }}
                        >
                          {req.referenceCode}
                        </span>
                        <strong style={{ fontSize: "1.02rem", color: "var(--text-heading)" }}>
                          {req.firstName} {req.middleName || ""} {req.lastName}
                        </strong>
                      </div>

                      <span
                        style={{
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          background:
                            req.status === "APPROVED"
                              ? "var(--status-success-bg)"
                              : req.status === "DECLINED"
                              ? "var(--status-error-bg)"
                              : "var(--status-warning-bg)",
                          color:
                            req.status === "APPROVED"
                              ? "var(--status-success-text)"
                              : req.status === "DECLINED"
                              ? "var(--status-error-text)"
                              : "var(--status-warning-text)",
                        }}
                      >
                        {req.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                        gap: "0.5rem",
                        fontSize: "0.83rem",
                        color: "var(--text-secondary)",
                        marginBottom: "0.85rem",
                      }}
                    >
                      <div>
                        <strong>DOB:</strong>{" "}
                        {req.dateOfBirth ? new Date(req.dateOfBirth).toISOString().split("T")[0] : "N/A"}
                      </div>
                      <div>
                        <strong>Contact Email:</strong> {req.contactEmail}
                      </div>
                      <div>
                        <strong>Contact Phone:</strong> {req.contactPhone || req.guardianPhone || "N/A"}
                      </div>
                      <div>
                        <strong>Reason:</strong> {req.reasonForManual}
                      </div>
                    </div>

                    {!isResolved ? (
                      <div
                        style={{
                          display: "grid",
                          gap: "0.65rem",
                          borderTop: "1px solid var(--border-subtle)",
                          paddingTop: "0.85rem",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                            gap: "0.65rem",
                          }}
                        >
                          <div>
                            <label className="form-label" style={{ fontSize: "0.78rem" }}>
                              Link to Existing Unclaimed Student (or leave blank to mint new WOFS ID)
                            </label>
                            <select
                              className="form-input"
                              value={reviewTargetStudents[req.id] ?? (req.studentId ? String(req.studentId) : "")}
                              onChange={(e) =>
                                setReviewTargetStudents({
                                  ...reviewTargetStudents,
                                  [req.id]: e.target.value,
                                })
                              }
                            >
                              <option value="">Auto-Mint New WOFS-STU Record on Approval</option>
                              {students
                                .filter((st) => !st.UserID)
                                .map((st) => (
                                  <option key={st.StudentID} value={String(st.StudentID)}>
                                    {st.PreferredName || `${st.FirstName} ${st.LastName}`} (
                                    {st.AdmissionNo} — {st.Class?.ClassName})
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div>
                            <label className="form-label" style={{ fontSize: "0.78rem" }}>
                              Verification Decision Note / Reason *
                            </label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. Verified against JSS 1A register in person"
                              value={reviewReasons[req.id] || ""}
                              onChange={(e) =>
                                setReviewReasons({ ...reviewReasons, [req.id]: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleManualReviewDecision(req.id, "APPROVED")}
                            className="btn btn-primary"
                            style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}
                          >
                            Approve &amp; Activate Account
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() =>
                              handleManualReviewDecision(req.id, "IN_PERSON_REQUIRED")
                            }
                            className="btn btn-outline"
                            style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}
                          >
                            Require In-Person Check
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleManualReviewDecision(req.id, "DECLINED")}
                            style={{
                              padding: "0.45rem 0.9rem",
                              fontSize: "0.82rem",
                              background: "var(--status-error-bg)",
                              color: "var(--status-error-text)",
                              border: "1px solid var(--status-error-border)",
                              borderRadius: "var(--radius-sm)",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Decline Request
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        <strong>Decision Note:</strong> {req.decisionReason || "Recorded"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 4: DUPLICATE & TWIN / SIBLING REVIEW QUEUE (Requirement 5)
         ==================================================================== */}
      {activeTab === "DUPLICATES" && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ margin: "0 0 0.35rem 0", color: "var(--text-heading)" }}>
            Duplicate Detection &amp; Twin/Sibling Exception Queue
          </h3>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
            Multi-signal identity matches and biometric photo matches are flagged here for investigation rather than automatically rejecting legitimate twins or siblings.
          </p>

          {duplicateCases.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--text-muted)",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              No duplicate review cases flagged.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              {duplicateCases.map((c) => {
                const primarySt = students.find((s) => s.StudentID === c.primaryStudentId);
                const candidateSt = students.find((s) => s.StudentID === c.candidateStudentId);
                return (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid var(--border-primary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "1.1rem",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.65rem",
                      }}
                    >
                      <strong style={{ color: "var(--text-heading)", fontSize: "0.95rem" }}>
                        Match Type: {c.matchType.replace(/_/g, " ")}
                      </strong>
                      <span
                        style={{
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          background:
                            c.status === "OPEN"
                              ? "var(--status-warning-bg)"
                              : "var(--status-success-bg)",
                          color:
                            c.status === "OPEN"
                              ? "var(--status-warning-text)"
                              : "var(--status-success-text)",
                        }}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                        gap: "0.75rem",
                        fontSize: "0.84rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          background: "var(--bg-card)",
                          padding: "0.75rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <strong>Primary Student:</strong>{" "}
                        {primarySt
                          ? `${primarySt.PreferredName || primarySt.FirstName} (${primarySt.AdmissionNo})`
                          : `Student #${c.primaryStudentId || "N/A"}`}
                      </div>
                      <div
                        style={{
                          background: "var(--bg-card)",
                          padding: "0.75rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <strong>Candidate Student:</strong>{" "}
                        {candidateSt
                          ? `${candidateSt.PreferredName || candidateSt.FirstName} (${candidateSt.AdmissionNo})`
                          : `Student #${c.candidateStudentId || "Request"}`}
                      </div>
                    </div>

                    {c.status === "OPEN" ? (
                      <div style={{ display: "grid", gap: "0.65rem" }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Resolution note (e.g. Verified Twins in JSS 1A sharing parent phone)"
                          value={dupNotes[c.id] || ""}
                          onChange={(e) => setDupNotes({ ...dupNotes, [c.id]: e.target.value })}
                        />
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => handleResolveDuplicate(c.id, "CLEARED_TWIN_SIBLING")}
                            className="btn btn-primary"
                            style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                          >
                            Approve Twin / Sibling Exception
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDuplicate(c.id, "CLEARED_DISTINCT")}
                            className="btn btn-outline"
                            style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                          >
                            Clear as Distinct Student
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDuplicate(c.id, "CONFIRMED_DUPLICATE")}
                            style={{
                              padding: "0.4rem 0.85rem",
                              fontSize: "0.8rem",
                              background: "var(--status-error-bg)",
                              color: "var(--status-error-text)",
                              border: "1px solid var(--status-error-border)",
                              borderRadius: "var(--radius-sm)",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Confirm Duplicate (Suspend)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        <strong>Resolution Note:</strong> {c.resolutionNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODAL: GENERATED REGISTRATION INVITATION SLIP
         ==================================================================== */}
      {activeInviteModal && (
        <div
          className="portal-modal-overlay"
          style={{ zIndex: 1150 }}
          onClick={() => setActiveInviteModal(null)}
        >
          <div
            className="portal-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px", padding: "1.75rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: 0, color: "var(--text-heading)" }}>
                Student Registration Invitation Slip
              </h3>
              <button
                type="button"
                onClick={() => setActiveInviteModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            <div
              style={{
                background: "var(--bg-secondary)",
                border: "2px solid var(--brand-primary)",
                borderRadius: "var(--radius-sm)",
                padding: "1.1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                <strong>Student:</strong> {activeInviteModal.studentName} (
                {activeInviteModal.className})
              </div>
              <div
                style={{
                  fontSize: "0.88rem",
                  color: "var(--text-heading)",
                  marginTop: "0.35rem",
                }}
              >
                <strong>Permanent WOFS Student ID:</strong>{" "}
                <code style={{ fontWeight: 800 }}>{activeInviteModal.wofsStudentId}</code>
              </div>

              <div
                style={{
                  marginTop: "0.85rem",
                  paddingTop: "0.85rem",
                  borderTop: "1px dashed var(--border-primary)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "0.74rem",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    fontWeight: 700,
                  }}
                >
                  Single-Use Invitation Code
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "1.45rem",
                    fontWeight: 900,
                    color: "var(--brand-primary)",
                    letterSpacing: "1.5px",
                    margin: "0.3rem 0",
                  }}
                >
                  {activeInviteModal.plainCode}
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                  Expires: {activeInviteModal.expiresAt} &middot; Invalidated after 1st use
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handlePrintSlip(activeInviteModal)}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <FiPrinter /> Print Slip
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activeInviteModal.plainCode);
                  alert("Invitation code copied!");
                }}
                className="btn btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <FiCopy /> Copy Code
              </button>

              {activeInviteModal.whatsappUrl && (
                <a
                  href={activeInviteModal.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    textDecoration: "none",
                  }}
                >
                  Share on WhatsApp <FiExternalLink />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: EDIT STUDENT RECORD (WOFS-STU ID IS IMMUTABLE)
         ==================================================================== */}
      {editingStudent && (
        <div
          className="portal-modal-overlay"
          style={{ zIndex: 1150 }}
          onClick={() => setEditingStudent(null)}
        >
          <div
            className="portal-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "560px", padding: "1.75rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: 0, color: "var(--text-heading)" }}>
                Review &amp; Edit Student Record ({editingStudent.AdmissionNo})
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditStudent} style={{ display: "grid", gap: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={editingStudent.FirstName || ""}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, FirstName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={editingStudent.LastName || ""}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, LastName: e.target.value })
                    }
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label className="form-label">Assigned Class &amp; Arm</label>
                  <select
                    className="form-input"
                    value={editingStudent.ClassID}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        ClassID: parseInt(e.target.value, 10),
                      })
                    }
                  >
                    {classes.map((c) => (
                      <option key={c.ClassID} value={c.ClassID}>
                        {c.ClassName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Enrolment Status</label>
                  <select
                    className="form-input"
                    value={editingStudent.EnrolmentStatus || "ACTIVE"}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        EnrolmentStatus: e.target.value,
                      })
                    }
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PROMOTED">PROMOTED</option>
                    <option value="REPEATING">REPEATING</option>
                    <option value="WITHDRAWN">WITHDRAWN</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label className="form-label">Guardian Phone</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={editingStudent.ParentContact || ""}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        ParentContact: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="form-label">Guardian Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={editingStudent.ParentEmail || ""}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        ParentEmail: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Twin / Sibling Exception Note</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingStudent.SiblingExceptionNote || ""}
                  onChange={(e) =>
                    setEditingStudent({
                      ...editingStudent,
                      SiblingExceptionNote: e.target.value,
                    })
                  }
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem" }}>
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: DIRECT STUDENT EMAIL / WHATSAPP / SMS DISPATCH
         ==================================================================== */}
      {showMessageModal && (
        <div className="portal-modal-overlay" style={{ zIndex: 1100 }}>
          <div
            className="portal-modal-card"
            style={{
              maxWidth: "580px",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "1.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                borderBottom: "1px solid var(--border-subtle)",
                paddingBottom: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "1.2rem" }}>
                  Direct Student Dispatch (Email &bull; WhatsApp &bull; SMS)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMessageModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                <FiX size={22} />
              </button>
            </div>

            <form onSubmit={handleSendDirectMessage} style={{ display: "grid", gap: "1rem" }}>
              <div>
                <label className="form-label">
                  Student Portal Email or WOFS Student ID *
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    required
                    placeholder="e.g. student@example.com or WOFS-STU-2026-000001"
                    value={studentEmailInput}
                    onChange={(e) => setStudentEmailInput(e.target.value)}
                    className="form-input"
                  />
                  <button
                    type="button"
                    onClick={handleLookupByEmail}
                    disabled={lookingUp}
                    className="btn btn-outline"
                  >
                    {lookingUp ? "Resolving..." : "Resolve"}
                  </button>
                </div>
              </div>

              {resolvedStudent && (
                <div
                  style={{
                    background: "var(--status-success-bg)",
                    border: "1px solid var(--status-success-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.85rem 1rem",
                    fontSize: "0.85rem",
                    color: "var(--status-success-text)",
                  }}
                >
                  <strong>Resolved:</strong> {resolvedStudent.studentName} (
                  {resolvedStudent.admissionNo} — {resolvedStudent.className})
                </div>
              )}

              <div>
                <label className="form-label">Guardian / Student Phone Override</label>
                <input
                  type="tel"
                  placeholder="e.g. 08031234567"
                  value={phoneOverride}
                  onChange={(e) => setPhoneOverride(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  required
                  value={msgSubject}
                  onChange={(e) => setMsgSubject(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Message Content *</label>
                <textarea
                  rows={4}
                  required
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  className="form-input"
                />
              </div>

              {dispatchFeedback && (
                <div
                  style={{
                    padding: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    background:
                      dispatchFeedback.type === "success"
                        ? "var(--status-success-bg)"
                        : "var(--status-error-bg)",
                    color:
                      dispatchFeedback.type === "success"
                        ? "var(--status-success-text)"
                        : "var(--status-error-text)",
                    border: `1px solid ${
                      dispatchFeedback.type === "success"
                        ? "var(--status-success-border)"
                        : "var(--status-error-border)"
                    }`,
                    fontSize: "0.85rem",
                  }}
                >
                  {dispatchFeedback.text}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  className="btn btn-outline"
                >
                  Close
                </button>
                <button type="submit" disabled={dispatching} className="btn btn-primary">
                  <FiSend /> {dispatching ? "Dispatching..." : "Send Direct Message"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CR80 Student ID Card Print & QR Preview Studio */}
      {idCardStudents && idCardStudents.length > 0 && (
        <StudentIdCardStudio
          students={idCardStudents}
          sessionLabel={activeSessionName}
          onClose={() => setIdCardStudents(null)}
          title={
            idCardStudents.length === 1
              ? `CR80 ID Card — ${idCardStudents[0].AdmissionNo}`
              : `Batch CR80 ID Cards (${idCardStudents.length} Students)`
          }
        />
      )}
    </div>
  );
}
