import { useCallback, useEffect, useState } from "react";
import { ApiError, employeeApi, type ApplicationReview } from "../lib/api";

export function useApplicationReview(applicationId: string | null, onSessionExpired: () => void) {
  const [review, setReview] = useState<ApplicationReview | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(applicationId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<ApplicationReview | null> => {
    if (!applicationId) {
      setReview(null);
      setError("Select an authorized application before opening this workspace.");
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await employeeApi.applicationReview(applicationId);
      setReview(result.application);
      return result.application;
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setError(requestError instanceof ApiError ? requestError.message : "The application review workspace could not be loaded.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, onSessionExpired]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { review, isLoading, error, refresh };
}
