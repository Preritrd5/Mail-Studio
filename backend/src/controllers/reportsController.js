import { reportsRepository } from '../repositories/reportsRepository.js';
import { activityRepository } from '../repositories/activityRepository.js';
import { generateCsv } from '../utils/csvHelper.js';
import { generateExcelBuffer } from '../utils/excelHelper.js';

export async function getOverviewHandler(req, res, next) {
  try {
    const { date_range, campaign_type, campaign_id } = req.query;
    const overview = await reportsRepository.getOverviewMetrics({
      dateRange: date_range,
      campaignType: campaign_type,
      campaignId: campaign_id,
    });

    res.json({
      success: true,
      data: overview,
    });
  } catch (err) {
    next(err);
  }
}

export async function listCampaignReportsHandler(req, res, next) {
  try {
    const {
      search,
      campaign_type,
      status,
      sort_by,
      sort_order,
      page,
      limit,
    } = req.query;

    const result = await reportsRepository.getCampaignReports({
      search,
      campaignType: campaign_type,
      status,
      sortBy: sort_by,
      sortOrder: sort_order,
      page,
      limit,
    });

    res.json({
      success: true,
      data: result.campaigns,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignReportDetailHandler(req, res, next) {
  try {
    const { id } = req.params;
    const detail = await reportsRepository.getCampaignReportDetail(id);

    res.json({
      success: true,
      data: detail,
    });
  } catch (err) {
    next(err);
  }
}

export async function getTimelineHandler(req, res, next) {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const timeline = await reportsRepository.getTimelineMetrics({ days });

    res.json({
      success: true,
      data: timeline,
    });
  } catch (err) {
    next(err);
  }
}

export async function exportCsvHandler(req, res, next) {
  try {
    const exportType = req.query.type || 'activity'; // 'activity' | 'campaigns'
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');

    if (exportType === 'campaigns') {
      const { search, campaign_type, status } = req.query;
      const result = await reportsRepository.getCampaignReports({
        search,
        campaignType: campaign_type,
        status,
        limit: 1000,
      });

      const columns = [
        { key: 'id', label: 'Campaign ID' },
        { key: 'campaign_name', label: 'Campaign Name' },
        { key: 'campaign_type', label: 'Campaign Type' },
        { key: 'status', label: 'Status' },
        { key: 'total_recipients', label: 'Total Recipients' },
        { key: 'sent_count', label: 'SMTP Accepted Count' },
        { key: 'pending_count', label: 'Pending Count' },
        { key: 'failed_count', label: 'Failed Count' },
        { key: 'outcome_unknown_count', label: 'Outcome Unknown Count' },
        { key: 'acceptance_rate', label: 'SMTP Acceptance Rate (%)' },
        { key: 'created_at', label: 'Created At' },
        { key: 'completed_at', label: 'Completed At' },
      ];

      const csvString = generateCsv(result.campaigns, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="snpsunexus_campaign_report_${timestamp}.csv"`);
      return res.send(csvString);
    } else {
      // Default: activity export
      const { search, status, campaign_id, campaign_type, date_range } = req.query;
      const result = await activityRepository.getActivityList({
        search,
        status,
        campaignId: campaign_id,
        campaignType: campaign_type,
        dateRange: date_range,
        limit: 2000,
      });

      const columns = [
        { key: 'id', label: 'Log ID' },
        { key: 'recipient_name', label: 'Recipient Name' },
        { key: 'recipient_email', label: 'Recipient Email' },
        { key: 'subject', label: 'Subject' },
        { key: 'campaign_name', label: 'Campaign Name' },
        { key: 'campaign_type', label: 'Campaign Type' },
        { key: 'status', label: 'Current Status' },
        { key: 'attempt_count', label: 'Attempt Count' },
        { key: 'sent_at', label: 'Sent Timestamp' },
        { key: 'created_at', label: 'Created Timestamp' },
        { key: 'smtp_message_id', label: 'SMTP Message ID' },
        { key: 'failure_reason', label: 'Failure Reason' },
      ];

      const csvString = generateCsv(result.items, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="snpsunexus_email_activity_${timestamp}.csv"`);
      return res.send(csvString);
    }
  } catch (err) {
    next(err);
  }
}

export async function exportExcelHandler(req, res, next) {
  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');

    // 1. Overview sheet data
    const overview = await reportsRepository.getOverviewMetrics({});
    const overviewRows = [
      { Metric: 'Application', Value: 'SNPSUNEXUS Mail Studio' },
      { Metric: 'Generated At', Value: now.toLocaleString() },
      { Metric: 'Total Campaigns', Value: overview.total_campaigns },
      { Metric: 'Total Recipients', Value: overview.total_recipients },
      { Metric: 'SMTP Accepted Emails', Value: overview.total_sent },
      { Metric: 'Pending in Queue', Value: overview.total_pending },
      { Metric: 'Failed / Bounces', Value: overview.total_failed },
      { Metric: 'Outcome Unknown (Audited)', Value: overview.total_outcome_unknown },
      { Metric: 'Total Sending Attempts', Value: overview.total_attempts },
      { Metric: 'SMTP Acceptance Rate', Value: `${overview.acceptance_rate}%` },
      { Metric: 'SMTP Failure Rate', Value: `${overview.failure_rate}%` },
    ];

    // 2. Email Activity sheet data
    const activityResult = await activityRepository.getActivityList({ limit: 1000 });
    const activityCols = [
      { key: 'recipient_name', label: 'Recipient Name' },
      { key: 'recipient_email', label: 'Recipient Email' },
      { key: 'subject', label: 'Subject' },
      { key: 'campaign_name', label: 'Campaign Name' },
      { key: 'campaign_type', label: 'Campaign Type' },
      { key: 'status', label: 'Status' },
      { key: 'attempt_count', label: 'Attempts' },
      { key: 'created_at', label: 'Logged At' },
      { key: 'smtp_message_id', label: 'Message ID' },
      { key: 'failure_reason', label: 'Failure Reason' },
    ];

    // 3. Campaign Summary sheet data
    const campaignsResult = await reportsRepository.getCampaignReports({ limit: 500 });
    const campaignCols = [
      { key: 'campaign_name', label: 'Campaign Name' },
      { key: 'campaign_type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'total_recipients', label: 'Total Target' },
      { key: 'sent_count', label: 'SMTP Accepted' },
      { key: 'pending_count', label: 'Pending' },
      { key: 'failed_count', label: 'Failed' },
      { key: 'outcome_unknown_count', label: 'Outcome Unknown' },
      { key: 'acceptance_rate', label: 'Acceptance Rate (%)' },
      { key: 'created_at', label: 'Created At' },
    ];

    const sheets = [
      {
        sheetName: 'Report Overview',
        data: overviewRows,
        columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value / Count' }],
      },
      {
        sheetName: 'Email Activity',
        data: activityResult.items,
        columns: activityCols,
      },
      {
        sheetName: 'Campaign Summary',
        data: campaignsResult.campaigns,
        columns: campaignCols,
      },
    ];

    const excelBuffer = generateExcelBuffer(sheets);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="snpsunexus_report_${timestamp}.xlsx"`);
    return res.send(excelBuffer);
  } catch (err) {
    next(err);
  }
}
