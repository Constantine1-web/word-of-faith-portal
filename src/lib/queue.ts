import { sendEmail } from './email';

// Simple drop-in replacement for the BullMQ emailQueue.
// Sends emails directly (inline) so no Redis or worker process is needed.
export const emailQueue = {
  add: async (_jobName: string, data: { to: string; subject: string; html: string }) => {
    await sendEmail(data);
  }
};

// Stub for payment queue — no Redis dependency
export const paymentQueue = {
  add: async (_jobName: string, _data: unknown) => {
    // Extend when a real queue is needed
  }
};
