import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PaymentsClient from "./PaymentsClient";

export default async function AdminPaymentsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const terms = await prisma.academic_Term.findMany({
    orderBy: { SessionName: "desc" }
  });

  const activeTerm = terms.find(t => t.IsActive);

  const initialPayments = await prisma.payment_Record.findMany({
    orderBy: { PaymentDate: "desc" },
    include: {
      Student: {
        include: { Class: true, User: true }
      },
      Term: true
    }
  });

  const pendingCount = await prisma.payment_Record.count({ where: { Status: "Pending" } });
  const approvedTotal = await prisma.payment_Record.aggregate({
    where: { Status: "Approved" },
    _sum: { AmountPaid: true }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Fee Clearance & Receipt Verification</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Audit bank transfer uploads and Paystack records. Approving grants student financial clearance for result viewing.
          </p>
        </div>
      </div>

      <PaymentsClient
        initialPayments={initialPayments}
        terms={terms}
        activeTerm={activeTerm}
        initialStats={{ pendingCount, totalRevenue: approvedTotal._sum.AmountPaid || 0 }}
      />
    </div>
  );
}
