import { fetchApiEnvelope, fetchApiBlob } from './apiConfig';

export interface OverviewMetrics {
  total_campaigns: number;
  bulk_campaigns: number;
  individual_campaigns: number;
  total_recipients: number;
  total_sent: number;
  total_failed: number;
  total_pending: number;
  total_sending: number;
  total_outcome_unknown: number;
  total_cancelled: number;
  total_attempts: number;
  acceptance_rate: number;
  failure_rate: number;
  generated_at?: string;
}

export interface CampaignReportItem {
  id: string;
  campaign_name: string;
  campaign_type: 'individual' | 'bulk';
  status: 'draft' | 'ready' | 'queued' | 'running' | 'paused' | 'needs_review' | 'completed' | 'cancelled' | 'failed';
  total_recipients: number;
  sent_count: number;
  pending_count: number;
  failed_count: number;
  outcome_unknown_count: number;
  cancelled_count: number;
  acceptance_rate: number;
  failure_rate: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface TimelineItem {
  date: string;
  sent: number;
  failed: number;
  outcome_unknown: number;
}

export const reportsService = {
  async getOverview(
    params: { date_range?: string; campaign_type?: string; campaign_id?: string } = {},
    signal?: AbortSignal
  ): Promise<OverviewMetrics> {
    const query = new URLSearchParams();
    if (params.date_range && params.date_range !== 'all') query.append('date_range', params.date_range);
    if (params.campaign_type && params.campaign_type !== 'all') query.append('campaign_type', params.campaign_type);
    if (params.campaign_id) query.append('campaign_id', params.campaign_id);

    const json = await fetchApiEnvelope<OverviewMetrics>(`/reports/overview?${query.toString()}`, { signal });
    return json.data;
  },

  async listCampaignReports(
    params: {
      search?: string;
      campaign_type?: string;
      status?: string;
      sort_by?: string;
      sort_order?: string;
      page?: number;
      limit?: number;
    } = {},
    signal?: AbortSignal
  ): Promise<{ campaigns: CampaignReportItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.campaign_type && params.campaign_type !== 'all') query.append('campaign_type', params.campaign_type);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.sort_by) query.append('sort_by', params.sort_by);
    if (params.sort_order) query.append('sort_order', params.sort_order);
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));

    const json = await fetchApiEnvelope<CampaignReportItem[]>(`/reports/campaigns?${query.toString()}`, { signal });
    return {
      campaigns: json.data || [],
      total: json.pagination?.total ?? (json.data ? json.data.length : 0),
    };
  },

  async getCampaignReportDetail(id: string): Promise<any> {
    const json = await fetchApiEnvelope(`/reports/campaigns/${id}`);
    return json.data;
  },

  async getTimeline(days: number = 7, signal?: AbortSignal): Promise<TimelineItem[]> {
    const json = await fetchApiEnvelope<TimelineItem[]>(`/reports/timeline?days=${days}`, { signal });
    return json.data || [];
  },

  async downloadCsv(type: 'activity' | 'campaigns' = 'activity', filters: Record<string, string> = {}, signal?: AbortSignal): Promise<void> {
    const query = new URLSearchParams({ type, ...filters });
    const blob = await fetchApiBlob(`/reports/export/csv?${query.toString()}`, { signal });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snpsunexus_${type}_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async downloadExcel(signal?: AbortSignal): Promise<void> {
    const blob = await fetchApiBlob('/reports/export/xlsx', { signal });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snpsunexus_report_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
