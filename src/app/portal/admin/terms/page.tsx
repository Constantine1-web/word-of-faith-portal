import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TermsClient from "./TermsClient";

export default async function AdminTermsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const terms = await prisma.academic_Term.findMany({
    orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
    include: {
      _count: {
        select: {
          Results: true,
          ScratchCards: true,
          PaymentRecords: true,
        }
      }
    }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Academic Session & Term Master</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Set the school's global active period and freeze/unfreeze score entries across all subjects.
          </p>
        </div>
      </div>

      <TermsClient initialTerms={terms} />
    </div>
  );
}
