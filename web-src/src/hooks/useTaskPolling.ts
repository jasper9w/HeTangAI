/**
 * Task polling hook for efficient batch task status updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskSummary, Task } from '../types';

interface UseTaskPollingOptions {
  /** Polling interval for summary (ms), default 5000 */
  summaryInterval?: number;
  /** Polling interval for running tasks (ms), default 1000 */
  runningInterval?: number;
  /** Whether polling is enabled */
  enabled?: boolean;
}

interface UseTaskPollingResult {
  /** Task summary (counts by type and status) */
  summary: TaskSummary | null;
  /** Currently running tasks */
  runningTasks: Task[];
  /** Poll specific tasks by reference */
  pollTasks: (taskRefs: string[]) => Promise<Record<string, Task>>;
  /** Refresh summary immediately */
  refreshSummary: () => Promise<void>;
  /** Refresh running tasks immediately */
  refreshRunningTasks: () => Promise<void>;
  /** Whether loading */
  loading: boolean;
  /** Error message */
  error: string | null;
}

const DEFAULT_SUMMARY: TaskSummary = {
  image: { pending: 0, paused: 0, running: 0, success: 0, failed: 0, cancelled: 0 },
  video: { pending: 0, paused: 0, running: 0, success: 0, failed: 0, cancelled: 0 },
  audio: { pending: 0, paused: 0, running: 0, success: 0, failed: 0, cancelled: 0 },
  total: { pending: 0, paused: 0, running: 0, success: 0, failed: 0, cancelled: 0 },
};

export function useTaskPolling(options: UseTaskPollingOptions = {}): UseTaskPollingResult {
  const {
    summaryInterval = 5000,
    runningInterval = 1000,
    enabled = true,
  } = options;

  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [runningTasks, setRunningTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await window.pywebview.api.get_task_summary();
      if (result.success && result.data) {
        setSummary(result.data);
        setError(null);
      }
    } catch (e) {
      console.error('Failed to fetch task summary:', e);
    }
  }, []);

  // Fetch running tasks
  const fetchRunningTasks = useCallback(async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await window.pywebview.api.list_tasks(undefined, 'running', 0, 100);
      if (result.success && result.data) {
        setRunningTasks(result.data);
      }
    } catch (e) {
      console.error('Failed to fetch running tasks:', e);
    }
  }, []);

  // Poll specific tasks
  const pollTasks = useCallback(async (taskRefs: string[]): Promise<Record<string, Task>> => {
    if (!window.pywebview?.api || taskRefs.length === 0) {
      return {};
    }

    try {
      const result = await window.pywebview.api.poll_tasks(taskRefs);
      if (result.success && result.data) {
        return result.data;
      }
    } catch (e) {
      console.error('Failed to poll tasks:', e);
    }
    return {};
  }, []);

  // Refresh summary
  const refreshSummary = useCallback(async () => {
    setLoading(true);
    await fetchSummary();
    setLoading(false);
  }, [fetchSummary]);

  // Refresh running tasks
  const refreshRunningTasks = useCallback(async () => {
    await fetchRunningTasks();
  }, [fetchRunningTasks]);

  // Start/stop polling
  useEffect(() => {
    if (!enabled) {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
      if (runningTimerRef.current) {
        clearInterval(runningTimerRef.current);
        runningTimerRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchSummary();
    fetchRunningTasks();

    // Start polling
    summaryTimerRef.current = setInterval(fetchSummary, summaryInterval);
    runningTimerRef.current = setInterval(fetchRunningTasks, runningInterval);

    return () => {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current);
      }
      if (runningTimerRef.current) {
        clearInterval(runningTimerRef.current);
      }
    };
  }, [enabled, summaryInterval, runningInterval, fetchSummary, fetchRunningTasks]);

  return {
    summary: summary || DEFAULT_SUMMARY,
    runningTasks,
    pollTasks,
    refreshSummary,
    refreshRunningTasks,
    loading,
    error,
  };
}

export default useTaskPolling;
