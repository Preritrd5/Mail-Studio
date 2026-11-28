import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  NavigationSection,
  EmailTemplateItem,
  EmailActivityItem,
  CampaignSummary,
  QueueState,
  ToastNotification,
  DateRange,
  RecipientRecord,
} from '../types';
import { StorageService } from '../services/storageService';
import { TemplateService, STANDARD_PLACEHOLDERS } from '../services/templateService';
import { queueService, QueueCampaign, QueueStepResult, WorkerHealth } from '../services/queueService';
import { useAuth } from './AuthContext';

export interface DataLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'empty' | 'auth_required' | 'error';
  error?: string;
  statusCode?: number;
  errorCode?: string;
}

const EMPTY_QUEUE_STATE: QueueState = {
  campaignName: '',
  totalRecipients: 0,
  sentCount: 0,
  pendingCount: 0,
  failedCount: 0,
  currentRecipientIndex: 0,
  status: 'idle',
  startTimestamp: '',
  countdown: 0,
  rateLimit: 0.2,
  items: [],
};

const EMPTY_ANALYTICS = {
  totalSent: 0,
  totalPending: 0,
  totalFailed: 0,
  totalAll: 0,
  successRate: '0.0',
  failureRate: '0.0',
  chartData: [] as { day: string; sent: number; pending: number; failed: number }[],
};

interface AppContextType {
  // Navigation
  activeSection: NavigationSection;
  navigateTo: (section: NavigationSection) => void;
  isMobileMenuOpen: boolean;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapse: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Toasts
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id'>) => void;
  removeToast: (id: string) => void;

  // Date Filter
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;

  // Templates
  templates: EmailTemplateItem[];
  isLoadingTemplates: boolean;
  templateLoadState: DataLoadState;
  refreshTemplates: () => Promise<void>;
  addTemplate: (template: {
    name: string;
    category: EmailTemplateItem['category'];
    subject: string;
    contentPreview?: string;
    author?: string;
    variables?: string[];
    html_content?: string;
    text_content?: string;
    description?: string;
  }) => Promise<void>;
  updateTemplate: (id: string, updates: Partial<EmailTemplateItem> & { change_summary?: string }) => Promise<void>;
  deleteTemplate: (id: string) => Promise<{ success: boolean; error?: string }>;
  archiveTemplate: (id: string) => Promise<void>;
  restoreTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<void>;
  selectedComposeTemplateId: string | null;
  setSelectedComposeTemplateId: (id: string | null) => void;
  selectedComposeTemplateVersion: number | null;
  setSelectedComposeTemplateVersion: (version: number | null) => void;
  useTemplateInCompose: (templateId: string, version?: number | null) => void;

  // Legacy empty placeholders preserved for compatibility (real views query backend directly)
  activityLogs: EmailActivityItem[];
  retryActivityLog: (id: string) => void;
  campaigns: CampaignSummary[];

  // Real Queue Summary & Automatic 5-Second Dispatcher (works across all tabs & Vercel Serverless)
  queueState: QueueState;
  queueSyncVersion: number;
  isAutoDispatching: boolean;
  isQueueStepInFlight: boolean;
  autoCountdownSeconds: number;
  lastQueueStepResult: QueueStepResult | null;
  refreshQueueBadge: () => Promise<void>;
  triggerImmediateQueueStep: () => Promise<QueueStepResult | null>;
  startQueue: () => void;
  pauseQueue: () => void;
  resumeQueue: () => void;
  cancelQueue: () => void;
  setRateLimit: (limit: number) => void;
  pushToQueue: (campaignName: string, recipients: RecipientRecord[], templateId?: string) => void;

  // Analytics fallback removed (views use reportsService directly)
  analytics: typeof EMPTY_ANALYTICS;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuth();

  // Purge any legacy client-side demo records stored by earlier versions
  useEffect(() => {
    StorageService.clearLegacyDemoStorage();
  }, []);

