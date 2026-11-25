import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getContactInquiries } from "@/app/actions/inquiries";
import InquiriesClient from "./InquiriesClient";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  try {
    await requireCapability(["MANAGE_STUDENTS", "MANAGE_SYSTEM"]);
  } catch {
    redirect("/portal/unauthorized?zone=inquiries");
  }

  const res = await getContactInquiries();
  const inquiries = res.success && res.inquiries ? res.inquiries : [];
  const summary = res.summary || {
    total: 0,
    newCount: 0,
    inReviewCount: 0,
    repliedCount: 0,
    resolvedCount: 0,
  };

  return (
    <div>
      <div
        style={{
          marginBottom: "2rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
        }}
      >
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
          Website Contact Inquiries Inbox
        </h1>
        <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
          Review messages submitted through the public Contact Us page and send official email replies without digging through audit logs.
        </p>
      </div>

      <InquiriesClient initialInquiries={inquiries} initialSummary={summary} />
    </div>
  );
}
