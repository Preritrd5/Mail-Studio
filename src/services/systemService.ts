import { fetchApiEnvelope } from './apiConfig';
import { WorkerHealth } from './queueService';

export interface SystemStatusResponse {
  smtp: {
    configured: boolean;
    host: string | null;
    tls_strict: boolean;
  };
  database: {
    connected: boolean;
    error: string | null;
  };
  worker: WorkerHealth;
  timestamp: string;
}

export const systemService = {
  async getStatus(): Promise<SystemStatusResponse> {
    const res = await fetchApiEnvelope<SystemStatusResponse>('/system/status');
    return res.data;
  },
};
