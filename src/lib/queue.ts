import { Queue } from 'bullmq';
import { redis } from './redis';

// Define the Queues
export const emailQueue = new Queue('email-queue', { connection: redis as any });
export const paymentQueue = new Queue('payment-queue', { connection: redis as any });
