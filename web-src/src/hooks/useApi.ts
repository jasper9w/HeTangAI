/**
 * Hook for accessing pywebview API
 */
import { useState, useEffect, useCallback } from 'react';
import type { PyWebViewApi } from '../types';

export function useApi() {
  const [ready, setReady] = useState(false);
  const [api, setApi] = useState<PyWebViewApi | null>(null);

  useEffect(() => {
    const checkApi = () => {
      if (window.pywebview?.api) {
        setApi(window.pywebview.api);
        setReady(true);
      } else {
        setTimeout(checkApi, 100);
      }
    };
    checkApi();
  }, []);

  return { api, ready };
}

/**
 * Hook for managing project state with API
 */
export function useProject() {
  const { api, ready } = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    api,
    ready,
    loading,
    error,
    clearError,
    withLoading,
  };
}
