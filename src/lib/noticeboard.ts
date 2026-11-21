/**
 * Shared types, duration/expiry calculation, and chronological AuditLog merge
 * for School-Wide Broadcasts & Noticeboard items.
 */

export type BroadcastDurationPreset =
  | "6h"
  | "24h"
  | "3d"
  | "7d"
  | "14d"
  | "30d"
  | "custom"
  | "none";

export interface SchoolNoticeItem {
  id: string;
  type: string;
  category: string;
  title: string;
  eventDate: string;
  targetAudience: string;
  details: string;
  color: string;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
  durationPreset?: BroadcastDurationPreset;
  durationLabel?: string;
  isDefault?: boolean;
  isDeleted?: boolean;
}

export const BROADCAST_DURATION_OPTIONS: Array<{
  value: BroadcastDurationPreset;
  label: string;
  hours?: number;
}> = [
  { value: "6h", label: "6 Hours", hours: 6 },
  { value: "24h", label: "24 Hours (1 Day)", hours: 24 },
  { value: "3d", label: "3 Days", hours: 72 },
  { value: "7d", label: "7 Days (Recommended)", hours: 168 },
  { value: "14d", label: "14 Days (2 Weeks)", hours: 336 },
  { value: "30d", label: "30 Days (1 Month)", hours: 720 },
  { value: "custom", label: "Custom Expiry Date & Time" },
  { value: "none", label: "No Auto-Expiry (Until Removed)" },
];

export const DEFAULT_SCHOOL_NOTICES: SchoolNoticeItem[] = [
  {
    id: "default-notice-1",
    type: "Exam Timetable",
    category: "Exam Timetable",
    title: "First Term CBT & Written Examinations",
    eventDate: "2026-11-23",
    targetAudience: "All Portal Users",
    details:
      "First Term Continuous Assessment (CA 40) closes Nov 18. Terminal CBT & Written Exams (60 Marks) begin Monday, Nov 23 across all JSS and SSS arms.",
    color: "var(--color-navy-blue)",
    createdAt: "2026-11-01T08:00:00.000Z",
    expiresAt: null,
    durationPreset: "none",
    durationLabel: "Manual removal",
    isDefault: true,
  },
  {
    id: "default-notice-2",
    type: "Upcoming Event",
    category: "Upcoming Event",
    title: "PTA General Assembly & Open Day",
    eventDate: "2026-12-04",
    targetAudience: "Students & Parents",
    details:
      "Main School Auditorium (10:00 AM). Parents are invited to review mid-term class results and meet with Class Teachers and Subject Teachers.",
    color: "var(--color-primary-green)",
    createdAt: "2026-11-01T08:00:00.000Z",
    expiresAt: null,
    durationPreset: "none",
    durationLabel: "Manual removal",
    isDefault: true,
  },
  {
    id: "default-notice-3",
    type: "Deadline",
    category: "Deadline",
    title: "First Term Tuition & Bursary Clearance",
    eventDate: "2026-11-25",
    targetAudience: "Students & Parents",
    details:
      "Please complete tuition payment via Paystack or upload verified bank teller receipts in the Fees Portal before terminal result publication.",
    color: "#dc2626",
    createdAt: "2026-11-01T08:00:00.000Z",
    expiresAt: null,
    durationPreset: "none",
    durationLabel: "Manual removal",
    isDefault: true,
  },
];

