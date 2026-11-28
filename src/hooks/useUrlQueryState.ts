import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Shared URL query-parameter reader/updater hook.
 * Updates specific query keys cleanly while preserving unrelated parameters and location.hash.
 */
export function useUrlQueryState() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const patchQueryParams = useCallback(
    (updates: Record<string, string | number | null | undefined>, defaults: Record<string, string | number> = {}) => {
      const next = new URLSearchParams(location.search);

      for (const [key, rawVal] of Object.entries(updates)) {
        const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);
        const defaultVal = defaults[key] !== undefined ? String(defaults[key]) : '';

        if (!strVal || (defaultVal !== '' && strVal === defaultVal)) {
          next.delete(key);
        } else {
          next.set(key, strVal);
        }
      }

      const nextQuery = next.toString();
      const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
      if (nextQuery === currentQuery) return;

      navigate(
        {
          pathname: location.pathname,
          search: nextQuery ? `?${nextQuery}` : '',
          hash: location.hash,
        },
        { replace: true }
      );
    },
    [location.pathname, location.search, location.hash, navigate]
  );

  return { searchParams, patchQueryParams };
}
