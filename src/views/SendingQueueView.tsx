import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  Clock, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  ShieldCheck, 
  HelpCircle,
  Activity,
  History,
  ChevronRight,
  Server,
  Lock,
  ArrowRight
} from 'lucide-react';
import { Card, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner, CardSkeleton, TableSkeleton, SyncStatusPill } from '../components/common/Loading';
import { StateNotice, classifyApiError } from '../components/common/StateNotice';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { 
  queueService, 
  WorkerHealth, 
  QueueCampaign, 
  QueueRecipient, 
  QueueEvent 
} from '../services/queueService';

export const SendingQueueView: React.FC = () => {
  const { addToast } = useApp();
  const { user, isLoading: isAuthLoading } = useAuth();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState<boolean>(false);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'auth_required' | 'failed'>('syncing');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncStatusCode, setSyncStatusCode] = useState<number | undefined>(undefined);
  const [syncErrorCode, setSyncErrorCode] = useState<string | undefined>(undefined);
  const [worker, setWorker] = useState<WorkerHealth | null>(null);
  const [campaigns, setCampaigns] = useState<QueueCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<QueueCampaign | null>(null);
  const [recipients, setRecipients] = useState<QueueRecipient[]>([]);
  const [events, setEvents] = useState<QueueEvent[]>([]);

  // Action states (granular single-flight tracking so exact clicked button displays spinner)
  type QueuePendingAction = 'start' | 'pause' | 'resume' | 'step' | 'cancel' | 'resolve' | null;
  const [pendingAction, setPendingAction] = useState<QueuePendingAction>(null);
  const actionLoading = pendingAction !== null;
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [resolvingRecipient, setResolvingRecipient] = useState<QueueRecipient | null>(null);
  const [resolutionChoice, setResolutionChoice] = useState<'sent' | 'failed'>('sent');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');

  // 5-Second Interval Live Countdown
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  // Concurrency, mounted guard & selection refs to prevent duplicate or stale calls
  const isMountedRef = React.useRef<boolean>(true);
  const isFetchingRef = React.useRef<boolean>(false);
  const selectedCampaignIdRef = React.useRef<string | null>(selectedCampaignId);
  selectedCampaignIdRef.current = selectedCampaignId;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load Queue Status
  const loadQueueData = useCallback(async (isSilent = false) => {
    if (isAuthLoading) return;

    if (!user?.id) {
      setWorker(null);
      setCampaigns([]);
      setSelectedCampaignId(null);
      setActiveCampaign(null);
      setRecipients([]);
      setEvents([]);
      setSyncStatus('auth_required');
      setSyncErrorMessage('Sign in as an administrator to inspect queue telemetry and control campaign dispatch.');
      setSyncStatusCode(401);
      setSyncErrorCode('AUTH_REQUIRED');
      setLoading(false);
      setRefreshing(false);
      setBackgroundSyncing(false);
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isSilent) setBackgroundSyncing(true);
    else setRefreshing(true);

    try {
      const statusData = await queueService.getStatus();
      if (!isMountedRef.current) return;
      setWorker(statusData.worker);
      setCampaigns(statusData.active_campaigns);
      setSyncStatus('synced');
      setSyncErrorMessage(null);
      setSyncStatusCode(undefined);
      setSyncErrorCode(undefined);

      // Preserve currently chosen campaign if still active, else select the first active batch
      const currentSelected = selectedCampaignIdRef.current;
      const targetId = currentSelected && statusData.active_campaigns.some(c => c.id === currentSelected)
        ? currentSelected
        : statusData.active_campaigns[0]?.id || null;

      if (targetId !== currentSelected) {
        setSelectedCampaignId(targetId);
      }

      if (targetId) {
        const details = await queueService.getCampaignDetails(targetId);
        if (!isMountedRef.current) return;
        setActiveCampaign(details.campaign);
        setRecipients(details.recipients);
        setEvents(details.events);
      } else {
        setActiveCampaign(null);
        setRecipients([]);
        setEvents([]);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const classified = classifyApiError(err, 'Unable to communicate with the sequential queue backend.');
      setWorker(null);
      setCampaigns([]);
      setActiveCampaign(null);
      setRecipients([]);
      setEvents([]);
      setSyncStatus(classified.isAuthError ? 'auth_required' : 'failed');
      setSyncErrorMessage(classified.message);
      setSyncStatusCode(classified.statusCode);
      setSyncErrorCode(classified.errorCode);
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
        setBackgroundSyncing(false);
      }
    }
  }, [isAuthLoading, user?.id]);

  // Initial load
  useEffect(() => {
    loadQueueData();
  }, [loadQueueData]);

  // Poll only while synced and authenticated (3s during active dispatches, 10s when idle)
  const hasActiveQueueWork = campaigns.some(c => ['running', 'queued', 'needs_review'].includes(c.status));
  useEffect(() => {
    if (!user?.id || syncStatus !== 'synced') return;
    const intervalMs = hasActiveQueueWork || worker?.healthy ? 3000 : 10000;
    const timer = setInterval(() => {
      loadQueueData(true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [user?.id, syncStatus, hasActiveQueueWork, worker?.healthy, loadQueueData]);

  // Calculate 5-second interval countdown every 500ms
  useEffect(() => {
    const timer = setInterval(() => {
      if (worker?.next_send_allowed_at) {
        const allowedMs = new Date(worker.next_send_allowed_at).getTime();
        const diffMs = allowedMs - Date.now();
        setCountdownSeconds(Math.max(0, Math.ceil(diffMs / 1000)));
      } else {
        setCountdownSeconds(0);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [worker?.next_send_allowed_at]);

  // Switch active campaign
  const handleSelectCampaign = async (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setIsLoadingRecipients(true);
    try {
      const details = await queueService.getCampaignDetails(campaignId);
      if (!isMountedRef.current) return;
      setActiveCampaign(details.campaign);
      setRecipients(details.recipients);
      setEvents(details.events);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Campaign Details Error',
        message: err.message || 'Failed to load campaign records.',
      });
    } finally {
      if (isMountedRef.current) setIsLoadingRecipients(false);
    }
  };

  // Start campaign
  const handleStart = async () => {
    if (!activeCampaign || actionLoading) return;
    setPendingAction('start');
    try {
      const updated = await queueService.startCampaign(activeCampaign.id);
      if (!isMountedRef.current) return;
      setActiveCampaign(updated);
      addToast({
        type: 'success',
        title: 'Campaign Queued',
        message: `"${updated.campaign_name}" is now queued for sequential 5-second delivery.`,
      });
      loadQueueData(true);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Start Failed', message: err.message });
    } finally {
      if (isMountedRef.current) setPendingAction(null);
    }
  };

  // Pause campaign
  const handlePause = async () => {
    if (!activeCampaign || actionLoading) return;
    setPendingAction('pause');
    try {
      const updated = await queueService.pauseCampaign(activeCampaign.id);
      if (!isMountedRef.current) return;
      setActiveCampaign(updated);
      addToast({
        type: 'info',
        title: 'Campaign Paused',
        message: `Execution of "${updated.campaign_name}" has been paused.`,
      });
      loadQueueData(true);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Pause Failed', message: err.message });
    } finally {
      if (isMountedRef.current) setPendingAction(null);
    }
  };

  // Resume campaign
  const handleResume = async () => {
    if (!activeCampaign || actionLoading) return;
    setPendingAction('resume');
    try {
      const updated = await queueService.resumeCampaign(activeCampaign.id);
      if (!isMountedRef.current) return;
      setActiveCampaign(updated);
      addToast({
        type: 'success',
        title: 'Campaign Resumed',
        message: `"${updated.campaign_name}" resumed sequential queue execution.`,
      });
      loadQueueData(true);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Resume Failed', message: err.message });
    } finally {
      if (isMountedRef.current) setPendingAction(null);
    }
  };

  // Cancel campaign
  const handleCancel = async () => {
    if (!activeCampaign || actionLoading) return;
    setPendingAction('cancel');
    try {
      const updated = await queueService.cancelCampaign(activeCampaign.id);
      if (!isMountedRef.current) return;
      setActiveCampaign(updated);
      setIsCancelModalOpen(false);
      addToast({
        type: 'warning',
        title: 'Campaign Cancelled',
        message: `Campaign cancelled. Pending recipients marked as failed.`,
      });
      loadQueueData(true);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Cancel Failed', message: err.message });
    } finally {
      if (isMountedRef.current) setPendingAction(null);
    }
  };

  // Execute single manual step (for administrative step dispatch)
  const handleExecuteStep = async () => {
    if (actionLoading) return;
    setPendingAction('step');
    try {
      const stepRes = await queueService.executeStep();
      if (!isMountedRef.current) return;
      if (stepRes.status === 'waiting_interval') {
        addToast({
          type: 'warning',
          title: 'Mandatory Interval Active',
          message: `Worker enforcing 5-second pause. Try again in ${Math.ceil(stepRes.remainingMs / 1000)}s.`,
        });
      } else if (stepRes.status === 'processed') {
        addToast({
          type: 'success',
          title: 'Step Dispatched',
          message: `Dispatched recipient with outcome: ${stepRes.result.outcome.toUpperCase()}`,
        });
      } else {
        addToast({
          type: 'info',
          title: 'Queue Standby',
          message: stepRes.message || 'No pending recipients eligible in queue.',
        });
      }
      loadQueueData(true);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Step Execution Error', message: err.message });
    } finally {
      if (isMountedRef.current) setPendingAction(null);
    }
  };

  // Submit outcome unknown resolution
  const handleResolveOutcome = async () => {
    if (!resolvingRecipient || actionLoading) return;
    setPendingAction('resolve');
    try {
      await queueService.resolveOutcomeUnknown(
        resolvingRecipient.id,
        resolutionChoice,
        resolutionNotes
      );
      if (!isMountedRef.current) return;
      addToast({
        type: 'success',
        title: 'Outcome Resolved',
        message: `Recipient marked as ${resolutionChoice.toUpperCase()}. Campaign status updated.`,
      });
      setResolvingRecipient(null);
      setResolutionNotes('');
      loadQueueData(true);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Resolution Failed', message: err.message });
    } finally {
      if (isMountedRef.current) setPendingAction(null);
    }
  };

  // Calculations
  const isRunning = activeCampaign?.status === 'running';
  const isQueued = activeCampaign?.status === 'queued';
  const isPaused = activeCampaign?.status === 'paused';
  const isNeedsReview = activeCampaign?.status === 'needs_review' || (activeCampaign?.outcome_unknown_count || 0) > 0;
  const isCompleted = activeCampaign?.status === 'completed';
  const isCancelled = activeCampaign?.status === 'cancelled';
  const isReady = activeCampaign?.status === 'ready' || activeCampaign?.status === 'draft';

  const total = activeCampaign?.total_recipients || 0;
  const sent = activeCampaign?.sent_count || 0;
  const failed = activeCampaign?.failed_count || 0;
  const pending = activeCampaign?.pending_count || 0;
  const unknown = activeCampaign?.outcome_unknown_count || 0;
  const progressPct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  // Current truly in-flight recipient (never promote 'pending' as in-flight)
  const currentInFlight = recipients.find(r => r.status === 'sending') || null;
  const nextPendingRecipient = recipients.find(r => r.status === 'pending') || null;

  // Determine Worker Status Label & Dot strictly from verified backend state
  const getWorkerStatusInfo = () => {
    if (syncStatus === 'auth_required') {
      return {
        label: 'Queue Telemetry Locked',
        sub: 'Authenticate below to inspect live queue controls and worker heartbeats.',
        dotClass: 'bg-amber-400',
        statusColor: 'text-amber-300',
        countdownText: 'Locked',
      };
    }
    if (syncStatus === 'failed') {
      return {
        label: 'Queue Synchronization Offline',
        sub:
          syncErrorCode === 'DATABASE_SCHEMA_MISSING'
            ? 'Connected Supabase project database schema has not been initialized yet.'
            : 'Unable to synchronize with queue backend. Inspect details below.',
        dotClass: 'bg-rose-500 animate-pulse',
        statusColor: 'text-rose-400',
        countdownText: 'Offline',
      };
    }
    if (!worker || !worker.healthy) {
      return {
        label: 'Worker Offline',
        sub: 'Sequential queue worker process is not currently active.',
        dotClass: 'bg-amber-400',
        statusColor: 'text-amber-400',
        countdownText: '—',
      };
    }
    if (isRunning) {
      return {
        label: worker.worker_status === 'waiting_interval' ? 'Waiting for Next Attempt' : 'Worker Running',
        sub: `Transmitting sequential batch: ${activeCampaign?.campaign_name || 'Active Campaign'}`,
        dotClass: 'bg-emerald-400 animate-pulse',
        statusColor: 'text-emerald-400',
        countdownText: countdownSeconds > 0 ? `${countdownSeconds}s Pausing` : 'Transmitting',
      };
    }
    if (isPaused) {
      return {
        label: 'Worker Connected — Paused',
        sub: 'Sequential dispatch has been paused by administrator.',
        dotClass: 'bg-amber-400',
        statusColor: 'text-amber-400',
        countdownText: 'Paused',
      };
    }
    if (campaigns.length === 0 || !activeCampaign || (activeCampaign.pending_count === 0 && !activeCampaign.started_at)) {
      return {
        label: 'Worker Connected — Idle',
        sub: 'Global queue worker active. No pending campaigns currently queued.',
        dotClass: 'bg-blue-400',
        statusColor: 'text-blue-300',
        countdownText: '—',
      };
    }
    return {
      label: 'Worker Connected — Ready',
      sub: `Queued and ready: ${activeCampaign.campaign_name}`,
      dotClass: 'bg-emerald-400',
      statusColor: 'text-emerald-400',
      countdownText: countdownSeconds > 0 ? `${countdownSeconds}s` : 'Ready',
    };
  };

  const workerInfo = getWorkerStatusInfo();

  return (
    <div className="space-y-6">
      {/* 1. Global Queue Worker State Banner */}
      <div className={`rounded-[14px] p-5 shadow-card border transition-all ${
        syncStatus === 'failed' 
          ? 'bg-rose-950/90 text-white border-rose-500/50' 
          : 'bg-[#172E58] text-white border-[#1456AD]/40'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              syncStatus === 'failed' ? 'bg-rose-900/60 border-rose-400/40 text-rose-300' : 'bg-white/10 border-white/20 text-[#C69A4C]'
            }`}>
              <Server size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${workerInfo.dotClass}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${
                  syncStatus === 'failed' ? 'text-rose-300' : 'text-[#C69A4C]'
                }`}>
                  {workerInfo.label}
                </span>
                <span className="text-xs text-slate-300 whitespace-nowrap">
                  • Node: {worker?.healthy && worker?.worker_id ? worker.worker_id : 'unavailable'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {syncStatus !== 'synced' || !worker?.healthy ? (
                  <span className={syncStatus === 'failed' ? 'text-rose-200' : 'text-slate-300'}>{workerInfo.sub}</span>
                ) : (
                  <>
                    Lease Generation: <strong className="text-white font-mono">#{worker.lock_generation ?? '—'}</strong> • Heartbeat: {worker.heartbeat_at ? new Date(worker.heartbeat_at).toLocaleTimeString() : 'None'} • Active Workers: <strong className="text-emerald-400">{worker.active_workers_count ?? 1}</strong>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end shrink-0">
            {backgroundSyncing && <SyncStatusPill tone="dark" label="Live Sync..." />}

            {/* 5-Second Interval Countdown Display */}
            <div className="bg-black/30 px-3.5 py-1.5 rounded-lg border border-white/10 text-right">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Interval Lock
              </span>
              <span className={`text-sm font-mono font-bold ${
                syncStatus !== 'synced' ? 'text-rose-400' :
                countdownSeconds > 0 ? 'text-[#C69A4C]' : 'text-emerald-400'
              }`}>
                {workerInfo.countdownText}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              isLoading={refreshing}
              loadingText="Syncing..."
              icon={<RefreshCw size={14} />}
              onClick={() => loadQueueData(false)}
              className="bg-white/10 text-white hover:bg-white/20 border-white/20"
            >
              Sync
            </Button>
          </div>
        </div>
      </div>

      {/* Explicit Auth / DB / API Error Banner */}
      {syncStatus === 'auth_required' && (
        <StateNotice
          kind="auth_required"
          message={syncErrorMessage || undefined}
          statusCode={syncStatusCode}
          errorCode={syncErrorCode}
        />
      )}
      {syncStatus === 'failed' && (
        <StateNotice
          kind="error"
          title="Queue Synchronization Error"
          message={syncErrorMessage || undefined}
          statusCode={syncStatusCode}
          errorCode={syncErrorCode}
          onRetry={() => loadQueueData(false)}
        />
      )}

      {/* 2. Needs Review / Outcome Unknown Urgent Alert Banner */}
      {isNeedsReview && unknown > 0 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-[12px] text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                Action Required: {unknown} Recipient(s) In Uncertain Delivery State (Outcome Unknown)
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                The SMTP connection dropped during socket transmission. To preserve deliverability and prevent duplicate emails, automated retries are paused until an administrator audits the recipient outcome.
              </p>
            </div>
          </div>
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              const target = recipients.find(r => r.status === 'outcome_unknown') || null;
              setResolvingRecipient(target);
            }}
            className="font-bold shrink-0"
          >
            Review & Resolve Outcome
          </Button>
        </div>
      )}

      {/* Initial Queue Loading Skeletons */}
      {loading && syncStatus === 'syncing' && (
        <div className="space-y-6">
          <CardSkeleton variant="list" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <CardSkeleton variant="list" />
            </div>
            <div className="lg:col-span-5">
              <CardSkeleton variant="list" />
            </div>
          </div>
          <Card>
            <CardHeader
              title="Sequential Queue Buffer & Recipient Ledger"
              subtitle="Checking active worker heartbeats and campaign buffer..."
              action={<SyncStatusPill label="Checking worker health..." />}
            />
            <TableSkeleton rows={5} columns={6} />
          </Card>
        </div>
      )}

      {/* 3. Campaign Selector Tabs & 4. Active Campaign Dispatch Monitor (only when synced) */}
      {!loading && syncStatus === 'synced' && (
        <>
          <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider shrink-0">
                Bulk Campaigns ({campaigns.length}):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {campaigns.map((camp) => {
                  const isSelected = camp.id === selectedCampaignId;
                  return (
                    <button
                      key={camp.id}
                      type="button"
                      onClick={() => handleSelectCampaign(camp.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-left truncate max-w-[220px] cursor-pointer ${
                        isSelected
                          ? 'bg-[#172E58] text-white shadow-xs'
                          : 'bg-white text-[#1E293B] hover:bg-slate-100 border border-[#CBD5E1]'
                      }`}
                    >
                      <span className="truncate block">{camp.campaign_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {activeCampaign ? (
        <div className="bg-[#172E58] rounded-[14px] p-4 sm:p-6 text-white shadow-card border border-[#1456AD]/40 space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge
                  variant={
                    isRunning ? 'info' :
                    isNeedsReview ? 'warning' :
                    isPaused ? 'warning' :
                    isCompleted ? 'success' :
                    isCancelled ? 'error' : 'neutral'
                  }
                  size="sm"
                  dot
                >
                  {isRunning ? 'Running Sequential Dispatch' :
                   isNeedsReview ? 'Needs Administrative Review' :
                   isPaused ? 'Execution Paused' :
                   isCompleted ? 'Campaign Completed' :
                   isCancelled ? 'Campaign Cancelled' : 'Ready in Queue'}
                </Badge>
                <span className="text-xs text-slate-300">
                  • Target: {total} Recipients
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight">
                {activeCampaign.campaign_name}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Subject: <strong className="text-white">{activeCampaign.subject}</strong>
              </p>
            </div>

            {/* Campaign Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isRunning || isQueued ? (
                <Button
                  variant="outline"
                  size="md"
                  isLoading={pendingAction === 'pause'}
                  loadingText="Pausing..."
                  icon={<Pause size={16} />}
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                >
                  Pause
                </Button>
              ) : isPaused ? (
                <Button
                  variant="gold"
                  size="md"
                  isLoading={pendingAction === 'resume'}
                  loadingText="Resuming..."
                  icon={<Play size={16} />}
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="font-bold"
                >
                  Resume
                </Button>
              ) : isReady ? (
                <Button
                  variant="gold"
                  size="md"
                  isLoading={pendingAction === 'start'}
                  loadingText="Starting..."
                  icon={<Play size={16} />}
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="font-bold shadow-md"
                >
                  Start Sequential Send
                </Button>
              ) : null}

              {/* Step trigger */}
              <Button
                variant="outline"
                size="md"
                isLoading={pendingAction === 'step'}
                loadingText="Sending Step..."
                icon={<ArrowRight size={16} />}
                onClick={handleExecuteStep}
                disabled={actionLoading || isCompleted || isCancelled}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                title="Manually dispatch one sequential recipient if interval allowed"
              >
                Send Next
              </Button>

              <Button
                variant="outline"
                size="md"
                icon={<Square size={16} />}
                onClick={() => setIsCancelModalOpen(true)}
                disabled={actionLoading || isCompleted || isCancelled}
                className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-400/30"
              >
                Cancel
              </Button>
            </div>
          </div>

          {/* Progress bar & live stats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                Dispatched {sent} of {total} total recipients ({progressPct}%)
              </span>
              <span className="text-[#C69A4C] font-mono font-semibold">
                {pending > 0 ? `ETA: ~${pending * 5}s remaining (5s interval)` : 'Batch Completed'}
              </span>
            </div>

            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  isNeedsReview ? 'bg-amber-400' :
                  isPaused ? 'bg-amber-400' :
                  isCompleted ? 'bg-emerald-400' :
                  'bg-gradient-to-r from-[#1456AD] via-[#C69A4C] to-emerald-400'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 pt-1">
              <span>Sent: <strong className="text-white">{sent}</strong></span>
              <span>Pending: <strong className="text-[#C69A4C]">{pending}</strong></span>
              <span>Failed / Bounces: <strong className="text-rose-400">{failed}</strong></span>
              {unknown > 0 && (
                <span className="text-amber-300 font-bold">Outcome Unknown: {unknown}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Card className="p-8 text-center text-[#64748B]">
          <Layers size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="font-semibold text-[#172E58]">No campaigns currently in the queue</p>
          <p className="text-xs text-slate-500 mt-1">Import a recipient list to prepare and launch a campaign.</p>
        </Card>
      )}
        </>
      )}

      {/* 5. In-Flight Spotlight & Sequential Execution Protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* In-Flight Recipient Spotlight (7 cols) */}
        <div className="lg:col-span-7 min-w-0 flex flex-col">
          <Card className="h-full flex flex-col border-2 border-[#1456AD]/30 bg-gradient-to-br from-white to-[#F8FAFC]">
            <CardHeader
              title="Sequential In-Flight Spotlight"
              subtitle="Current recipient actively claimed or staged for sequential transmission"
              action={
                <Badge 
                  variant={
                    syncStatus === 'failed' ? 'error' :
                    countdownSeconds > 0 ? 'warning' :
                    isRunning ? 'info' : 'neutral'
                  } 
                  dot
                >
                  {syncStatus === 'failed' ? 'Worker Offline' :
                   countdownSeconds > 0 ? `Rate Pause (${countdownSeconds}s)` :
                   isRunning ? 'Transmitting TLS' : 'Queue Idle'}
                </Badge>
              }
            />

            {currentInFlight ? (
              <div className="p-4 rounded-[10px] bg-white border border-[#CBD5E1] shadow-xs space-y-3 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Target Recipient
                    </span>
                    <h4 className="text-base font-bold text-[#172E58] truncate">
                      {currentInFlight.recipient_name}
                    </h4>
                    <p className="text-xs font-mono text-[#1456AD] break-all">
                      {currentInFlight.recipient_email}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Next Attempt In
                    </span>
                    <div className="text-lg font-mono font-bold text-[#C69A4C]">
                      {countdownSeconds > 0 ? `${countdownSeconds}s` : isRunning ? 'SENDING' : 'READY'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#CBD5E1] text-xs">
                  <div>
                    <span className="text-[#64748B] text-[11px] block">Sequential Position:</span>
                    <span className="font-medium text-[#1E293B]">
                      #{sent + 1} of {total}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] text-[11px] block">Attempt Count:</span>
                    <span className="font-medium text-[#1E293B]">
                      Attempt #{currentInFlight.attempt_count || 1}
                    </span>
                  </div>
                </div>

                {/* Protocol Pipeline Stages (Derived from Real Campaign & Worker State) */}
                <div className="pt-2">
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider block mb-1.5">
                    Dispatch Pipeline Stages
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className={`flex items-center gap-1 font-medium ${activeCampaign?.template_snapshot || activeCampaign?.template_id ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <CheckCircle2 size={13} /> 1. Template Snapshot
                    </span>
                    <span className={`flex items-center gap-1 font-medium ${worker?.policy?.smtp_tls_strict && worker?.healthy ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <CheckCircle2 size={13} /> 2. TLS Transport
                    </span>
                    <span className={`flex items-center gap-1.5 ${currentInFlight && worker?.healthy ? 'text-[#1456AD] font-semibold' : 'text-slate-400'}`}>
                      {currentInFlight && worker?.healthy ? (
                        <LoadingSpinner size="sm" label="SMTP handshake in progress" />
                      ) : (
                        <Send size={13} />
                      )}
                      3. SMTP Handshake
                    </span>
                    <span className={`flex items-center gap-1 ${countdownSeconds > 0 ? 'text-[#C69A4C] font-semibold' : 'text-slate-400'}`}>
                      <Clock size={13} /> 4. Interval Pacing
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-[10px] bg-white border border-[#CBD5E1] shadow-xs text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Layers size={20} />
                </div>
                <h4 className="text-sm font-semibold text-[#172E58]">No Active In-Flight Recipient</h4>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                  {nextPendingRecipient
                    ? `Next queued recipient: ${nextPendingRecipient.recipient_name} (${nextPendingRecipient.recipient_email}). Start the campaign when the queue worker is connected.`
                    : 'No recipient is currently claimed for SMTP dispatch.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 mt-2 border-t border-[#CBD5E1] text-xs text-left">
                  <div>
                    <span className="text-[#64748B] text-[11px] block">Sequential Position:</span>
                    <span className="font-medium text-[#1E293B]">—</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] text-[11px] block">Next Attempt:</span>
                    <span className="font-medium text-[#1E293B]">—</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Interval Policy Card (5 cols) */}
        <div className="lg:col-span-5 min-w-0 flex flex-col">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader
              title="Sequential Delivery Policy"
              subtitle="Verified worker & database throttle telemetry"
              action={<ShieldCheck size={18} className={syncStatus === 'synced' && worker?.healthy ? 'text-emerald-600' : 'text-slate-400'} />}
            />

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#172E58]">Configured Interval:</span>
                  <span className="font-bold text-[#1456AD] font-mono text-sm">
                    {syncStatus === 'synced' && worker?.policy?.mandatory_interval_seconds
                      ? `${worker.policy.mandatory_interval_seconds}.0 Seconds`
                      : 'Unverified'}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  Enforced via PostgreSQL (<code className="text-xs bg-slate-200 px-1 py-0.5 rounded">next_send_allowed_at</code>) when database and worker are connected.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#CBD5E1]">
                  <span className="text-[#64748B]">Effective Throughput Ceiling</span>
                  <span className="font-semibold text-[#172E58]">
                    {syncStatus === 'synced' && worker?.healthy && worker?.policy?.mandatory_interval_seconds
                      ? `${Math.floor(60 / worker.policy.mandatory_interval_seconds)} emails / min max`
                      : 'Paused / Unverified'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#CBD5E1]">
                  <span className="text-[#64748B]">Global Lock Fencing</span>
                  {syncStatus !== 'synced' ? (
                    <span className="font-semibold text-rose-600">Unverified</span>
                  ) : worker?.healthy ? (
                    <span className="font-semibold text-emerald-700">Lease Active (#{worker.lock_generation ?? '—'})</span>
                  ) : (
                    <span className="font-semibold text-amber-600">No Active Lease</span>
                  )}
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Concurrently Active Workers</span>
                  <span className="font-semibold text-[#1456AD]">
                    {syncStatus === 'synced' && worker
                      ? `${worker.active_workers_count ?? 0} Active (Limit: ${worker.policy?.concurrency_limit ?? 1})`
                      : '0 Verified'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 6. Sequential Queue Buffer Table */}
      <Card>
        <CardHeader
          title="Sequential Queue Buffer & Recipient Ledger"
          subtitle="Ordered FIFO recipient records with persisted delivery outcomes"
          action={
            <div className="flex items-center gap-2">
              {isLoadingRecipients && <SyncStatusPill label="Loading recipients..." />}
              <Badge variant="navy" size="sm">
                FIFO Sequence ({recipients.length})
              </Badge>
            </div>
          }
        />

        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold border-b border-[#CBD5E1] uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4 sm:px-5">Seq #</th>
                <th className="py-2.5 px-3">Recipient Name</th>
                <th className="py-2.5 px-3">Email Address</th>
                <th className="py-2.5 px-3">Attempts</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 sm:px-5 text-right">Action / Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CBD5E1]">
              {loading || isLoadingRecipients ? (
                <TableSkeleton rows={5} columns={6} asTableRows />
              ) : recipients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#64748B]">
                    No recipient records found for this campaign.
                  </td>
                </tr>
              ) : (
                recipients.map((item, idx) => (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-[#F8FAFC]/80 transition-colors ${item.status === 'sending' ? 'bg-[#EBF3FC]/60 font-medium' : ''}`}
                  >
                    <td className="py-3 px-5 font-mono text-[11px] text-[#64748B]">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#172E58]">
                      {item.recipient_name}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[#1E293B]">
                      {item.recipient_email}
                    </td>
                    <td className="py-3 px-3 text-[#64748B] font-mono">
                      {item.attempt_count}
                    </td>
                    <td className="py-3 px-3">
                      {item.status === 'sent' && (
                        <Badge variant="success" size="sm" dot>Accepted by SMTP</Badge>
                      )}
                      {item.status === 'sending' && (
                        <Badge variant="info" size="sm" dot>Transmitting</Badge>
                      )}
                      {item.status === 'pending' && (
                        <Badge variant="neutral" size="sm" dot>Pending</Badge>
                      )}
                      {item.status === 'failed' && (
                        <Badge variant="error" size="sm" dot>Failed / 550</Badge>
                      )}
                      {item.status === 'outcome_unknown' && (
                        <Badge variant="warning" size="sm" dot>Outcome Unknown</Badge>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right text-xs">
                      {item.status === 'outcome_unknown' ? (
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={() => setResolvingRecipient(item)}
                          className="text-[11px] font-bold"
                        >
                          Resolve
                        </Button>
                      ) : item.sent_at ? (
                        <span className="text-[#64748B] text-[11px]">
                          {new Date(item.sent_at).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Pending</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 7. Persistent Queue Audit Trail */}
      {events.length > 0 && (
        <Card>
          <CardHeader
            title="Persistent Queue Audit Trail"
            subtitle="Immutable event logs recorded in queue_events"
            action={<History size={16} className="text-[#1456AD]" />}
          />

          <div className="space-y-2 text-xs">
            {events.slice(0, 8).map((evt) => (
              <div key={evt.id} className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-[#64748B] whitespace-nowrap">
                    {new Date(evt.created_at).toLocaleTimeString()}
                  </span>
                  <Badge variant="navy" size="sm">{evt.event_type}</Badge>
                  <span className="text-[#1E293B] font-medium truncate">
                    {evt.event_details?.campaign_name || evt.event_details?.recipient_email || 'Event logged'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#64748B] whitespace-nowrap">
                  Worker: {evt.worker_id || 'system'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal: Outcome Unknown Resolution */}
      <Modal
        isOpen={!!resolvingRecipient}
        onClose={() => !actionLoading && setResolvingRecipient(null)}
        title="Resolve Uncertain Delivery Outcome"
        subtitle="Manual administrative resolution for socket timeout / connection drop"
        maxWidth="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
            <Button variant="outline" size="md" disabled={actionLoading} onClick={() => setResolvingRecipient(null)}>
              Cancel
            </Button>
            <Button 
              variant="gold" 
              size="md" 
              isLoading={pendingAction === 'resolve'}
              loadingText="Resolving..."
              onClick={handleResolveOutcome}
              disabled={actionLoading}
              className="font-bold"
            >
              Confirm Resolution
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-[#1E293B]">
          {resolvingRecipient && (
            <>
              <div className="p-3 bg-slate-50 border border-[#CBD5E1] rounded-lg space-y-1">
                <p><strong>Recipient:</strong> {resolvingRecipient.recipient_name} ({resolvingRecipient.recipient_email})</p>
                <p className="text-slate-600"><strong>Reported Reason:</strong> {resolvingRecipient.failure_reason || 'Connection lost during SMTP transmission.'}</p>
              </div>

              <div className="space-y-2">
                <label className="font-semibold block text-[#172E58]">Administrative Determination:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setResolutionChoice('sent')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      resolutionChoice === 'sent'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                        : 'border-[#CBD5E1] hover:bg-slate-50'
                    }`}
                  >
                    Mark as Sent (Delivered)
                    <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                      Confirmed in Gmail logs. Do not resend.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolutionChoice('failed')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      resolutionChoice === 'failed'
                        ? 'border-rose-600 bg-rose-50 text-rose-950 font-bold'
                        : 'border-[#CBD5E1] hover:bg-slate-50'
                    }`}
                  >
                    Mark as Failed (Bounced)
                    <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                      Did not reach SMTP. Safe to retry.
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block text-[#172E58]">Audit Notes / Reference:</label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Verified in Gmail outbound sent items. Delivery confirmed."
                  className="w-full h-20 p-2.5 border border-[#CBD5E1] rounded-lg text-xs focus:ring-1 focus:ring-[#1456AD]"
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Confirmation Modal for Aborting Campaign */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => !actionLoading && setIsCancelModalOpen(false)}
        title="Confirm Campaign Cancellation"
        subtitle="This action will permanently halt pending dispatches for this campaign"
        maxWidth="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
            <Button variant="outline" size="md" disabled={actionLoading} onClick={() => setIsCancelModalOpen(false)}>
              Keep Sending
            </Button>
            <Button 
              variant="danger" 
              size="md" 
              isLoading={pendingAction === 'cancel'}
              loadingText="Cancelling..."
              onClick={handleCancel}
              disabled={actionLoading}
            >
              Cancel Campaign
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-[#1E293B]">
          <p>
            Are you sure you want to cancel the active campaign <strong>"{activeCampaign?.campaign_name}"</strong>?
          </p>
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
            <p className="font-semibold">{activeCampaign?.sent_count} emails have already been accepted by SMTP.</p>
            <p>The remaining {activeCampaign?.pending_count} recipients will be marked as cancelled in PostgreSQL.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
