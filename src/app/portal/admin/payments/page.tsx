import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PaymentsClient from "./PaymentsClient";
import { ensureAndListFeeSchedules, resolveFeeLevelGroup } from "@/lib/fee-schedule";

export default async function AdminPaymentsPage() {
  const session = await getServerSession(authOptions);
  const roleUpper = (session?.user?.role || "").toUpperCase();
  const isAuthorizedAdmin =
    roleUpper === "ADMIN" ||
    roleUpper === "SUPER_ADMIN" ||
    roleUpper === "PRINCIPAL" ||
    roleUpper === "BURSAR" ||
    roleUpper === "ADMISSIONS";

  if (!session || !isAuthorizedAdmin) {
    redirect("/portal/login");
  }

  const terms = await prisma.academic_Term.findMany({
    orderBy: { SessionName: "desc" },
  });

  const activeTerm = terms.find((t) => t.IsActive);

  const rawPayments = await prisma.payment_Record.findMany({
    orderBy: { PaymentDate: "desc" },
    include: {
      Student: {
        include: {
          Class: true,
          User: {
            select: { UserID: true, Email: true, IsActive: true },
          },
        },
      },
      Term: true,
    },
  });

  const schedules = (await ensureAndListFeeSchedules()).map((s) => ({
    id: s.id,
    levelGroup: s.levelGroup,
    displayName: s.displayName,
    tuitionNaira: s.tuitionNaira,
    leviesNaira: s.leviesNaira,
    maintenanceFeeNaira: s.maintenanceFeeNaira,
    totalNaira: s.totalNaira,
  }));
  const scheduleByGroup = new Map(schedules.map((s) => [s.levelGroup, s]));

  // Safely serialize BigInt AmountKobo and attach class-schedule 80/20 allocation breakdown
  const initialPayments = rawPayments.map((p) => {
    const grp = resolveFeeLevelGroup(p.Student?.Class?.ClassName, p.Student?.Class?.Level);
    const maintRate = scheduleByGroup.get(grp)?.maintenanceFeeNaira ?? 1000;
    const totalAmount = Math.max(0, Number(p.AmountPaid) || 0);
    const maintenanceFee = totalAmount >= maintRate ? maintRate : 0;
    const tuitionAndSchoolLevies = Math.max(0, totalAmount - maintenanceFee);
    const providerShare80 = Math.round(maintenanceFee * 0.8);
    const schoolMaintenanceShare20 = maintenanceFee - providerShare80;
    return {
      ...p,
      AmountKobo: p.AmountKobo ? Number(p.AmountKobo) : null,
      allocation: {
        totalAmount,
        tuitionAndSchoolLevies,
        maintenanceFee,
        providerShare80,
        schoolMaintenanceShare20,
        totalSchoolRetention: tuitionAndSchoolLevies + schoolMaintenanceShare20,
      },
    };
  });

  const pendingCount = await prisma.payment_Record.count({ where: { Status: "Pending" } });
  const approvedTotal = await prisma.payment_Record.aggregate({
    where: { Status: "Approved" },
    _sum: { AmountPaid: true },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
            Fee Clearance & Receipt Verification
          </h1>
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
        initialSchedules={schedules}
      />
    </div>
  );
}
