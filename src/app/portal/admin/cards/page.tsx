import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import CardsClient from "./CardsClient";

export default async function AdminCardsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const terms = await prisma.academic_Term.findMany({
    orderBy: { SessionName: "desc" }
  });

  const activeTerm = terms.find(t => t.IsActive);

  const initialCards = await prisma.scratch_Card.findMany({
    take: 50,
    orderBy: { CardID: "desc" },
    include: {
      Student: {
        include: { Class: true }
      },
      Term: true
    }
  });

  const totalCount = await prisma.scratch_Card.count();
  const unusedCount = await prisma.scratch_Card.count({ where: { UsedBy: null } });
  const usedCount = await prisma.scratch_Card.count({ where: { UsedBy: { not: null } } });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Scratch Card Manager & Batch Generator</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Generate batches of 12-digit PIN result-checker cards with printable physical sticker layouts and usage tracking.
          </p>
        </div>
      </div>

      <CardsClient
        initialCards={initialCards}
        terms={terms}
        activeTerm={activeTerm}
        initialStats={{ total: totalCount, unused: unusedCount, used: usedCount }}
      />
    </div>
  );
}
