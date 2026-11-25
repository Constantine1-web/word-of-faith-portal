import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { requireStudentOwnershipOrAdmin } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId: rawId } = await context.params;
    const paymentId = Number.parseInt(String(rawId || ""), 10);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment ID." }, { status: 400 });
    }

    const payment = await prisma.payment_Record.findUnique({
      where: { PaymentID: paymentId },
      select: {
        PaymentID: true,
        StudentID: true,
        ReceiptUrl: true,
        receiptStorageKey: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment record not found." }, { status: 404 });
    }

    await requireStudentOwnershipOrAdmin(payment.StudentID, { allowFinance: true });

    const keyOrUrl = payment.receiptStorageKey || payment.ReceiptUrl || "";
    if (!keyOrUrl) {
      return NextResponse.json({ error: "No receipt uploaded for this record." }, { status: 404 });
    }

    // 1. Private local storage: local:<mimeType>:<filename>
    if (keyOrUrl.startsWith("local:")) {
      const parts = keyOrUrl.split(":");
      const mimeType = parts[1] || "application/octet-stream";
      const fileName = path.basename(parts.slice(2).join(":"));
      const fullPath = path.join(process.cwd(), "storage", "private-receipts", fileName);
      const buf = await fs.readFile(fullPath).catch(() => null);
      if (!buf) {
        return NextResponse.json({ error: "Receipt file not found on storage volume." }, { status: 404 });
      }
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // 2. Embedded Data URI fallback (serverless read-only FS)
    if (keyOrUrl.startsWith("data:")) {
      const match = keyOrUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ error: "Corrupted receipt payload." }, { status: 500 });
      }
      const mimeType = match[1];
      const buf = Buffer.from(match[2], "base64");
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="receipt_${payment.PaymentID}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // 3. Legacy file under public/uploads/receipts/ (strictly scoped basename)
    if (keyOrUrl.startsWith("/uploads/receipts/")) {
      const safeName = path.basename(keyOrUrl);
      const legacyPath = path.join(process.cwd(), "public", "uploads", "receipts", safeName);
      const buf = await fs.readFile(legacyPath).catch(() => null);
      if (!buf) {
        return NextResponse.json({ error: "Legacy receipt file missing." }, { status: 404 });
      }
      const ext = path.extname(safeName).toLowerCase();
      const mime =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
          ? "image/png"
          : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `inline; filename="${safeName}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json({ error: "Unsupported receipt storage reference." }, { status: 404 });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode || 403;
    const message = err instanceof Error ? err.message : "Forbidden";
    return NextResponse.json({ error: message }, { status });
  }
}
