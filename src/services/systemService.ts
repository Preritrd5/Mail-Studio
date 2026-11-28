import { fetchApiEnvelope } from './apiConfig';
import { WorkerHealth } from './queueService';

export interface SystemStatusResponse {
  api?: {
    status: 'operational' | 'degraded' | 'unavailable';
    runtime?: string;
  };
  auth?: {
    available: boolean;
    status: 'operational' | 'degraded' | 'unavailable' | 'not_configured';
  };
  smtp: {
    configured: boolean;
    verified?: boolean;
    status?: 'operational' | 'configured_unverified' | 'not_configured' | 'unavailable';
    host: string | null;
    tls_strict: boolean;
    sender_name?: string;
    sender_email?: string | null;
  };
  database: {
    connected: boolean;
    status?: 'operational' | 'unavailable' | 'not_configured';
    error: string | null;
  };
  worker: WorkerHealth & {
    status?: 'operational' | 'unavailable';
    lock_held?: boolean;
  };
  timestamp: string;
}

export const systemService = {
  async getStatus(): Promise<SystemStatusResponse> {
    const res = await fetchApiEnvelope<SystemStatusResponse>('/system/status');
    return res.data;
  },
};
