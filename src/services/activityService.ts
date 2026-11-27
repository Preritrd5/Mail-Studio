import { fetchApiEnvelope } from './apiConfig';

export interface AttemptHistoryItem {
  id: string;
  attempt_number: number;
  status: 'sending' | 'sent' | 'failed' | 'outcome_unknown';
  started_at: string;
  completed_at?: string | null;
  smtp_message_id?: string | null;
  failure_reason?: string | null;
  worker_id?: string | null;
}

export interface ActivityItem {
  id: string;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  campaign_id: string;
  campaign_name: string;
  campaign_type: 'individual' | 'bulk';
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'outcome_unknown' | 'cancelled';
  attempt_count: number;
  sent_at?: string | null;
  created_at: string;
  smtp_message_id?: string | null;
  failure_reason?: string | null;
}

export interface ActivityDetail extends ActivityItem {
  claimed_at?: string | null;
  campaign?: {
    id: string;
    campaign_name: string;
    campaign_type: 'individual' | 'bulk';
    subject: string;
    template_snapshot?: any;
    created_at: string;
  };
  attempts: AttemptHistoryItem[];
}

export interface ActivityPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ActivityListResponse {
  items: ActivityItem[];
  pagination: ActivityPagination;
}

export const activityService = {
  async listActivity(params: {
    search?: string;
    status?: string;
    campaign_id?: string;
    campaign_type?: string;
    date_range?: string;
    sort_by?: string;
    sort_order?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ActivityListResponse> {
    const query = new URLSearchParams();

    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'all') query.append('status', params.status);
    if (params.campaign_id && params.campaign_id !== 'all') query.append('campaign_id', params.campaign_id);
    if (params.campaign_type && params.campaign_type !== 'all') query.append('campaign_type', params.campaign_type);
    if (params.date_range && params.date_range !== 'all') query.append('date_range', params.date_range);
    if (params.sort_by) query.append('sort_by', params.sort_by);
    if (params.sort_order) query.append('sort_order', params.sort_order);
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));

    const json = await fetchApiEnvelope<ActivityItem[]>(`/activity?${query.toString()}`);

    return {
      items: json.data || [],
      pagination: {
        total: json.pagination?.total ?? 0,
        page: json.pagination?.page ?? 1,
        limit: json.pagination?.limit ?? 20,
        totalPages: json.pagination?.totalPages ?? 1,
      },
    };
  },

  async getActivityDetail(id: string): Promise<ActivityDetail> {
    const json = await fetchApiEnvelope<ActivityDetail>(`/activity/${id}`);
    return json.data;
  },

  async retryActivity(id: string): Promise<any> {
    const json = await fetchApiEnvelope(`/activity/${id}/retry`, {
      method: 'POST',
    });
    return json;
  },
};
