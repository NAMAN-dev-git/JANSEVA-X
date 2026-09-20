import { app } from "./app";
import { env } from "./config/env";
import { ApplicationSubmissionWorker } from "./services/application-submission-worker.service";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`JANSEVA-X Citizen Backend listening on port ${env.PORT}`);
});
const submissionWorker = new ApplicationSubmissionWorker();
submissionWorker.start(env.SUBMISSION_WORKER_POLL_INTERVAL_MS);

function shutdown(signal: string): void {
  console.log(`${signal} received. Closing HTTP server.`);
  submissionWorker.stop();
  server.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server", error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
