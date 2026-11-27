import { supabase } from './supabaseClient';

/**
 * SNPSUNEXUS Mail Studio - Centralized API Configuration, Auth & Error Handling
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, status = 500, code = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiEnvelope<T = any> {
  success: boolean;
  data: T;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    pages?: number;
  };
  message?: string;
}

export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const isBrowser = typeof window !== 'undefined';
  const hostname = isBrowser ? window.location.hostname : 'localhost';
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  // Never allow a deployed non-localhost build to issue requests to localhost / 127.0.0.1
  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(configured);
  if (configured && (isLocalHost || !pointsToLocalhost)) {
    return configured.endsWith('/api') ? configured : `${configured}/api`;
  }

  // On deployed origins (e.g. Vercel), default cleanly to same-origin /api serverless routes
  if (!isLocalHost) {
    return '/api';
  }

  return 'http://localhost:4000/api';
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}

export async function getAuthHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  if (error || !accessToken) {
    throw new ApiError(
      'Administrator sign-in is required to access SNPSUNEXUS Mail Studio services.',
      401,
      'AUTH_REQUIRED'
    );
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
}

export async function parseApiEnvelope<T = any>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      `Backend returned an unexpected response (${response.status} ${response.statusText})`,
      response.status || 502,
      'INVALID_SERVER_RESPONSE'
    );
  }

  if (!response.ok || !json?.success) {
    const fallbackCode =
      response.status === 401
        ? 'UNAUTHORIZED'
        : response.status === 403
        ? 'FORBIDDEN'
        : response.status === 503
        ? 'SERVICE_UNAVAILABLE'
        : 'API_ERROR';
    const code = json?.error?.code || fallbackCode;
    const message = json?.error?.message || `API request failed (${response.status})`;
    throw new ApiError(message, response.status || 500, code, json?.error);
  }

  return json as ApiEnvelope<T>;
}

const inFlightGetRequests = new Map<string, Promise<ApiEnvelope<any>>>();

export async function fetchApiEnvelope<T = any>(
  endpoint: string,
  options: RequestInit = {},
  includeJsonContentType = true
): Promise<ApiEnvelope<T>> {
  const defaultHeaders: Record<string, string> = includeJsonContentType
    ? { 'Content-Type': 'application/json' }
    : {};
  const authHeaders = await getAuthHeaders(defaultHeaders);

  const mergedHeaders: Record<string, string> = {
    ...authHeaders,
    ...((options.headers as Record<string, string>) || {}),
  };

  const url = getApiUrl(endpoint);
  const method = (options.method || 'GET').toUpperCase();
  const canDeduplicate = method === 'GET' && !options.signal;
  const dedupKey = canDeduplicate ? `${url}::${authHeaders.Authorization.slice(-24)}` : '';

  if (canDeduplicate && inFlightGetRequests.has(dedupKey)) {
    return inFlightGetRequests.get(dedupKey) as Promise<ApiEnvelope<T>>;
  }

  const exec = async (): Promise<ApiEnvelope<T>> => {
    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers: mergedHeaders,
      });
    } catch (networkErr: any) {
      throw new ApiError(
        networkErr?.message || 'Unable to reach SNPSUNEXUS backend service.',
        503,
        'NETWORK_UNAVAILABLE'
      );
    }

    return parseApiEnvelope<T>(res);
  };

  if (!canDeduplicate) {
    return exec();
  }

  const pending = exec().finally(() => {
    inFlightGetRequests.delete(dedupKey);
  });
  inFlightGetRequests.set(dedupKey, pending);
  return pending;
}

export async function fetchApiBlob(endpoint: string): Promise<Blob> {
  const authHeaders = await getAuthHeaders();

  let res: Response;
  try {
    res = await fetch(getApiUrl(endpoint), { headers: authHeaders });
  } catch (networkErr: any) {
    throw new ApiError(
      networkErr?.message || 'Unable to reach SNPSUNEXUS backend service.',
      503,
      'NETWORK_UNAVAILABLE'
    );
  }

  if (!res.ok) {
    try {
      await parseApiEnvelope(res);
    } catch (err) {
      throw err;
    }
    throw new ApiError(`Request failed with status ${res.status}`, res.status, 'API_ERROR');
  }

  return res.blob();
}
