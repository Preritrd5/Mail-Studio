import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Download, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  PieChart as PieIcon, 
  ArrowUpRight, 
  FileText, 
  Filter,
  Layers,
  FileSpreadsheet,
  Info,
  RefreshCw,
  ShieldCheck,
  Check
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { Card, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Select } from '../components/common/Select';
import { StateNotice, classifyApiError, DataStateKind } from '../components/common/StateNotice';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { reportsService, OverviewMetrics, CampaignReportItem, TimelineItem } from '../services/reportsService';

export const ReportsView: React.FC = () => {
  const { dateRange, setDateRange, addToast } = useApp();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  // Live state from backend reports API
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<CampaignReportItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [loadIssue, setLoadIssue] = useState<{
    kind: Extract<DataStateKind, 'auth_required' | 'error'>;
    message: string;
    statusCode?: number;
    errorCode?: string;
  } | null>(null);

  const ranges = [
    { id: 'today' as const, label: 'Today' },
    { id: '7d' as const, label: 'Last 7 Days' },
    { id: '30d' as const, label: 'Last 30 Days' },
    { id: 'all' as const, label: 'All Records' },
  ];

  // Fetch reports data exclusively from backend API
  const fetchReportsData = useCallback(async (isRefresh = false) => {
    if (isAuthLoading) return;

    if (!user) {
      setOverview(null);
      setLiveCampaigns([]);
      setTimeline([]);
      setBackendConnected(false);
      setLoadIssue({
        kind: 'auth_required',
        message: 'Sign in as an administrator to view delivery reports and analytics.',
        statusCode: 401,
        errorCode: 'AUTH_REQUIRED',
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadIssue(null);

    try {
      const [overviewRes, timelineRes, campaignsRes] = await Promise.allSettled([
        reportsService.getOverview({
          date_range: dateRange,
          campaign_id: selectedCampaignId !== 'all' ? selectedCampaignId : undefined,
        }),
        reportsService.getTimeline(dateRange === 'today' ? 1 : dateRange === '30d' ? 30 : 7),
        reportsService.listCampaignReports({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          limit: 50,
        }),
      ]);

      let firstError: any = null;

      if (overviewRes.status === 'fulfilled') {
        setOverview(overviewRes.value);
        setBackendConnected(true);
      } else {
        setOverview(null);
        setBackendConnected(false);
        firstError = firstError || overviewRes.reason;
      }

      if (timelineRes.status === 'fulfilled') {
        setTimeline(timelineRes.value);
      } else {
        setTimeline([]);
        firstError = firstError || timelineRes.reason;
      }

      if (campaignsRes.status === 'fulfilled') {
        setLiveCampaigns(campaignsRes.value.campaigns);
      } else {
        setLiveCampaigns([]);
        firstError = firstError || campaignsRes.reason;
      }

      if (firstError) {
        const classified = classifyApiError(firstError, 'Backend reports service unavailable.');
        setLoadIssue({
          kind: classified.isAuthError ? 'auth_required' : 'error',
          message: classified.message,
          statusCode: classified.statusCode,
          errorCode: classified.errorCode,
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthLoading, user?.id, dateRange, selectedCampaignId, statusFilter]);

  useEffect(() => {
    fetchReportsData();
  }, [fetchReportsData]);

  // Genuine numeric totals (never falls back to client dummy stores)
  const totalRecipients = overview ? overview.total_recipients : 0;
  const sentCount = overview ? overview.total_sent : 0;
  const pendingCount = overview ? overview.total_pending : 0;
  const failedCount = overview ? overview.total_failed : 0;
  const acceptanceRateStr = overview ? `${overview.acceptance_rate.toFixed(1)}%` : '0.0%';
  const failureRateStr = overview ? `${overview.failure_rate.toFixed(1)}%` : '0.0%';

  // Outcome distribution data for donut chart
  const outcomeData = useMemo(
    () => [
      { name: 'Accepted by SMTP', value: sentCount, color: '#1456AD' },
      { name: 'Pending in Queue', value: pendingCount, color: '#C69A4C' },
      { name: 'Failed / Bounces', value: failedCount, color: '#E11D48' },
    ],
    [sentCount, pendingCount, failedCount]
  );

  // Formatted chart data for daily bar chart strictly from live timeline
  const barChartData = useMemo(() => {
    return timeline.map((t) => ({
      day: t.date.slice(5),
      sent: t.sent,
      pending: 0,
      failed: t.failed,
    }));
  }, [timeline]);

  // Campaigns strictly from live backend response
  const displayCampaigns = useMemo(() => {
    return liveCampaigns
      .filter((c) => selectedCampaignId === 'all' || c.id === selectedCampaignId)
      .map((c) => ({
        id: c.id,
        name: c.campaign_name,
        targetAudience: c.campaign_type === 'individual' ? 'Individual Dispatch' : 'Bulk Campaign',
        totalRecipients: c.total_recipients,
        sentCount: c.sent_count,
        pendingCount: c.pending_count,
        failedCount: c.failed_count,
        completionRate: c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 100) : 0,
        status: c.status,
        createdAt: new Date(c.created_at).toLocaleDateString(),
      }));
  }, [liveCampaigns, selectedCampaignId]);

  // Export to CSV strictly via backend API
  const handleExportCSV = async () => {
    setExportingCsv(true);
    try {
      await reportsService.downloadCsv('campaigns', {
        campaign_id: selectedCampaignId !== 'all' ? selectedCampaignId : '',
        status: statusFilter !== 'all' ? statusFilter : '',
      });
      addToast({
        type: 'success',
        title: 'CSV Report Downloaded',
        message: 'Campaign report exported with spreadsheet formula sanitization.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'CSV Export Failed',
        message: err?.message || 'Unable to export CSV report from backend.',
      });
    } finally {
      setExportingCsv(false);
    }
  };

  // Export to Excel (.xlsx) strictly via backend API
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await reportsService.downloadExcel();
      addToast({
        type: 'success',
        title: 'Excel Workbook Downloaded',
        message: 'Performance report (.xlsx) generated with formula sanitization.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Excel Export Failed',
        message: err?.message || 'Unable to export Excel workbook from backend.',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Reconciliation & Integrity Banner */}
      <div className="p-3 bg-white border border-[#CBD5E1] text-[#172E58] rounded-[12px] text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start sm:items-center gap-2 min-w-0">
          <ShieldCheck size={18} className="text-[#1456AD] shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Reporting Ledger:</strong> Reconciled metrics distinguish distinct recipients from multi-attempt dispatches. Acceptance Rate strictly measures SMTP handshake confirmations.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1 whitespace-nowrap ${
              backendConnected
                ? 'bg-emerald-100 text-emerald-800'
                : !user
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                backendConnected
                  ? 'bg-emerald-500 animate-pulse'
                  : !user
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            {backendConnected ? 'Live Connected' : !user ? 'Auth Required' : 'Unavailable'}
          </span>
          <button
            type="button"
            onClick={() => fetchReportsData(true)}
            disabled={refreshing}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 hover:text-[#1456AD] transition-colors cursor-pointer"
            title="Refresh analytics data"
            aria-label="Refresh analytics data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#1456AD]' : ''} />
          </button>
        </div>
      </div>

      {loadIssue && (
        <StateNotice
          kind={loadIssue.kind}
          message={loadIssue.message}
          statusCode={loadIssue.statusCode}
          errorCode={loadIssue.errorCode}
          onRetry={loadIssue.kind === 'error' ? () => fetchReportsData(false) : undefined}
        />
      )}

      {/* Top Filter and Export Bar */}
      <Card>
        <div className="flex flex-col xl:flex-row xl:flex-wrap items-stretch xl:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto min-w-0">
            {/* Campaign Selector */}
            <div className="w-full sm:w-[205px] shrink-0">
              <Select
                aria-label="Filter reports by campaign"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="font-medium"
              >
                <option value="all">All Campaigns</option>
                {liveCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.campaign_name}</option>
                ))}
              </Select>
            </div>

            {/* Date Range Selector Pills: Responsive 2-column grid on mobile, inline row on sm+ */}
            <div className="grid grid-cols-2 sm:inline-flex sm:items-center gap-1 bg-[#F4F6FA] p-1 rounded-[10px] border border-[#CBD5E1] w-full sm:w-auto min-h-10 shrink-0">
              {ranges.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDateRange(r.id)}
                  className={`px-2.5 py-1.5 rounded-[7px] text-xs font-semibold whitespace-nowrap text-center transition-all cursor-pointer ${
                    dateRange === r.id
                      ? 'bg-white text-[#1456AD] shadow-xs'
                      : 'text-[#64748B] hover:text-[#172E58]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Export Actions: Working CSV & Working Excel (.xlsx) with Formula Protection */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto max-w-full">
            <Button
              variant="outline"
              size="md"
              icon={<FileSpreadsheet size={15} />}
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="text-[#1456AD] font-semibold"
            >
              {exportingExcel ? 'Exporting...' : 'Export Excel (.xlsx)'}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Download size={15} />}
              onClick={handleExportCSV}
              disabled={exportingCsv}
              className="font-semibold"
            >
              {exportingCsv ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards Grid (Reconciled Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card hoverable className="border-t-4 border-t-[#1456AD]">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
            Total Unique Recipients
          </span>
          <h3 className="text-2xl font-bold text-[#172E58] mt-1">
            {totalRecipients.toLocaleString()}
          </h3>
          <p className="text-xs text-[#64748B] mt-2 flex items-center gap-1">
            <TrendingUp size={13} className="text-[#1456AD]" />
            <span>{overview?.total_attempts ? `${overview.total_attempts} total attempts recorded` : 'Single & bulk campaigns'}</span>
          </p>
        </Card>

        <Card hoverable className="border-t-4 border-t-emerald-500">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
            Accepted by SMTP
          </span>
          <h3 className="text-2xl font-bold text-emerald-700 mt-1">
            {sentCount.toLocaleString()}
          </h3>
          <p className="text-xs text-[#64748B] mt-2">
            Acceptance Rate: <strong className="text-emerald-700">{acceptanceRateStr}</strong>
          </p>
        </Card>

        <Card hoverable className="border-t-4 border-t-[#C69A4C]">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
            Pending in Queue
          </span>
          <h3 className="text-2xl font-bold text-[#C69A4C] mt-1">
            {pendingCount.toLocaleString()}
          </h3>
          <p className="text-xs text-[#64748B] mt-2">
            Awaiting 5s sequential dispatch
          </p>
        </Card>

        <Card hoverable className="border-t-4 border-t-rose-500">
          <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
            Failed / Rejected
          </span>
          <h3 className="text-2xl font-bold text-rose-600 mt-1">
            {failedCount.toLocaleString()}
          </h3>
          <p className="text-xs text-[#64748B] mt-2">
            Failure Rate: <strong className="text-rose-600">{failureRateStr}</strong>
          </p>
        </Card>
      </div>

      {/* Visual Recharts Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Timeline Bar Chart (7 cols) */}
        <div className="lg:col-span-7 min-w-0 flex flex-col">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader
              title="Daily Outbound Performance Distribution"
              subtitle="Daily confirmed SMTP accepted volume"
              action={
                <Badge variant="navy" size="sm">
                  Recharts Visualizer
                </Badge>
              }
            />

            <div className="w-full flex-1 min-h-[256px] pt-2">
              {barChartData.length === 0 || barChartData.every(d => (d.sent || 0) === 0 && (d.failed || 0) === 0) ? (
                <div className="w-full h-full min-h-[248px] flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-[#CBD5E1] rounded-[8px]">
                  <BarChart3 className="w-8 h-8 text-slate-300" />
                  <p className="text-xs">No dispatch volume recorded yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBD5E1" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#172E58', 
                        borderRadius: '8px', 
                        color: '#fff', 
                        fontSize: '12px',
                        border: 'none',
                      }}
                    />
                    <Bar dataKey="sent" fill="#1456AD" radius={[4, 4, 0, 0]} name="Accepted (Sent)" />
                    <Bar dataKey="failed" fill="#E11D48" radius={[4, 4, 0, 0]} name="Failed Attempts" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        {/* Outcome Donut Chart (5 cols) */}
        <div className="lg:col-span-5 min-w-0 flex flex-col">
          <Card className="h-full flex flex-col justify-between">
            <div>
              <CardHeader
                title="Outcome Distribution"
                subtitle="Reconciled breakdown across all active dispatches"
              />

              <div className="w-full h-56 flex items-center justify-center">
                {totalRecipients === 0 || outcomeData.every(d => d.value === 0) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-[#CBD5E1] rounded-[8px]">
                    <PieIcon className="w-8 h-8 text-slate-300" />
                    <p className="text-xs">No dispatch outcomes recorded yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={outcomeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {outcomeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#172E58', 
                          borderRadius: '8px', 
                          color: '#fff', 
                          fontSize: '11px',
                          border: 'none',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1456AD] shrink-0" /> Accepted ({acceptanceRateStr})
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C69A4C] shrink-0" /> Pending
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48] shrink-0" /> Failed ({failureRateStr})
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Campaign Summary Table with Working Filters */}
      <Card>
        <CardHeader
          title="Campaign Performance Summary"
          subtitle={`Showing ${displayCampaigns.length} campaigns matching current filters`}
          action={
            <div className="flex items-center gap-2">
              <Select
                controlSize="sm"
                aria-label="Filter campaigns by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Campaign Statuses</option>
                <option value="completed">Completed Only</option>
                <option value="running">Running / Sending Only</option>
                <option value="queued">Queued Only</option>
                <option value="paused">Paused Only</option>
                <option value="cancelled">Cancelled Only</option>
              </Select>
            </div>
          }
        />

        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold border-b border-[#CBD5E1] uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4 sm:px-5">Campaign Name</th>
                <th className="py-2.5 px-3">Target Audience</th>
                <th className="py-2.5 px-3">Total Target</th>
                <th className="py-2.5 px-3">Sent Count</th>
                <th className="py-2.5 px-3">Pending</th>
                <th className="py-2.5 px-3">Failed</th>
                <th className="py-2.5 px-3">Progress</th>
                <th className="py-2.5 px-4 sm:px-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CBD5E1]">
              {displayCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No campaigns found matching selected filters.
                  </td>
                </tr>
              ) : (
                displayCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 px-4 sm:px-5 font-semibold text-[#172E58]">
                      {camp.name}
                    </td>
                    <td className="py-3 px-3 text-[#64748B]">
                      {camp.targetAudience}
                    </td>
                    <td className="py-3 px-3 font-medium text-[#1E293B] whitespace-nowrap">
                      {camp.totalRecipients.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-emerald-700 whitespace-nowrap">
                      {camp.sentCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-[#C69A4C] font-medium whitespace-nowrap">
                      {camp.pendingCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-rose-600 font-medium whitespace-nowrap">
                      {camp.failedCount}
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-20 bg-[#CBD5E1] rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            camp.status === 'completed' ? 'bg-emerald-500' : 'bg-[#1456AD]'
                          }`}
                          style={{ width: `${camp.completionRate}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#64748B] mt-0.5 inline-block whitespace-nowrap">
                        {camp.completionRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right">
                      {camp.status === 'completed' && <Badge variant="success" size="sm" dot>Completed</Badge>}
                      {camp.status === 'running' && <Badge variant="info" size="sm" dot>Running</Badge>}
                      {camp.status === 'queued' && <Badge variant="warning" size="sm" dot>Queued</Badge>}
                      {camp.status === 'paused' && <Badge variant="warning" size="sm" dot>Paused</Badge>}
                      {camp.status === 'needs_review' && <Badge variant="warning" size="sm" dot>Needs Review</Badge>}
                      {(camp.status === 'ready' || camp.status === 'draft') && <Badge variant="neutral" size="sm" dot>{camp.status}</Badge>}
                      {camp.status === 'cancelled' && <Badge variant="error" size="sm" dot>Cancelled</Badge>}
                      {camp.status === 'failed' && <Badge variant="error" size="sm" dot>Failed</Badge>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
