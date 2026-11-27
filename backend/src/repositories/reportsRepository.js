import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';

function resolveStartDate(dateRange) {
  const now = new Date();
  if (dateRange === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (dateRange === '7d') {
    return new Date(now.getTime() - 7 * 86400000).toISOString();
  }
  if (dateRange === '30d') {
    return new Date(now.getTime() - 30 * 86400000).toISOString();
  }
  return null;
}

/**
 * ReportsRepository
 * Aggregates genuine metrics strictly from PostgreSQL tables (`campaigns`, `campaign_recipients`, `email_attempts`).
 * Never substitutes fake counters or fallback data when the database fails or is empty.
 */
export class ReportsRepository {
  async getOverviewSummary(params) {
    return this.getOverviewMetrics(params);
  }

  async listCampaignReports(params) {
    return this.getCampaignReports(params);
  }

  async getOverviewMetrics({ dateRange = 'all', campaignType = 'all', campaignId = null } = {}) {
    if (dateRange === 'all' && campaignType === 'all' && !campaignId) {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('get_reports_overview_summary');
      if (!rpcErr && rpcData) {
        return rpcData;
      }
      if (rpcErr && rpcErr.code !== 'PGRST202' && !String(rpcErr.message || '').includes('Could not find the function')) {
        throw createDatabaseError('ReportsRepository.getOverviewMetrics.rpc', rpcErr);
      }
    }

    const startDate = resolveStartDate(dateRange);

    let campQuery = supabaseAdmin.from('campaigns').select('id, campaign_type, status, created_at');
    if (campaignType !== 'all') {
      campQuery = campQuery.eq('campaign_type', campaignType);
    }
    if (campaignId) {
      campQuery = campQuery.eq('id', campaignId);
    }
    if (startDate) {
      campQuery = campQuery.gte('created_at', startDate);
    }

    const { data: camps, error: campErr } = await campQuery;
    if (campErr) {
      throw createDatabaseError('ReportsRepository.getOverviewMetrics.campaigns', campErr);
    }

    let recipQuery = supabaseAdmin.from('campaign_recipients').select('status, created_at, campaign_id');
    if (campaignId) {
      recipQuery = recipQuery.eq('campaign_id', campaignId);
    }
    if (startDate) {
      recipQuery = recipQuery.gte('created_at', startDate);
    }
    const { data: recips, error: recipErr } = await recipQuery;
    if (recipErr) {
      throw createDatabaseError('ReportsRepository.getOverviewMetrics.campaign_recipients', recipErr);
    }

    let attQuery = supabaseAdmin.from('email_attempts').select('*', { count: 'exact', head: true });
    if (campaignId) {
      attQuery = attQuery.eq('campaign_id', campaignId);
    }
    if (startDate) {
      attQuery = attQuery.gte('created_at', startDate);
    }
    const { count: attemptCount, error: attErr } = await attQuery;
    if (attErr) {
      throw createDatabaseError('ReportsRepository.getOverviewMetrics.email_attempts', attErr);
    }

    const campList = camps || [];
    let recipList = recips || [];

    if (campaignType !== 'all' && !campaignId) {
      const matchingCampIds = new Set(campList.map((c) => c.id));
      recipList = recipList.filter((r) => matchingCampIds.has(r.campaign_id));
    }

    const totalCampaigns = campList.length;
    const bulkCount = campList.filter((c) => c.campaign_type === 'bulk').length;
    const individualCount = campList.filter((c) => c.campaign_type === 'individual').length;

    const totalRecips = recipList.length;
    const sentCount = recipList.filter((r) => r.status === 'sent').length;
    const failedCount = recipList.filter((r) => r.status === 'failed').length;
    const pendingCount = recipList.filter((r) => r.status === 'pending').length;
    const sendingCount = recipList.filter((r) => r.status === 'sending').length;
    const unknownCount = recipList.filter((r) => r.status === 'outcome_unknown').length;
    const cancelledCount = recipList.filter((r) => r.status === 'cancelled').length;

    const known = sentCount + failedCount;
    const acceptanceRate = known > 0 ? Math.round((sentCount / known) * 1000) / 10 : 0;
    const failureRate = known > 0 ? Math.round((failedCount / known) * 1000) / 10 : 0;

    return {
      total_campaigns: totalCampaigns,
      bulk_campaigns: bulkCount,
      individual_campaigns: individualCount,
      total_recipients: totalRecips,
      total_sent: sentCount,
      total_failed: failedCount,
      total_pending: pendingCount,
      total_sending: sendingCount,
      total_outcome_unknown: unknownCount,
      total_cancelled: cancelledCount,
      total_attempts: typeof attemptCount === 'number' ? attemptCount : totalRecips,
      acceptance_rate: acceptanceRate,
      failure_rate: failureRate,
      generated_at: new Date().toISOString(),
    };
  }

  async getCampaignReports({
    search = '',
    campaignType = 'all',
    status = 'all',
    sortBy = 'created_at',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin.from('campaigns').select('*', { count: 'exact' });

    if (search && search.trim()) {
      query = query.ilike('campaign_name', `%${search.trim()}%`);
    }
    if (campaignType && campaignType !== 'all') {
      query = query.eq('campaign_type', campaignType);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const validSortCols = {
      created_at: 'created_at',
      campaign_name: 'campaign_name',
      total_recipients: 'total_recipients',
      status: 'status',
    };
    const sortCol = validSortCols[sortBy] || 'created_at';
    query = query.order(sortCol, { ascending: sortOrder.toLowerCase() === 'asc' });
    query = query.range(offset, offset + limitNum - 1);

    const { data, count, error } = await query;
    if (error) {
      throw createDatabaseError('ReportsRepository.getCampaignReports', error);
    }

    const enriched = (data || []).map((camp) => {
      const sent = camp.sent_count || 0;
      const failed = camp.failed_count || 0;
      const known = sent + failed;
      return {
        ...camp,
        acceptance_rate: known > 0 ? Math.round((sent / known) * 1000) / 10 : 0,
        failure_rate: known > 0 ? Math.round((failed / known) * 1000) / 10 : 0,
      };
    });

    const total = typeof count === 'number' ? count : enriched.length;
    return {
      campaigns: enriched,
      total,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    };
  }

  async getCampaignReportDetail(campaignId) {
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();

    if (campErr) {
      throw createDatabaseError('ReportsRepository.getCampaignReportDetail.campaign', campErr);
    }
    if (!campaign) {
      const err = new Error(`Campaign '${campaignId}' not found.`);
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const { data: recips, error: recipErr } = await supabaseAdmin
      .from('campaign_recipients')
      .select('id, recipient_name, recipient_email, status, attempt_count, sent_at, failure_reason')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (recipErr) {
      throw createDatabaseError('ReportsRepository.getCampaignReportDetail.recipients', recipErr);
    }

    const sent = campaign.sent_count || 0;
    const failed = campaign.failed_count || 0;
    const known = sent + failed;

    return {
      id: campaign.id,
      campaign: {
        ...campaign,
        acceptance_rate: known > 0 ? Math.round((sent / known) * 1000) / 10 : 0,
        failure_rate: known > 0 ? Math.round((failed / known) * 1000) / 10 : 0,
      },
      recipients: recips || [],
    };
  }

  async getTimelineMetrics(param = 7) {
    const days = typeof param === 'number' ? param : param?.days || 7;
    const startDate = new Date(Date.now() - (days - 1) * 86400000).toISOString();

    const { data: recips, error } = await supabaseAdmin
      .from('campaign_recipients')
      .select('status, sent_at, created_at')
      .gte('created_at', startDate);

    if (error) {
      throw createDatabaseError('ReportsRepository.getTimelineMetrics', error);
    }

    const map = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().substring(0, 10);
      map[d] = { date: d, sent: 0, failed: 0, outcome_unknown: 0 };
    }

    for (const r of recips || []) {
      const dateStr = (r.sent_at || r.created_at || '').substring(0, 10);
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = { date: dateStr, sent: 0, failed: 0, outcome_unknown: 0 };
      if (r.status === 'sent') map[dateStr].sent++;
      if (r.status === 'failed') map[dateStr].failed++;
      if (r.status === 'outcome_unknown') map[dateStr].outcome_unknown++;
    }

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export const reportsRepository = new ReportsRepository();
