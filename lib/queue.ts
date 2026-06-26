import { Queue } from "bullmq";
import { connection } from "./redis";

export interface IngestJob {
  documentId: string;
  filePath: string;
}

// Producer side only. The worker (worker/index.ts) is the consumer.
export const ingestQueue = new Queue<IngestJob>("ingest", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
