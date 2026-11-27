import { fetchApiEnvelope } from './apiConfig';

export interface WorkerHealth {
  healthy: boolean;
  worker_id: string | null;
  worker_status: 'idle' | 'active' | 'waiting_interval' | 'paused' | 'stopping' | 'stopped' | 'failed' | 'offline';
  heartbeat_at: string | null;
  seconds_since_heartbeat: number | null;
  next_send_allowed_at: string | null;
  lock_generation: number | null;
  active_workers_count?: number;
  active_campaign_id: string | null;
  active_recipient_id: string | null;
  smtp_dispatch: {
    isBusy: boolean;
    activeChannel: string | null;
    activeContext: any;
    lockAcquiredAt: string | null;
    elapsedMs: number;
  };
  policy?: {
    mandatory_interval_seconds: number;
    concurrency_limit: number;
    smtp_tls_strict: boolean;
  };
}

export interface QueueCampaign {
  id: string;
  campaign_name: string;
  campaign_type: 'individual' | 'bulk';
  subject: string;
  status: 'draft' | 'ready' | 'queued' | 'running' | 'paused' | 'needs_review' | 'completed' | 'cancelled' | 'failed';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  outcome_unknown_count?: number;
  template_id?: string | null;
  template_version?: number;
  template_snapshot?: any;
  created_at: string;
  started_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

export interface QueueRecipient {
  id: string;
  campaign_id: string;
  recipient_name: string;
  recipient_email: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'outcome_unknown' | 'cancelled';
  attempt_count: number;
  claimed_at?: string | null;
  claimed_by_worker?: string | null;
  sent_at?: string | null;
  failure_reason?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  created_at: string;
}

export interface QueueEvent {
  id: string;
  campaign_id?: string | null;
  recipient_id?: string | null;
  worker_id?: string | null;
  event_type: string;
  event_details: any;
  created_at: string;
}

export interface QueueStatusResponse {
  worker: WorkerHealth;
  active_campaigns: QueueCampaign[];
  total_campaigns: number;
  server_timestamp: string;
}

export const queueService = {
  async getStatus(): Promise<QueueStatusResponse> {
    const res = await fetchApiEnvelope<QueueStatusResponse>('/queue');
    return res.data;
  },

  async getWorkerHealth(): Promise<WorkerHealth> {
    const res = await fetchApiEnvelope<WorkerHealth>('/queue/worker/health');
    return res.data;
  },

  async listCampaigns(status: string = 'all', page: number = 1, limit: number = 20): Promise<{ campaigns: QueueCampaign[]; total: number }> {
    const res = await fetchApiEnvelope<{ campaigns: QueueCampaign[]; total: number }>(
      `/queue/campaigns?status=${encodeURIComponent(status)}&page=${page}&limit=${limit}`
    );
    return res.data;
  },

  async getCampaignDetails(id: string): Promise<{ campaign: QueueCampaign; recipients: QueueRecipient[]; events: QueueEvent[] }> {
    const res = await fetchApiEnvelope<{ campaign: QueueCampaign; recipients: QueueRecipient[]; events: QueueEvent[] }>(
      `/queue/campaigns/${id}`
    );
    return res.data;
  },

  async startCampaign(id: string): Promise<QueueCampaign> {
    const res = await fetchApiEnvelope<QueueCampaign>(`/queue/campaigns/${id}/start`, { method: 'POST' });
    return res.data;
  },

  async pauseCampaign(id: string): Promise<QueueCampaign> {
    const res = await fetchApiEnvelope<QueueCampaign>(`/queue/campaigns/${id}/pause`, { method: 'POST' });
    return res.data;
  },

  async resumeCampaign(id: string): Promise<QueueCampaign> {
    const res = await fetchApiEnvelope<QueueCampaign>(`/queue/campaigns/${id}/resume`, { method: 'POST' });
    return res.data;
  },

  async cancelCampaign(id: string): Promise<QueueCampaign> {
    const res = await fetchApiEnvelope<QueueCampaign>(`/queue/campaigns/${id}/cancel`, { method: 'POST' });
    return res.data;
  },

  async resolveOutcomeUnknown(recipientId: string, resolution: 'sent' | 'failed', notes?: string): Promise<QueueRecipient> {
    const res = await fetchApiEnvelope<QueueRecipient>(`/queue/recipients/${recipientId}/resolve-outcome`, {
      method: 'POST',
      body: JSON.stringify({ resolution, notes }),
    });
    return res.data;
  },

  async executeStep(): Promise<any> {
    const res = await fetchApiEnvelope('/queue/step', { method: 'POST' });
    return res.data;
  },
};
