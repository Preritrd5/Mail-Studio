import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ArrowUpRight, 
  TrendingUp, 
  Users, 
  Layers, 
  ChevronRight,
  Sparkles,
  Calendar,
  Activity,
  BarChart3
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { Card, CardHeader } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { CardSkeleton, TableSkeleton, SyncStatusPill } from '../components/common/Loading';
import { StateNotice, classifyApiError, DataStateKind } from '../components/common/StateNotice';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DateRange } from '../types';
import { reportsService, OverviewMetrics, TimelineItem, CampaignReportItem } from '../services/reportsService';
import { activityService, ActivityItem } from '../services/activityService';
import { systemService, SystemStatusResponse } from '../services/systemService';

export const DashboardView: React.FC = () => {
  const {
    navigateTo,
    dateRange,
    setDateRange,
  } = useApp();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [liveOverview, setLiveOverview] = useState<OverviewMetrics | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<TimelineItem[]>([]);
  const [liveActivities, setLiveActivities] = useState<ActivityItem[]>([]);
  const [liveCampaigns, setLiveCampaigns] = useState<CampaignReportItem[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadIssue, setLoadIssue] = useState<{
    kind: Extract<DataStateKind, 'auth_required' | 'error'>;
    message: string;
    statusCode?: number;
    errorCode?: string;
  } | null>(null);

  const hasLoadedOnceRef = React.useRef<boolean>(false);

  const dateOptions: { id: DateRange; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: 'all', label: 'All Records' },
  ];

  // Fetch live dashboard metrics strictly from backend APIs
  const fetchDashboardData = useCallback(async () => {
    if (isAuthLoading) return;

    if (!user) {
      hasLoadedOnceRef.current = false;
      setLiveOverview(null);
      setLiveTimeline([]);
      setLiveActivities([]);
      setLiveCampaigns([]);
      setSystemStatus(null);
      setLoadIssue({
        kind: 'auth_required',
        message: 'Not signed in — Please sign in first as an administrator to view live campaign metrics, system telemetry, and email activity.',
        statusCode: 401,
        errorCode: 'AUTH_REQUIRED',
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (hasLoadedOnceRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadIssue(null);

    try {
      const [overviewRes, timelineRes, activitiesRes, campaignsRes, statusRes] = await Promise.allSettled([
        reportsService.getOverview({ date_range: dateRange }),
        reportsService.getTimeline(dateRange === 'today' ? 1 : dateRange === '30d' ? 30 : 7),
        activityService.listActivity({ limit: 4 }),
        reportsService.listCampaignReports({ limit: 5 }),
        systemService.getStatus(),
      ]);

      let firstError: any = null;

      if (overviewRes.status === 'fulfilled') {
        setLiveOverview(overviewRes.value);
      } else {
        setLiveOverview(null);
        firstError = firstError || overviewRes.reason;
      }

      if (timelineRes.status === 'fulfilled') {
        setLiveTimeline(timelineRes.value);
      } else {
        setLiveTimeline([]);
        firstError = firstError || timelineRes.reason;
      }

      if (activitiesRes.status === 'fulfilled') {
        setLiveActivities(activitiesRes.value.items);
      } else {
        setLiveActivities([]);
        firstError = firstError || activitiesRes.reason;
      }

      if (campaignsRes.status === 'fulfilled') {
        setLiveCampaigns(campaignsRes.value.campaigns);
      } else {
        setLiveCampaigns([]);
        firstError = firstError || campaignsRes.reason;
      }

      if (statusRes.status === 'fulfilled') {
        setSystemStatus(statusRes.value);
      } else {
        setSystemStatus(null);
        firstError = firstError || statusRes.reason;
      }

      if (firstError) {
        const classified = classifyApiError(firstError, 'Failed to load dashboard telemetry.');
        setLoadIssue({
          kind: classified.isAuthError ? 'auth_required' : 'error',
          message: classified.message,
          statusCode: classified.statusCode,
          errorCode: classified.errorCode,
        });
      } else {
        hasLoadedOnceRef.current = true;
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, isAuthLoading, user?.id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Genuine numeric state (zeroed when database is empty or unavailable; never fabricated)
  const totalSent = liveOverview ? liveOverview.total_sent : 0;
  const totalPending = liveOverview ? liveOverview.total_pending : 0;
  const totalFailed = liveOverview ? liveOverview.total_failed : 0;
  const successRate = liveOverview ? `${liveOverview.acceptance_rate.toFixed(1)}%` : '0.0%';
  const failureRate = liveOverview ? `${liveOverview.failure_rate.toFixed(1)}%` : '0.0%';

  // Chart data derived exclusively from live timeline
  const chartData = useMemo(() => {
    return liveTimeline.map((t) => ({
      day: t.date.slice(5),
      sent: t.sent,
      pending: 0,
      failed: t.failed,
    }));
  }, [liveTimeline]);

  const sysOperational = Boolean(
    systemStatus && systemStatus.database.connected && systemStatus.smtp.configured && systemStatus.worker.healthy
  );
  const sysBadgeVariant = !systemStatus
    ? 'neutral'
    : sysOperational
    ? 'success'
    : systemStatus.database.connected
    ? 'warning'
    : 'error';
  const sysBadgeLabel = loading
    ? 'Checking...'
    : !user
    ? 'Sign In Required'
    : !systemStatus
    ? 'Unavailable'
    : sysOperational
    ? 'Operational'
    : systemStatus.database.connected
    ? 'Degraded'
    : 'DB Offline';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#172E58] to-[#1F3C73] rounded-[14px] p-6 text-white shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-[#1456AD]/30">
        <div className="flex items-start sm:items-center gap-4 max-w-2xl">
          <div className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl bg-white/10 border border-white/20 p-2 shrink-0 flex items-center justify-center shadow-sm">
            <img
              src="/assets/snpsunexus-logo.png"
              alt="SNPSUNEXUS Logo"
              className="w-full h-full object-contain drop-shadow-xs"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#E7C27B] bg-[#C69A4C]/20 px-2.5 py-0.5 rounded-full border border-[#C69A4C]/30 flex items-center gap-1">
                <Sparkles size={12} /> SNPSUNEXUS Platform
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              Welcome to SNPSUNEXUS Mail Studio
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Manage individual emails, bulk campaigns, reusable templates, and email activity from one central workspace.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
          <Button 
            variant="gold" 
            size="md"
            icon={<Send size={16} />}
            onClick={() => navigateTo('compose')}
            className="w-full sm:w-auto font-semibold cursor-pointer"
          >
            Compose Email
          </Button>
          <Button 
            variant="outline" 
            size="md"
            onClick={() => navigateTo('bulk-import')}
            className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border-white/20 cursor-pointer"
          >
            Bulk Campaign
          </Button>
        </div>
      </div>

      {/* Date-Range Selector & Scope Ribbon */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-[12px] border border-[#CBD5E1] shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#172E58] min-w-0">
          <Calendar size={16} className="text-[#1456AD] shrink-0" />
          <span>Analytics Time Window:</span>
          <span className="text-[11px] font-normal text-[#64748B]">
            (Reconciled live from queue and dispatch ledger)
          </span>
          {(loading || refreshing) && user && (
            <SyncStatusPill label={loading ? 'Loading metrics...' : 'Updating metrics...'} />
          )}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-1 bg-[#F4F6FA] p-1 rounded-[10px] border border-[#CBD5E1] shrink-0">
          {dateOptions.map((opt) => (
            <button
              type="button"
              key={opt.id}
              onClick={() => setDateRange(opt.id)}
              className={`px-3 min-h-8 py-1.5 rounded-[7px] text-xs font-semibold whitespace-nowrap snpsu-control-pill ${
                dateRange === opt.id
                  ? 'bg-white text-[#1456AD] shadow-xs'
                  : 'text-[#64748B] hover:text-[#172E58]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loadIssue && (
        <StateNotice
          kind={loadIssue.kind}
          message={loadIssue.message}
          statusCode={loadIssue.statusCode}
          errorCode={loadIssue.errorCode}
          onRetry={loadIssue.kind === 'error' ? () => fetchDashboardData() : undefined}
        />
      )}

      {/* Four Core Metric Summary Cards */}
      {loading && !liveOverview && !loadIssue ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
          {[1, 2, 3, 4].map((idx) => (
            <CardSkeleton key={`dash-kpi-sk-${idx}`} variant="kpi" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
        {/* Total Emails Sent */}
        <Card hoverable className="relative overflow-hidden h-full flex flex-col justify-between pl-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-[#1456AD]" aria-hidden="true" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Accepted by SMTP</p>
              <h3 className="text-2xl font-bold text-[#172E58] mt-1 tracking-tight">
                {totalSent.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-[#EBF3FC] text-[#1456AD] shrink-0">
              <Send size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs text-emerald-600 font-medium gap-1.5 whitespace-nowrap">
            <TrendingUp size={14} className="shrink-0" />
            <span className="truncate">Confirmed deliveries</span>
          </div>
        </Card>

        {/* Deliverability / Acceptance Rate */}
        <Card hoverable className="relative overflow-hidden h-full flex flex-col justify-between pl-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Acceptance Rate</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1 tracking-tight">
                {successRate}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs text-[#64748B]">
            <span className="truncate">Sent / (Sent + Failed)</span>
          </div>
        </Card>

        {/* Pending in Queue */}
        <Card hoverable className="relative overflow-hidden h-full flex flex-col justify-between pl-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-[#C69A4C]" aria-hidden="true" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Pending in Queue</p>
              <h3 className="text-2xl font-bold text-[#C69A4C] mt-1 tracking-tight">
                {totalPending.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-[#FDF8EE] text-[#C69A4C] shrink-0">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="text-[#64748B] truncate">5.0s auto interval</span>
            <button
              type="button"
              onClick={() => navigateTo('sending-queue')}
              className="group text-[#1456AD] font-semibold hover:underline flex items-center shrink-0 whitespace-nowrap snpsu-focus-ring rounded px-1 py-0.5 cursor-pointer"
            >
              <span>Inspect</span>
              <ChevronRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </div>
        </Card>

        {/* Failed / Bounced */}
        <Card hoverable className="relative overflow-hidden h-full flex flex-col justify-between pl-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-rose-500" aria-hidden="true" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Failed / Rejected</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1 tracking-tight">
                {totalFailed.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs text-[#64748B] justify-between gap-2">
            <span className="truncate">Rate: {failureRate}</span>
            <button
              type="button"
              onClick={() => navigateTo('email-activity')}
              className="group text-rose-600 font-semibold hover:underline flex items-center shrink-0 whitespace-nowrap snpsu-focus-ring rounded px-1 py-0.5 cursor-pointer"
            >
              <span>View logs</span>
              <ChevronRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </div>
        </Card>
      </div>
      )}

      {/* Sending Performance Chart Grid */}
      {loading && !liveOverview && !loadIssue ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          <div className="lg:col-span-2 min-w-0">
            <CardSkeleton variant="chart" />
          </div>
          <div className="min-w-0">
            <CardSkeleton variant="list" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Visual Bar Chart (2 cols) */}
        <Card className="lg:col-span-2 min-w-0 h-full flex flex-col">
          <CardHeader
            title="Outbound Email Performance"
            subtitle={`Daily volume breakdown for ${dateRange.toUpperCase()}`}
            action={
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 bg-[#1456AD] rounded-xs shrink-0" /> Accepted
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 bg-[#E11D48] rounded-xs shrink-0" /> Failed
                </span>
              </div>
            }
          />

          <div className="w-full flex-1 min-h-[240px] pt-2">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="sent" fill="#1456AD" radius={[4, 4, 0, 0]} name="Accepted (Sent)" animationDuration={450} />
                  <Bar dataKey="failed" fill="#E11D48" radius={[4, 4, 0, 0]} name="Failed Attempts" animationDuration={450} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <BarChart3 size={32} className="text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No outbound email activity yet</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                  Activity metrics will populate automatically as emails are dispatched.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] pt-3 px-1 sm:px-2 border-t border-[#CBD5E1] mt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /> SPF / DKIM Validated
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-[#1456AD] shrink-0" /> Dedicated SMTP Relay
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('reports')}
              className="group text-[#1456AD] font-semibold hover:underline flex items-center gap-1 whitespace-nowrap snpsu-focus-ring rounded px-1 py-0.5 cursor-pointer"
            >
              <span>Reports &amp; Analytics</span>
              <ArrowUpRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>
        </Card>

        {/* System Health & Rapid Workflows */}
        <div className="flex flex-col gap-4 min-w-0 h-full">
          <Card className="flex-1 flex flex-col justify-between">
            <div>
              <CardHeader
                title="System Status"
                subtitle="Live Backend & Infrastructure Check"
                action={<Badge variant={sysBadgeVariant} dot>{sysBadgeLabel}</Badge>}
              />
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[#CBD5E1]">
                  <span className="text-[#64748B] shrink-0">Database Connection</span>
                  <span className={`font-medium truncate ${systemStatus?.database.connected ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {!user ? 'Unauthenticated' : systemStatus ? (systemStatus.database.connected ? 'Connected' : 'Unavailable') : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[#CBD5E1]">
                  <span className="text-[#64748B] shrink-0">SMTP Transport</span>
                  <span className="font-mono font-medium text-[#1E293B] truncate" title={systemStatus?.smtp?.configured ? `${systemStatus.smtp.host}:465` : undefined}>
                    {systemStatus?.smtp?.configured
                      ? `${systemStatus.smtp.host} (${systemStatus.smtp.verified ? 'Verified' : 'Configured'})`
                      : 'Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[#CBD5E1]">
                  <span className="text-[#64748B] shrink-0">Queue Worker</span>
                  <span className={`font-medium truncate ${systemStatus?.worker?.healthy ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {systemStatus?.worker
                      ? `${systemStatus.worker.worker_status}${systemStatus.worker.healthy && systemStatus.worker.worker_id ? ` (${systemStatus.worker.worker_id})` : ''}`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-[#64748B] shrink-0">Queue Interval Policy</span>
                  <span className="font-medium text-[#1E293B] whitespace-nowrap">
                    {systemStatus?.worker?.policy?.mandatory_interval_seconds
                      ? `${systemStatus.worker.policy.mandatory_interval_seconds}.0s configured`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-white to-[#F8FAFC]">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#172E58] mb-2.5">
              Rapid Workflows
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => navigateTo('compose')}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[#CBD5E1] hover:border-[#1456AD] hover:bg-[#EBF3FC]/55 hover:-translate-y-[1px] hover:shadow-xs active:translate-y-0 active:scale-[0.99] text-left transition-all duration-150 ease-out text-xs font-medium text-[#1E293B] group snpsu-focus-ring cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-md bg-[#1456AD]/10 text-[#1456AD] group-hover:bg-[#1456AD] group-hover:text-white transition-colors duration-150 shrink-0">
                    <Send size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172E58] truncate">Quick Single Dispatch</div>
                    <div className="text-[11px] text-[#64748B] truncate">Direct template &amp; custom sends</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-[#64748B] group-hover:text-[#1456AD] group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => navigateTo('bulk-import')}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[#CBD5E1] hover:border-[#C69A4C] hover:bg-[#FDF8EE]/55 hover:-translate-y-[1px] hover:shadow-xs active:translate-y-0 active:scale-[0.99] text-left transition-all duration-150 ease-out text-xs font-medium text-[#1E293B] group snpsu-focus-ring cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-md bg-[#C69A4C]/15 text-[#C69A4C] group-hover:bg-[#C69A4C] group-hover:text-white transition-colors duration-150 shrink-0">
                    <Users size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172E58] truncate">Launch Bulk Campaign</div>
                    <div className="text-[11px] text-[#64748B] truncate">CSV/XLSX roster &amp; 5s queue</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-[#64748B] group-hover:text-[#C69A4C] group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
              </button>
            </div>
          </Card>
        </div>
      </div>
      )}

      {/* Recent Campaigns Table & Activity Feed */}
      {loading && !liveOverview && !loadIssue ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          <div className="lg:col-span-2 min-w-0">
            <Card>
              <CardHeader title="Recent Campaigns" subtitle="Loading campaign ledger..." />
              <TableSkeleton rows={4} columns={5} />
            </Card>
          </div>
          <div className="min-w-0">
            <CardSkeleton variant="list" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Recent Campaigns (2 cols) */}
        <Card className="lg:col-span-2 min-w-0 h-full flex flex-col">
          <CardHeader
            title="Recent Campaigns"
            subtitle="Batch dispatches executed or queued"
            action={
              totalPending > 0 ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigateTo('sending-queue')}
                  className="cursor-pointer"
                >
                  View Active Queue ({totalPending})
                </Button>
              ) : undefined
            }
          />

          <div className="overflow-x-auto -mx-4 sm:-mx-5 flex-1">
            {liveCampaigns.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold border-b border-[#CBD5E1] uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 sm:px-5">Campaign / Type</th>
                    <th className="py-2.5 px-3">Recipients</th>
                    <th className="py-2.5 px-3">Progress</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-4 sm:px-5 text-right">Initiated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1]">
                  {liveCampaigns.slice(0, 5).map((camp) => {
                    const completionRate = camp.total_recipients > 0
                      ? Math.round((camp.sent_count / camp.total_recipients) * 100)
                      : 0;
                    return (
                      <tr key={camp.id} className="hover:bg-[#F8FAFC]/80 transition-colors">
                        <td className="py-3 px-4 sm:px-5">
                          <div className="font-semibold text-[#172E58]">{camp.campaign_name}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {camp.campaign_type === 'individual' ? 'Individual Dispatch' : 'Bulk Campaign'}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-medium text-[#1E293B] whitespace-nowrap">
                          {camp.total_recipients.toLocaleString()}
                        </td>
                        <td className="py-3 px-3">
                          <div className="w-24 bg-[#CBD5E1] rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                camp.status === 'completed' ? 'bg-emerald-500' : 'bg-[#1456AD]'
                              }`}
                              style={{ width: `${completionRate}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#64748B] mt-0.5 inline-block whitespace-nowrap">
                            {completionRate}% ({camp.sent_count}/{camp.total_recipients})
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            variant={
                              camp.status === 'completed'
                                ? 'success'
                                : camp.status === 'running'
                                ? 'info'
                                : camp.status === 'paused' || camp.status === 'queued' || camp.status === 'needs_review'
                                ? 'warning'
                                : camp.status === 'cancelled' || camp.status === 'failed'
                                ? 'error'
                                : 'neutral'
                            }
                            dot
                          >
                            {camp.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-right text-[11px] text-[#64748B] whitespace-nowrap">
                          {new Date(camp.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Layers size={36} className="text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">No campaigns yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Upload a recipient list or compose an email to create your first campaign.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigateTo('bulk-import')}
                  className="mt-4 cursor-pointer"
                >
                  Launch Campaign
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Activity Feed (1 col) */}
        <Card className="min-w-0 h-full flex flex-col">
          <CardHeader
            title="Recent Activity"
            subtitle="Latest individual recipient events"
            action={
              liveActivities.length > 0 ? (
                <button
                  type="button"
                  onClick={() => navigateTo('email-activity')}
                  className="text-xs text-[#1456AD] font-semibold hover:underline whitespace-nowrap cursor-pointer"
                >
                  All Logs
                </button>
              ) : undefined
            }
          />

          <div className="space-y-3.5 flex-1">
            {liveActivities.length > 0 ? (
              liveActivities.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border border-[#CBD5E1] bg-white hover:border-[#94A3B8] transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-[#172E58] truncate min-w-0">
                      {item.recipient_name}
                    </span>
                    {item.status === 'sent' && <Badge variant="success" size="sm">Accepted</Badge>}
                    {item.status === 'sending' && <Badge variant="info" size="sm">Sending</Badge>}
                    {item.status === 'pending' && <Badge variant="neutral" size="sm">Pending</Badge>}
                    {item.status === 'failed' && <Badge variant="error" size="sm">Failed</Badge>}
                    {item.status === 'outcome_unknown' && <Badge variant="warning" size="sm">Review</Badge>}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">
                    {item.recipient_email}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="truncate max-w-[140px]">{item.campaign_name}</span>
                    <span>{item.sent_at ? new Date(item.sent_at).toLocaleTimeString() : new Date(item.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 flex flex-col items-center justify-center text-center text-slate-400">
                <Activity size={32} className="text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No email activity found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Dispatched emails will appear here.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
      )}
    </div>
  );
};
