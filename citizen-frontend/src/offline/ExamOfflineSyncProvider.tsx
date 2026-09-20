import { useEffect } from "react";
import { useAuth } from "../app/AuthContext";
import { synchronizeQueuedExamSubmissions } from "./exam-submission-sync";
import { getSubmissionIntentsForUser } from "./exam-offline-db";

/** Sync only while a citizen session is active; no background polling. */
export function ExamOfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || !user || user.role !== "CITIZEN") return;
    let retryTimer: number | undefined;
    const scheduleRetry = async () => {
      window.clearTimeout(retryTimer);
      const next = (await getSubmissionIntentsForUser(user.userId)).filter((intent) => intent.syncState === "RETRY_SCHEDULED" && intent.nextAttemptAt).sort((left, right) => String(left.nextAttemptAt).localeCompare(String(right.nextAttemptAt)))[0];
      if (next?.nextAttemptAt) retryTimer = window.setTimeout(synchronize, Math.max(0, new Date(next.nextAttemptAt).getTime() - Date.now()));
    };
    const synchronize = () => { void synchronizeQueuedExamSubmissions(user.userId).then(scheduleRetry).catch(() => undefined); };
    synchronize();
    window.addEventListener("online", synchronize);
    window.addEventListener("janseva-auth-refreshed", synchronize);
    const visible = () => { if (document.visibilityState === "visible") synchronize(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", synchronize);
      window.removeEventListener("janseva-auth-refreshed", synchronize);
      document.removeEventListener("visibilitychange", visible);
      window.clearTimeout(retryTimer);
    };
  }, [loading, user?.userId, user?.role]);
  return <>{children}</>;
}