  // Navigation state
  const [activeSection, setActiveSection] = useState<NavigationSection>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    StorageService.getSidebarCollapsed()
  );

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      StorageService.saveSidebarCollapsed(next);
      return next;
    });
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    StorageService.saveSidebarCollapsed(collapsed);
  }, []);

  // Toasts state
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Date filter
  const [dateRange, setDateRange] = useState<DateRange>('7d');

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [templateLoadState, setTemplateLoadState] = useState<DataLoadState>({ status: 'idle' });
  const [selectedComposeTemplateId, setSelectedComposeTemplateId] = useState<string | null>(null);
  const [selectedComposeTemplateVersion, setSelectedComposeTemplateVersion] = useState<number | null>(null);

  // Queue state derived only from live backend telemetry
  const [queueState, setQueueState] = useState<QueueState>(EMPTY_QUEUE_STATE);
  const [queueWorker, setQueueWorker] = useState<WorkerHealth | null>(null);
  const [queueCampaigns, setQueueCampaigns] = useState<QueueCampaign[]>([]);
  const [queueSyncVersion, setQueueSyncVersion] = useState<number>(0);
  const [isQueueStepInFlight, setIsQueueStepInFlight] = useState<boolean>(false);
  const [autoCountdownSeconds, setAutoCountdownSeconds] = useState<number>(0);
  const [lastQueueStepResult, setLastQueueStepResult] = useState<QueueStepResult | null>(null);
  const [autoRetryNonce, setAutoRetryNonce] = useState<number>(0);

  const isStepInFlightRef = useRef<boolean>(false);
  const serverClockOffsetMsRef = useRef<number>(0);
  const hadActiveBulkRef = useRef<boolean>(false);
  const isAppMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isAppMountedRef.current = true;
    return () => {
      isAppMountedRef.current = false;
    };
  }, []);

  // Toast helpers
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastNotification, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastNotification = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 4500);
    },
    [removeToast]
  );

  const userId = user?.id ?? null;

  // Fetch templates from real backend API only
  const refreshTemplates = useCallback(async () => {
    if (!userId) {
      setTemplates([]);
      setTemplateLoadState({
        status: 'auth_required',
        error: 'Administrator sign-in is required to load email templates.',
        statusCode: 401,
        errorCode: 'AUTH_REQUIRED',
      });
      return;
    }

    setIsLoadingTemplates(true);
    setTemplateLoadState({ status: 'loading' });

    const res = await TemplateService.listTemplates({ status: 'all' });

    if (res.success) {
      setTemplates(res.templates);
      setTemplateLoadState({
        status: res.templates.length > 0 ? 'loaded' : 'empty',
      });
    } else {
      setTemplates([]);
      const isAuth =
        res.statusCode === 401 ||
        res.statusCode === 403 ||
        res.errorCode === 'AUTH_REQUIRED' ||
        res.errorCode === 'UNAUTHORIZED' ||
        res.errorCode === 'FORBIDDEN';
      setTemplateLoadState({
        status: isAuth ? 'auth_required' : 'error',
        error: res.error || 'Failed to load templates from backend.',
        statusCode: res.statusCode,
        errorCode: res.errorCode,
      });
    }

    setIsLoadingTemplates(false);
  }, [userId]);

  // Refresh sidebar pending count & auto-dispatcher state from live /api/queue when authenticated
  const refreshQueueBadge = useCallback(async () => {
    if (!userId) {
      setQueueState(EMPTY_QUEUE_STATE);
      setQueueWorker(null);
      setQueueCampaigns([]);
      hadActiveBulkRef.current = false;
      return;
    }

    try {
      const status = await queueService.getStatus();
      if (!isAppMountedRef.current) return;

      if (status.server_timestamp) {
        const parsedServer = Date.parse(status.server_timestamp);
        if (!Number.isNaN(parsedServer)) {
          serverClockOffsetMsRef.current = parsedServer - Date.now();
        }
      }

      const activeCampaigns = status.active_campaigns || [];
      setQueueWorker(status.worker || null);
      setQueueCampaigns(activeCampaigns);

      const pendingCount = activeCampaigns.reduce(
        (acc, c) => acc + (c.pending_count || 0),
        0
      );
      const sentCount = activeCampaigns.reduce(
        (acc, c) => acc + (c.sent_count || 0),
        0
      );
      const failedCount = activeCampaigns.reduce(
        (acc, c) => acc + (c.failed_count || 0),
        0
      );
      const totalRecipients = activeCampaigns.reduce(
        (acc, c) => acc + (c.total_recipients || 0),
        0
      );
      const primary = activeCampaigns[0];
      const hasRunningOrQueued = activeCampaigns.some(
        (c) => (c.status === 'queued' || c.status === 'running') && (c.pending_count || 0) > 0
      );

      // Announce batch completion automatically when an active auto-dispatched queue reaches 0 pending
      if (hadActiveBulkRef.current && !hasRunningOrQueued) {
        const completedBatch = activeCampaigns.find((c) => c.status === 'completed' && c.total_recipients > 0);
        const needsReviewBatch = activeCampaigns.find((c) => c.status === 'needs_review');
        if (needsReviewBatch) {
          addToast({
            type: 'warning',
            title: 'Queue Paused for Outcome Audit',
            message: `"${needsReviewBatch.campaign_name}" encountered an uncertain SMTP response and paused for administrator review.`,
          });
        } else if (completedBatch && pendingCount === 0) {
          addToast({
            type: 'success',
            title: 'Campaign Completed',
            message: `All queued recipients in "${completedBatch.campaign_name}" have been dispatched automatically.`,
          });
        }
      }
      hadActiveBulkRef.current = hasRunningOrQueued;

      setQueueState({
        campaignName: primary?.campaign_name || '',
        totalRecipients,
        sentCount,
        pendingCount,
        failedCount,
        currentRecipientIndex: 0,
        status:
          hasRunningOrQueued || status.worker?.worker_status === 'active' || status.worker?.worker_status === 'waiting_interval'
            ? 'running'
            : status.worker?.worker_status === 'paused'
            ? 'paused'
            : 'idle',
        startTimestamp: primary?.started_at || '',
        countdown: 0,
        rateLimit: 0.2,
        items: [],
      });
      setQueueSyncVersion((v) => v + 1);
    } catch {
      if (!isAppMountedRef.current) return;
      setQueueState(EMPTY_QUEUE_STATE);
    }
  }, [userId, addToast]);

  const executeAutoQueueStep = useCallback(async (): Promise<QueueStepResult | null> => {
    if (!userId || isStepInFlightRef.current) return null;
    isStepInFlightRef.current = true;
    setIsQueueStepInFlight(true);

    try {
      const stepRes = await queueService.executeStep();
      if (!isAppMountedRef.current) return stepRes;

      if (stepRes.server_timestamp) {
        const parsedServer = Date.parse(stepRes.server_timestamp);
        if (!Number.isNaN(parsedServer)) {
          serverClockOffsetMsRef.current = parsedServer - Date.now();
        }
      }

      setLastQueueStepResult(stepRes);
      if (stepRes.worker) {
        setQueueWorker(stepRes.worker);
      }

      await refreshQueueBadge();
      return stepRes;
    } catch (err: any) {
      if (!isAppMountedRef.current) return null;
      const status = err?.statusCode || err?.status;
      if (status !== 401 && status !== 403) {
        // Schedule clean retry without silently aborting a 100-email batch on transient network/cold-start hiccups
        setAutoRetryNonce((n) => n + 1);
      }
      return null;
    } finally {
      isStepInFlightRef.current = false;
      if (isAppMountedRef.current) {
        setIsQueueStepInFlight(false);
      }
    }
  }, [userId, refreshQueueBadge]);

  const hasActiveQueuedWork = queueCampaigns.some(
    (c) => (c.status === 'queued' || c.status === 'running') && (c.pending_count || 0) > 0
  );
  const isDedicatedWorkerRunning =
    queueWorker?.dispatch_mode === 'dedicated_worker' &&
    Boolean(queueWorker?.healthy) &&
    (queueWorker?.seconds_since_heartbeat ?? 999) <= 12;
  const isAutoDispatching = Boolean(userId && hasActiveQueuedWork);

  // Live 5-second interval countdown ticker (available to all views)
  useEffect(() => {
    if (!queueWorker?.next_send_allowed_at) {
      setAutoCountdownSeconds(0);
      return;
    }
    const updateCountdown = () => {
      const allowedMs = Date.parse(queueWorker.next_send_allowed_at!);
      const estimatedServerNow = Date.now() + serverClockOffsetMsRef.current;
      const diffMs = allowedMs - estimatedServerNow;
      setAutoCountdownSeconds(Math.max(0, Math.ceil(diffMs / 1000)));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 500);
    return () => window.clearInterval(timer);
  }, [queueWorker?.next_send_allowed_at]);

  // Automatic 5-second sequential dispatcher across all app sections (Vercel Serverless + Local API)
  useEffect(() => {
    if (!userId || !hasActiveQueuedWork) return;

    // If a standalone local CLI worker is freshly driving the queue, only sync status periodically
    if (isDedicatedWorkerRunning) {
      const pollId = window.setTimeout(() => {
        void refreshQueueBadge();
      }, 2500);
      return () => window.clearTimeout(pollId);
    }

    let waitMs = 120;
    if (lastQueueStepResult?.status === 'waiting_interval' || lastQueueStepResult?.status === 'in_progress') {
      waitMs = Math.max(300, (lastQueueStepResult.remainingMs || 1000) + 150);
    } else if (queueWorker?.next_send_allowed_at) {
      const allowedMs = Date.parse(queueWorker.next_send_allowed_at);
      const estimatedServerNow = Date.now() + serverClockOffsetMsRef.current;
      waitMs = Math.max(80, allowedMs - estimatedServerNow + 150);
    }

    const timerId = window.setTimeout(() => {
      void executeAutoQueueStep();
    }, Math.min(waitMs, 6500));

    return () => window.clearTimeout(timerId);
  }, [
    userId,
    hasActiveQueuedWork,
    isDedicatedWorkerRunning,
    queueWorker?.next_send_allowed_at,
    queueSyncVersion,
    autoRetryNonce,
    lastQueueStepResult?.status,
    lastQueueStepResult?.remainingMs,
    executeAutoQueueStep,
    refreshQueueBadge,
  ]);

  useEffect(() => {
    if (isAuthLoading) return;
    refreshTemplates();
    refreshQueueBadge();
  }, [isAuthLoading, refreshTemplates, refreshQueueBadge]);

  // Navigation handlers
  const navigateTo = useCallback((section: NavigationSection) => {
    setActiveSection(section);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen((prev) => !prev), []);
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  // Keyboard shortcut Ctrl/Cmd + B to toggle desktop sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        toggleSidebarCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebarCollapse]);

  const useTemplateInCompose = useCallback((templateId: string, version?: number | null) => {
    setSelectedComposeTemplateId(templateId);
    setSelectedComposeTemplateVersion(version ?? null);
    setActiveSection('compose');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Template mutations (strict backend API only)
  const addTemplate = useCallback(
    async (newTpl: {
      name: string;
      category: EmailTemplateItem['category'];
      subject: string;
      contentPreview?: string;
      author?: string;
      variables?: string[];
      html_content?: string;
      text_content?: string;
      description?: string;
    }) => {
      const htmlContent =
        newTpl.html_content ||
        `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${(newTpl.contentPreview || '').replace(/\n/g, '<br/>')}</div>`;
      const textContent = newTpl.text_content || newTpl.contentPreview || '';

      const res = await TemplateService.createTemplate({
        name: newTpl.name,
        category: newTpl.category,
        subject: newTpl.subject,
        description: newTpl.description || '',
        html_content: htmlContent,
        text_content: textContent,
      });

      if (res.success && res.template) {
        setTemplates((prev) => [res.template!, ...prev]);
        setTemplateLoadState({ status: 'loaded' });
        addToast({
          type: 'success',
          title: 'Template Created & Persisted',
          message: `"${res.template.name}" (v1) saved to the database.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Failed to Save Template',
          message: res.error || 'Could not save template to database.',
        });
        throw new Error(res.error || 'Failed to save template.');
      }
    },
    [addToast]
  );

  const updateTemplate = useCallback(
    async (id: string, updates: Partial<EmailTemplateItem> & { change_summary?: string }) => {
      const res = await TemplateService.updateTemplate(id, {
        name: updates.name,
        category: updates.category,
        description: updates.description,
        subject: updates.subject,
        html_content: updates.html_content,
        text_content: updates.text_content || updates.contentPreview,
        change_summary: updates.change_summary,
      });

      if (res.success && res.template) {
        setTemplates((prev) => prev.map((t) => (t.id === id ? res.template! : t)));
        addToast({
          type: 'success',
          title: `Updated to Version ${res.template.version || 2}`,
          message: `Template "${res.template.name}" updated and previous revision archived.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Failed to Update Template',
          message: res.error || 'Could not update template.',
        });
        throw new Error(res.error || 'Failed to update template.');
      }
    },
    [addToast]
  );

  const archiveTemplate = useCallback(
    async (id: string) => {
      const target = templates.find((t) => t.id === id);
      const res = await TemplateService.archiveTemplate(id);
      if (res.success) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, is_active: false, archived_at: new Date().toISOString() } : t
          )
        );
        addToast({
          type: 'info',
          title: 'Template Archived',
          message: target ? `"${target.name}" archived.` : 'Template archived.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Archive Failed',
          message: res.error || 'Failed to archive template.',
        });
      }
    },
    [templates, addToast]
  );

  const restoreTemplate = useCallback(
    async (id: string) => {
      const res = await TemplateService.restoreTemplate(id);
      if (res.success && res.template) {
        setTemplates((prev) => prev.map((t) => (t.id === id ? res.template! : t)));
        addToast({
          type: 'success',
          title: 'Template Restored',
          message: `"${res.template.name}" restored to active gallery.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Restore Failed',
          message: res.error || 'Failed to restore template.',
        });
      }
    },
    [addToast]
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<{ success: boolean; error?: string }> => {
      const target = templates.find((t) => t.id === id);
      const res = await TemplateService.deleteTemplatePermanently(id);
      if (res.success) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        addToast({
          type: 'success',
          title: 'Template Permanently Deleted',
          message: target
            ? `"${target.name}" was permanently deleted. Historical campaign snapshots remain preserved.`
            : 'Template permanently deleted.',
        });
        void refreshTemplates();
        return { success: true };
      } else {
        const message = res.error || 'Failed to permanently delete template.';
        addToast({
          type: 'error',
          title: res.statusCode === 409 ? 'Deletion Blocked (Safety Check)' : 'Permanent Delete Failed',
          message,
        });
        if (res.statusCode === 404) {
          setTemplates((prev) => prev.filter((t) => t.id !== id));
          void refreshTemplates();
        }
        return { success: false, error: message };
      }
    },
    [templates, addToast, refreshTemplates]
  );

  const duplicateTemplate = useCallback(
    async (id: string) => {
      const res = await TemplateService.duplicateTemplate(id);
      if (res.success && res.template) {
        setTemplates((prev) => [res.template!, ...prev]);
        addToast({
          type: 'success',
          title: 'Template Duplicated',
          message: `Created "${res.template.name}" (v1).`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Duplication Failed',
          message: res.error || 'Failed to duplicate template.',
        });
      }
    },
    [addToast]
  );

  // Deprecated client-only actions replaced with honest warnings
  const notifyUseBackendQueue = useCallback(() => {
    addToast({
      type: 'warning',
      title: 'Backend Queue Required',
      message: 'Queue operations are executed exclusively via Sending Queue backend controls.',
    });
  }, [addToast]);

  return (
    <AppContext.Provider
      value={{
        activeSection,
        navigateTo,
        isMobileMenuOpen,
        toggleMobileMenu,
        closeMobileMenu,
        isSidebarCollapsed,
        toggleSidebarCollapse,
        setSidebarCollapsed,
        toasts,
        addToast,
        removeToast,
        dateRange,
        setDateRange,
        templates,
        isLoadingTemplates,
        templateLoadState,
        refreshTemplates,
        addTemplate,
        updateTemplate,
        deleteTemplate,
        archiveTemplate,
        restoreTemplate,
        duplicateTemplate,
        selectedComposeTemplateId,
        setSelectedComposeTemplateId,
        selectedComposeTemplateVersion,
        setSelectedComposeTemplateVersion,
        useTemplateInCompose,
        activityLogs: [],
        retryActivityLog: () => {
          addToast({
            type: 'info',
            title: 'Retry in Email Activity',
            message: 'Use the Email Activity view to retry failed deliveries via the backend.',
          });
        },
        campaigns: [],
        queueState,
        queueSyncVersion,
        isAutoDispatching,
        isQueueStepInFlight,
        autoCountdownSeconds,
        lastQueueStepResult,
        refreshQueueBadge,
        triggerImmediateQueueStep: executeAutoQueueStep,
        startQueue: notifyUseBackendQueue,
        pauseQueue: notifyUseBackendQueue,
        resumeQueue: notifyUseBackendQueue,
        cancelQueue: notifyUseBackendQueue,
        setRateLimit: () => {},
        pushToQueue: notifyUseBackendQueue,
        analytics: EMPTY_ANALYTICS,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
};
