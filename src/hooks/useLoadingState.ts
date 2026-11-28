import { useState, useRef, useEffect, useCallback } from 'react';

export interface RunLoadingOptions {
  /** Minimum timeout safety cutoff so stuck requests restore cleanly */
  timeoutMs?: number;
  /** Allow restarting with abort if an overlapping request arrives instead of ignoring */
  cancelPrevious?: boolean;
}

/**
 * Reusable asynchronous execution hook managing loading state, active operation key,
 * error capture, duplicate-submission prevention, request cancellation, and unmount cleanup.
 */
export function useLoadingState<K extends string = string>() {
  const [activeKey, setActiveKey] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const activeLockRef = useRef<string | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const timeoutIdsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllersRef.current.forEach((ctrl) => ctrl.abort());
      abortControllersRef.current.clear();
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current.clear();
    };
  }, []);

  const cancel = useCallback((key?: K) => {
    if (key) {
      abortControllersRef.current.get(key)?.abort();
      abortControllersRef.current.delete(key);
      const timer = timeoutIdsRef.current.get(key);
      if (timer) {
        window.clearTimeout(timer);
        timeoutIdsRef.current.delete(key);
      }
      if (activeLockRef.current === key) {
        activeLockRef.current = null;
        if (isMountedRef.current) setActiveKey(null);
      }
      return;
    }

    abortControllersRef.current.forEach((ctrl) => ctrl.abort());
    abortControllersRef.current.clear();
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutIdsRef.current.clear();
    activeLockRef.current = null;
    if (isMountedRef.current) setActiveKey(null);
  }, []);

  const run = useCallback(
    async <T>(
      key: K,
      task: (signal: AbortSignal) => Promise<T>,
      options: RunLoadingOptions = {}
    ): Promise<{ ok: boolean; data?: T; error?: any; aborted?: boolean; skippedDuplicate?: boolean }> => {
      const { timeoutMs = 30000, cancelPrevious = false } = options;

      if (!cancelPrevious && activeLockRef.current !== null) {
        return { ok: false, skippedDuplicate: true };
      }

      if (cancelPrevious) {
        abortControllersRef.current.get(key)?.abort();
        const prevTimer = timeoutIdsRef.current.get(key);
        if (prevTimer) window.clearTimeout(prevTimer);
      }

      const controller = new AbortController();
      abortControllersRef.current.set(key, controller);
      activeLockRef.current = key;

      if (isMountedRef.current) {
        setActiveKey(key);
        setError(null);
      }

      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      timeoutIdsRef.current.set(key, timeoutId);

      try {
        const data = await task(controller.signal);
        if (controller.signal.aborted) {
          return { ok: false, aborted: true };
        }
        return { ok: true, data };
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError') {
          return { ok: false, aborted: true, error: err };
        }
        if (isMountedRef.current) {
          setError(err?.message || 'Operation failed');
        }
        return { ok: false, error: err };
      } finally {
        const activeTimer = timeoutIdsRef.current.get(key);
        if (activeTimer) {
          window.clearTimeout(activeTimer);
          timeoutIdsRef.current.delete(key);
        }
        if (abortControllersRef.current.get(key) === controller) {
          abortControllersRef.current.delete(key);
          activeLockRef.current = null;
          if (isMountedRef.current) {
            setActiveKey(null);
          }
        }
      }
    },
    []
  );

  return {
    isLoading: activeKey !== null,
    activeKey,
    error,
    setError,
    isPendingKey: (key: K) => activeKey === key,
    run,
    cancel,
  };
}
