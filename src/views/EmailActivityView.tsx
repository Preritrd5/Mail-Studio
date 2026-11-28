import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  RefreshCw, 
  Download, 
  Eye, 
  RotateCcw,
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  Server
} from 'lucide-react';
import { Card, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Modal } from '../components/common/Modal';
import { PageLoader, CardSkeleton, TableSkeleton, SyncStatusPill } from '../components/common/Loading';
import { StateNotice, classifyApiError, DataStateKind } from '../components/common/StateNotice';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { activityService, ActivityItem, ActivityDetail } from '../services/activityService';
import { reportsService } from '../services/reportsService';

export const EmailActivityView: React.FC = () => {
  const { addToast } = useApp();
  const { user, isLoading: isAuthLoading } = useAuth();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [logs, setLogs] = useState<ActivityItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [loadIssue, setLoadIssue] = useState<{
    kind: Extract<DataStateKind, 'auth_required' | 'error'>;
    message: string;
    statusCode?: number;
    errorCode?: string;
  } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detailed Modal
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ActivityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Retry & Export Actions
  const [retryTarget, setRetryTarget] = useState<ActivityItem | null>(null);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'xlsx' | null>(null);

  const listAbortRef = React.useRef<AbortController | null>(null);
  const detailAbortRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  // Fetch Activity Data
  const fetchActivity = useCallback(async (isSilent = false) => {
    if (isAuthLoading) return;

    if (!user) {
      setLogs([]);
      setPagination({ total: 0, page: 1, limit: 15, totalPages: 1 });
      setLoadIssue({
        kind: 'auth_required',
        message: 'Sign in as an administrator to view persistent email activity and delivery logs.',
        statusCode: 401,
        errorCode: 'AUTH_REQUIRED',
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    if (isSilent) setRefreshing(true);
    else setLoading(true);
    setLoadIssue(null);

    try {
      const res = await activityService.listActivity(
        {
          search: searchQuery,
          status: statusFilter,
          campaign_type: campaignTypeFilter,
          date_range: dateFilter,
          sort_by: sortBy,
          sort_order: sortOrder,
          page: pagination.page,
          limit: pagination.limit,
        },
        controller.signal
      );

      if (controller.signal.aborted) return;
      setLogs(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      setLogs([]);
      const classified = classifyApiError(err, 'Unable to retrieve email activity records.');
      setLoadIssue({
        kind: classified.isAuthError ? 'auth_required' : 'error',
        message: classified.message,
        statusCode: classified.statusCode,
        errorCode: classified.errorCode,
      });
    } finally {
      if (listAbortRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isAuthLoading, user?.id, searchQuery, statusFilter, campaignTypeFilter, dateFilter, sortBy, sortOrder, pagination.page, pagination.limit]);

  // Debounced fetch on search changes so typing does not spam overlapping network requests
  useEffect(() => {
    const delay = searchQuery.trim() ? 220 : 0;
    const timer = window.setTimeout(() => {
      void fetchActivity(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [fetchActivity, searchQuery]);

  // View Record Detail (opens Modal immediately with local loader & abort cleanup)
  const handleViewDetail = async (id: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    setDetailTargetId(id);
    setSelectedDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const detail = await activityService.getActivityDetail(id, controller.signal);
      if (controller.signal.aborted) return;
      setSelectedDetail(detail);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      setDetailError(err?.message || 'Failed to load transmission history.');
      addToast({
        type: 'error',
        title: 'Detail Load Error',
        message: err?.message || 'Failed to load transmission history.',
      });
    } finally {
      if (detailAbortRef.current === controller) {
        setDetailLoading(false);
      }
    }
  };

  // Execute Retry
  const handleConfirmRetry = async () => {
    if (!retryTarget) return;
    setRetrying(true);
    try {
      const res = await activityService.retryActivity(retryTarget.id);
      addToast({
        type: 'success',
        title: 'Delivery Retry Initiated',
        message: res.message || 'Retry operation successfully executed.',
      });
      setRetryTarget(null);
      if (selectedDetail && selectedDetail.id === retryTarget.id) {
        setSelectedDetail(null);
      }
      fetchActivity(true);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Retry Failed',
        message: err.message || 'Unable to retry recipient.',
      });
    } finally {
      setRetrying(false);
    }
  };

  // CSV Export
  const handleExportCSV = async () => {
    if (exportingFormat !== null) return;
    setExportingFormat('csv');
    try {
      await reportsService.downloadCsv('activity', {
        search: searchQuery,
        status: statusFilter,
        campaign_type: campaignTypeFilter,
        date_range: dateFilter,
      });
      addToast({
        type: 'success',
        title: 'CSV Export Initiated',
        message: 'Downloaded activity ledger matching current filters.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Export Failed', message: err.message });
    } finally {
      setExportingFormat(null);
    }
  };

  // Excel (.xlsx) Export
  const handleExportExcel = async () => {
    if (exportingFormat !== null) return;
    setExportingFormat('xlsx');
    try {
      await reportsService.downloadExcel();
      addToast({
        type: 'success',
        title: 'Excel Export Initiated',
        message: 'Downloaded activity report (.xlsx).',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Excel Export Failed', message: err.message });
    } finally {
      setExportingFormat(null);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCampaignTypeFilter('all');
    setDateFilter('all');
    setSortBy('created_at');
    setSortOrder('desc');
    setPagination(p => ({ ...p, page: 1 }));
  };

  // Summary counts across currently loaded ledger
  const sentCount = logs.filter(l => l.status === 'sent').length;
  const pendingCount = logs.filter(l => l.status === 'pending' || l.status === 'sending').length;
  const failedCount = logs.filter(l => l.status === 'failed').length;
  const unknownCount = logs.filter(l => l.status === 'outcome_unknown').length;

  return (
    <div className="space-y-6">
      {/* 1. Honest Protocol Standard Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 text-[#1456AD] rounded-[12px] text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
        <div className="flex items-start sm:items-center gap-2 min-w-0">
          <Info size={16} className="text-[#1456AD] shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Transmission Standard:</strong> <em>"Accepted by SMTP"</em> confirms mail transfer agent (MTA) reception at Gmail SMTP (Port 465 TLS). It does not infer final inbox delivery or user open receipts without explicit provider webhooks.
          </span>
        </div>
        <Badge variant="navy" size="sm">
          MTA Handshake Audited
        </Badge>
      </div>

      {loadIssue && (
        <StateNotice
          kind={loadIssue.kind}
          message={loadIssue.message}
          statusCode={loadIssue.statusCode}
          errorCode={loadIssue.errorCode}
          onRetry={loadIssue.kind === 'error' ? () => fetchActivity(false) : undefined}
        />
      )}

      {/* 2. Search, Filter & Export Controls */}
      <Card>
        <div className="flex flex-col gap-3">
          {/* Row 1: Search Input + Primary Export/Reset Actions */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-0">
              <Input
                placeholder="Search recipient name, email address, subject, or campaign..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                leftIcon={<Search size={16} />}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {(loading || refreshing) && <SyncStatusPill label={loading ? 'Loading ledger...' : 'Refreshing ledger...'} />}
              <Button
                variant="outline"
                size="md"
                icon={<RefreshCw size={14} />}
                onClick={resetFilters}
              >
                Reset
              </Button>
              <Button
                variant="outline"
                size="md"
                isLoading={exportingFormat === 'csv'}
                loadingText="Exporting CSV..."
                disabled={exportingFormat !== null}
                icon={<Download size={14} />}
                onClick={handleExportCSV}
                title="Export all matching records to CSV with formula injection protection"
              >
                CSV
              </Button>
              <Button
                variant="primary"
                size="md"
                isLoading={exportingFormat === 'xlsx'}
                loadingText="Generating..."
                disabled={exportingFormat !== null}
                icon={<FileSpreadsheet size={14} />}
                onClick={handleExportExcel}
                title="Download genuine multi-sheet Excel report (.xlsx)"
              >
                Excel (.xlsx)
              </Button>
            </div>
          </div>

          {/* Row 2: Equal-Width Filter Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Select
              aria-label="Filter by delivery status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
            >
              <option value="all">All Statuses</option>
              <option value="sent">Accepted by SMTP</option>
              <option value="pending">Pending in Queue</option>
              <option value="sending">Sending (In Flight)</option>
              <option value="failed">Failed / Rejected</option>
              <option value="outcome_unknown">Outcome Unknown</option>
              <option value="cancelled">Cancelled</option>
            </Select>

            <Select
              aria-label="Filter by campaign type"
              value={campaignTypeFilter}
              onChange={(e) => { setCampaignTypeFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
            >
              <option value="all">All Campaign Types</option>
              <option value="individual">Individual Sends</option>
              <option value="bulk">Bulk Roster Campaigns</option>
            </Select>

            <Select
              aria-label="Filter by date range"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
            >
              <option value="all">All History</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* 3. Activity Table */}
      <Card>
        <CardHeader
          title="Email Dispatch Ledger"
          subtitle={`Showing ${pagination.total} total transmission events matching current filters`}
          action={
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Accepted: <strong>{sentCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending: <strong>{pendingCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Failed: <strong>{failedCount}</strong>
              </span>
              {unknownCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500" /> Review: <strong>{unknownCount}</strong>
                </span>
              )}
            </div>
          }
        />

        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold border-b border-[#CBD5E1] uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4 sm:px-5">Recipient</th>
                <th className="py-2.5 px-3">Subject / Details</th>
                <th className="py-2.5 px-3">Campaign / Type</th>
                <th className="py-2.5 px-3">Attempts</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-4 sm:px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CBD5E1]">
              {loading ? (
                <TableSkeleton rows={8} columns={7} asTableRows />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64748B]">
                    <Layers size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-[#172E58]">
                      {searchQuery || statusFilter !== 'all' || campaignTypeFilter !== 'all' || dateFilter !== 'all'
                        ? 'No email activity matches your filter criteria'
                        : 'No email activity found'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {searchQuery || statusFilter !== 'all' || campaignTypeFilter !== 'all' || dateFilter !== 'all'
                        ? 'Try resetting the status, search, or date range filters.'
                        : 'Dispatched emails and audit records will appear here.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F8FAFC]/80 transition-colors">
                    <td className="py-3 px-5">
                      <div className="font-semibold text-[#172E58]">{log.recipient_name}</div>
                      <div className="font-mono text-[11px] text-[#1456AD]">{log.recipient_email}</div>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <div className="font-medium text-[#1E293B] truncate">{log.subject}</div>
                      {log.failure_reason && (
                        <div className="text-[10px] text-rose-600 font-medium truncate mt-0.5" title={log.failure_reason}>
                          {log.failure_reason}
                        </div>
                      )}
                      {log.smtp_message_id && (
                        <div className="text-[10px] text-slate-400 font-mono truncate" title={log.smtp_message_id}>
                          {log.smtp_message_id}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-[#172E58] truncate max-w-[160px]">{log.campaign_name}</div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        log.campaign_type === 'bulk' ? 'bg-[#EBF3FC] text-[#1456AD]' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {log.campaign_type}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[#64748B]">
                      #{log.attempt_count || 1}
                    </td>
                    <td className="py-3 px-3">
                      {log.status === 'sent' && (
                        <Badge variant="success" size="sm" dot>Accepted by SMTP</Badge>
                      )}
                      {log.status === 'sending' && (
                        <Badge variant="info" size="sm" dot>Transmitting</Badge>
                      )}
                      {log.status === 'pending' && (
                        <Badge variant="neutral" size="sm" dot>Pending in Queue</Badge>
                      )}
                      {log.status === 'failed' && (
                        <Badge variant="error" size="sm" dot>Failed / Rejected</Badge>
                      )}
                      {log.status === 'outcome_unknown' && (
                        <Badge variant="warning" size="sm" dot>Outcome Unknown</Badge>
                      )}
                      {log.status === 'cancelled' && (
                        <Badge variant="neutral" size="sm">Cancelled</Badge>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[#64748B] whitespace-nowrap">
                      {new Date(log.sent_at || log.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={detailLoading && detailTargetId === log.id}
                          loadingText="Loading..."
                          icon={<Eye size={12} />}
                          onClick={() => handleViewDetail(log.id)}
                          title="View Historical Attempt Records"
                        >
                          Details
                        </Button>

                        {log.status === 'failed' && (
                          <Button
                            variant="gold"
                            size="sm"
                            icon={<RotateCcw size={12} />}
                            onClick={() => setRetryTarget(log)}
                            title="Retry Email Transmission"
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-4 mt-2 border-t border-[#CBD5E1] text-xs text-[#64748B] gap-3">
          <span>
            Showing <strong>{logs.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}</strong> to{' '}
            <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of{' '}
            <strong>{pagination.total}</strong> records
          </span>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="px-3 py-1 font-semibold text-[#172E58]">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button 
              onClick={() => setPagination(p => ({ ...p, page: Math.min(pagination.totalPages, p.page + 1) }))}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Card>

      {/* 4. Detailed Activity & Attempt History Modal */}
      {detailTargetId && (
        <Modal
          isOpen={true}
          onClose={() => {
            detailAbortRef.current?.abort();
            setDetailTargetId(null);
            setSelectedDetail(null);
            setDetailError(null);
            setDetailLoading(false);
          }}
          title={
            selectedDetail
              ? `Transmission Audit: ${selectedDetail.recipient_name}`
              : 'Transmission Audit Details'
          }
          subtitle={
            selectedDetail
              ? `Recipient ID: ${selectedDetail.id} • ${selectedDetail.recipient_email}`
              : `Recipient ID: ${detailTargetId}`
          }
          maxWidth="lg"
          footer={
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
              {selectedDetail?.status === 'failed' && (
                <Button 
                  variant="gold" 
                  size="md" 
                  icon={<RotateCcw size={13} />}
                  onClick={() => {
                    setRetryTarget(selectedDetail);
                  }}
                >
                  Retry This Recipient
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  detailAbortRef.current?.abort();
                  setDetailTargetId(null);
                  setSelectedDetail(null);
                  setDetailError(null);
                  setDetailLoading(false);
                }}
                className="sm:ml-auto"
              >
                Close Record
              </Button>
            </div>
          }
        >
          {detailLoading ? (
            <div className="space-y-4">
              <PageLoader
                compact
                title="Loading transmission & SMTP attempt history..."
                subtitle="Retrieving immutable delivery logs from PostgreSQL"
              />
              <CardSkeleton variant="list" />
            </div>
          ) : detailError ? (
            <StateNotice
              compact
              kind="error"
              title="Unable to Load Audit Details"
              message={detailError}
              onRetry={() => handleViewDetail(detailTargetId)}
            />
          ) : selectedDetail ? (
          <div className="space-y-4 text-xs text-[#1E293B]">
            {/* Summary Box */}
            <div className="p-3 sm:p-4 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[#64748B] block text-[11px]">Recipient Full Name:</span>
                <span className="font-semibold text-[#172E58]">{selectedDetail.recipient_name}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[#64748B] block text-[11px]">Email Address:</span>
                <span className="font-mono text-[#1456AD] break-all">{selectedDetail.recipient_email}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[11px]">Campaign Name:</span>
                <span className="font-medium text-[#172E58]">{selectedDetail.campaign?.campaign_name || selectedDetail.campaign_name}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[11px]">Campaign Type:</span>
                <span className="font-semibold uppercase text-[#1456AD]">{selectedDetail.campaign?.campaign_type || selectedDetail.campaign_type}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[11px] mb-1">Current Status:</span>
                <Badge 
                  variant={
                    selectedDetail.status === 'sent' ? 'success' :
                    selectedDetail.status === 'failed' ? 'error' :
                    selectedDetail.status === 'outcome_unknown' ? 'warning' : 'neutral'
                  } 
                  size="sm" 
                  dot
                >
                  {selectedDetail.status.toUpperCase()}
                </Badge>
              </div>
              <div className="min-w-0">
                <span className="text-[#64748B] block text-[11px]">SMTP Message ID:</span>
                <span className="font-mono text-[11px] text-[#64748B] break-all">
                  {selectedDetail.smtp_message_id || 'Not assigned / Pre-dispatch'}
                </span>
              </div>
            </div>

            {/* Failure Box */}
            {selectedDetail.failure_reason && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-1 text-rose-800">
                <span className="font-bold flex items-center gap-1.5 text-xs text-rose-900">
                  <AlertCircle size={15} /> Delivery Failure Diagnosis:
                </span>
                <p className="font-mono text-[11px]">{selectedDetail.failure_reason}</p>
                <p className="text-[11px] text-rose-700 pt-0.5">
                  Notice: Address failed delivery or DNS resolution. Verify recipient details before retrying.
                </p>
              </div>
            )}

            {/* Chronological Attempt History */}
            <div className="space-y-2">
              <h5 className="font-bold text-[#172E58] text-xs flex items-center gap-1.5">
                <Clock size={14} className="text-[#1456AD]" /> Chronological Attempt History ({selectedDetail.attempts?.length || 1} Total Attempts):
              </h5>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {(selectedDetail.attempts && selectedDetail.attempts.length > 0) ? (
                  selectedDetail.attempts.map((att) => (
                    <div key={att.id} className="p-2.5 rounded-lg border border-[#CBD5E1] bg-white flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[#172E58]">
                          Attempt #{att.attempt_number}
                        </span>
                        <Badge 
                          variant={att.status === 'sent' ? 'success' : att.status === 'failed' ? 'error' : 'warning'} 
                          size="sm"
                        >
                          {att.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-[#64748B]">
                        <span>Started: {new Date(att.started_at).toLocaleTimeString()}</span>
                        <span>Completed: {att.completed_at ? new Date(att.completed_at).toLocaleTimeString() : 'In Flight'}</span>
                        <span className="font-mono">Worker: {att.worker_id || 'system'}</span>
                      </div>
                      {att.failure_reason && (
                        <div className="text-[10px] text-rose-600 font-mono mt-0.5">
                          {att.failure_reason}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-slate-400 bg-slate-50 rounded-lg">
                    Single dispatch recorded.
                  </div>
                )}
              </div>
            </div>

            {/* Recorded Delivery Metadata */}
            <div className="grid grid-cols-3 gap-3 text-center pt-1">
              <div className="p-2 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-[10px] font-semibold text-slate-600 uppercase block">Dispatch Type</span>
                <span className="font-bold text-[#172E58] text-xs uppercase">
                  {selectedDetail.campaign?.campaign_type || selectedDetail.campaign_type}
                </span>
              </div>
              <div className="p-2 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-[10px] font-semibold text-slate-600 uppercase block">Attempts Recorded</span>
                <span className="font-bold text-[#172E58] text-xs">{selectedDetail.attempts?.length || selectedDetail.attempt_count || 0}</span>
              </div>
              <div className="p-2 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-[10px] font-semibold text-slate-600 uppercase block">Dispatched At</span>
                <span className="font-bold text-[#172E58] text-xs">
                  {selectedDetail.sent_at ? new Date(selectedDetail.sent_at).toLocaleTimeString() : '—'}
                </span>
              </div>
            </div>
          </div>
          ) : null}
        </Modal>
      )}

      {/* 5. Retry Confirmation Modal */}
      {retryTarget && (
        <Modal
          isOpen={true}
          onClose={() => !retrying && setRetryTarget(null)}
          title="Confirm Delivery Retry"
          subtitle={`Target: ${retryTarget.recipient_name} (${retryTarget.recipient_email})`}
          maxWidth="md"
          footer={
            <>
              <Button variant="outline" size="sm" disabled={retrying} onClick={() => setRetryTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="gold"
                size="sm"
                isLoading={retrying}
                loadingText="Retrying..."
                icon={<RotateCcw size={13} />}
                onClick={handleConfirmRetry}
                disabled={retrying}
                className="font-bold"
              >
                Confirm &amp; Retry
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs text-[#1E293B]">
            <p>
              You are about to re-initiate transmission for recipient <strong>{retryTarget.recipient_name}</strong>.
            </p>

            {retryTarget.campaign_type === 'bulk' ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-[#1456AD] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Server size={14} /> Sequential Bulk Queue Workflow:
                </p>
                <p className="text-[11px] leading-relaxed">
                  This recipient will be returned to <strong>Pending</strong> status in the bulk sending queue. It will be dispatched sequentially by the global worker, respecting the mandatory 5-second interval and rate-limiting rules.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600" /> Individual Email Dispatch:
                </p>
                <p className="text-[11px] leading-relaxed">
                  A new sending attempt will be initiated with duplicate-submission protection and authenticated via Gmail SMTP. Previous failure records will be preserved in the audit log.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