export function computeBroadcastExpiry(
  preset: BroadcastDurationPreset = "7d",
  customExpiresAt?: string | null,
  nowMs: number = Date.now()
): { expiresAt: string | null; durationPreset: BroadcastDurationPreset; durationLabel: string; error?: string } {
  if (preset === "none") {
    return {
      expiresAt: null,
      durationPreset: "none",
      durationLabel: "Until manually removed",
    };
  }

  if (preset === "custom") {
    const clean = String(customExpiresAt || "").trim();
    if (!clean) {
      return {
        expiresAt: null,
        durationPreset: "custom",
        durationLabel: "Custom",
        error: "Select a valid custom expiration date and time.",
      };
    }
    const parsed = new Date(clean);
    if (Number.isNaN(parsed.getTime())) {
      return {
        expiresAt: null,
        durationPreset: "custom",
        durationLabel: "Custom",
        error: "Invalid custom expiration date/time.",
      };
    }
    if (parsed.getTime() <= nowMs + 60_000) {
      return {
        expiresAt: null,
        durationPreset: "custom",
        durationLabel: "Custom",
        error: "Broadcast expiration time must be at least 1 minute in the future.",
      };
    }
    return {
      expiresAt: parsed.toISOString(),
      durationPreset: "custom",
      durationLabel: `Until ${parsed.toLocaleString("en-NG", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    };
  }

  const matched = BROADCAST_DURATION_OPTIONS.find((o) => o.value === preset);
  const hours = matched?.hours ?? 168;
  const expiryDate = new Date(nowMs + hours * 3_600_000);
  return {
    expiresAt: expiryDate.toISOString(),
    durationPreset: preset,
    durationLabel: matched?.label || `${hours}h`,
  };
}

export function isSchoolNoticeExpired(
  notice: Pick<SchoolNoticeItem, "expiresAt">,
  nowMs: number = Date.now()
): boolean {
  if (!notice.expiresAt) return false;
  const t = new Date(notice.expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

export function formatRemainingBroadcastTime(
  expiresAt?: string | null,
  nowMs: number = Date.now()
): string {
  if (!expiresAt) return "No auto-expiry";
  const diffMs = new Date(expiresAt).getTime() - nowMs;
  if (Number.isNaN(diffMs)) return "No auto-expiry";
  if (diffMs <= 0) return "Expired";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${Math.max(1, mins)}m left`;
}

export function mergeSchoolNoticeAuditEvents(
  auditLogsDesc: Array<{
    Action: string;
    EntityID: string;
    NewValue: unknown;
    CreatedAt: Date;
  }>
): SchoolNoticeItem[] {
  const byId = new Map<string, SchoolNoticeItem>();

  for (const def of DEFAULT_SCHOOL_NOTICES) {
    byId.set(def.id, { ...def, isDeleted: false });
  }

  const chronological = [...auditLogsDesc].reverse();
  for (const log of chronological) {
    const id = String(log.EntityID || "").trim();
    if (!id) continue;

    if (log.Action === "SCHOOL_NOTICE_PUBLISHED") {
      const val = (log.NewValue || {}) as Partial<SchoolNoticeItem>;
      if (!val.title || !val.details) continue;
      const existing = byId.get(id);
      byId.set(id, {
        id,
        type: val.type || val.category || existing?.type || "Academics",
        category: val.category || val.type || existing?.category || "Academics",
        title: val.title,
        eventDate: val.eventDate || existing?.eventDate || "",
        targetAudience: val.targetAudience || existing?.targetAudience || "All Portal Users",
        details: val.details,
        color: val.color || existing?.color || "var(--color-navy-blue)",
        createdAt: val.createdAt || existing?.createdAt || log.CreatedAt.toISOString(),
        updatedAt: log.CreatedAt.toISOString(),
        expiresAt: val.expiresAt !== undefined ? val.expiresAt : existing?.expiresAt ?? null,
        durationPreset: val.durationPreset || existing?.durationPreset || "none",
        durationLabel: val.durationLabel || existing?.durationLabel,
        isDefault: Boolean(existing?.isDefault),
        isDeleted: false,
      });
    } else if (log.Action === "SCHOOL_NOTICE_DELETED") {
      const existing = byId.get(id);
      if (existing) {
        existing.isDeleted = true;
        existing.updatedAt = log.CreatedAt.toISOString();
      }
    }
  }

  return Array.from(byId.values())
    .filter((n) => !n.isDeleted)
    .sort((a, b) => {
      if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
        return a.isDefault ? 1 : -1;
      }
      return (
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
      );
    });
}
