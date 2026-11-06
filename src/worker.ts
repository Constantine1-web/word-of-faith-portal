import { Worker } from 'bullmq';
import { redis } from './lib/redis';
import { sendEmail } from './lib/email';
import { PrismaClient } from '@prisma/client';
import { invalidateCache } from './lib/cache';
import cron from "node-cron";
import { performBackup } from "./scripts/backup";
import { reapExpiredCbtAttempts } from "./app/actions/cbt";

const prisma = new PrismaClient();

console.log("🚀 Standalone Background Worker started, waiting for jobs...");

// Schedule Automated Backups (Every day at midnight)
cron.schedule("0 0 * * *", () => {
  performBackup();
});

console.log("Scheduled automated daily database backup (00:00).");

// Schedule CBT Timeout Reaper (Runs every 2 minutes)
cron.schedule("*/2 * * * *", async () => {
  try {
    const res = await reapExpiredCbtAttempts();
    if (res.reapedCount > 0) {
      console.log(`[CbtReaper] Successfully reaped ${res.reapedCount} expired CBT attempts.`);
    }
  } catch (err: any) {
    console.error("[CbtReaper] Error reaping expired attempts:", err.message);
  }
});

console.log("Scheduled automated CBT timeout reaper (every 2 minutes).");

// 1. Email Worker (Processes SMTP dispatch)
const emailWorker = new Worker('email-queue', async job => {
  console.log(`[EmailWorker] Processing job ${job.id} - sending email to ${job.data.to}`);
  const { to, subject, html } = job.data;
  
  const result = await sendEmail({ to, subject, html });
  if (!result.success) {
    throw new Error("Failed to send email");
  }
  console.log(`[EmailWorker] Job ${job.id} completed successfully`);
}, { connection: redis as any });

// 2. Payment Worker (Processes Mock Payment Gateway)
const paymentWorker = new Worker('payment-queue', async job => {
  console.log(`[PaymentWorker] Processing payment job ${job.id} for student ${job.data.studentId}`);
  const { studentId, amount, description, termId } = job.data;

  // Simulate heavy synchronous gateway delay (e.g. 2-5 seconds)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await prisma.payment_Record.create({
    data: {
      StudentID: studentId,
      TermID: termId,
      AmountPaid: amount,
      AmountKobo: BigInt(Math.round(Number(amount || 0) * 100)),
      Description: description,
      Status: "Pending",
      ReceiptUrl: `/receipts/teller-${Date.now()}.pdf`
    }
  });

  // Invalidate Cache after async write
  const student = await prisma.student.findUnique({ where: { StudentID: studentId } });
  if (student?.UserID) {
    await invalidateCache(`profile:${student.UserID}`);
  }

  console.log(`[PaymentWorker] Payment job ${job.id} processed successfully`);
}, { connection: redis as any });

// Error handling
emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
});

paymentWorker.on('failed', (job, err) => {
  console.error(`[PaymentWorker] Job ${job?.id} failed:`, err.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await emailWorker.close();
  await paymentWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
