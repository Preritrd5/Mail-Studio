import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Download, 
  ArrowRight, 
  ArrowLeft,
  Filter, 
  Search, 
  Trash2, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  Info,
  ShieldCheck,
  AlertTriangle,
  Layers,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Database
} from 'lucide-react';
import { Card, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { StateNotice } from '../components/common/StateNotice';
import { TableSkeleton, ProgressIndicator, SyncStatusPill } from '../components/common/Loading';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ExportService } from '../services/exportService';
import { ImportService } from '../services/importService';
import { 
  ImportBatchRecord, 
  ImportBatchRowRecord, 
  ImportValidationStatus 
} from '../types';

const STORAGE_ACTIVE_BATCH_KEY = 'snpsunexus_active_import_batch_id';

const BULK_IMPORT_SUPPORTED_KEYS = new Set([
  'recipient_name',
  'recipient_email',
  'institution_name',
  'current_year',
  'campaign_name',
  'organization_name',
  'brand_name',
  'system_date',
  'unsubscribe_link',
]);

function extractUnavailableTemplatePlaceholders(template: {
  subject?: string;
  html_content?: string;
  text_content?: string;
  variables?: string[];
} | null): string[] {
  if (!template) return [];
  const textPool = [
    template.subject || '',
    template.html_content || '',
    template.text_content || '',
  ].join('\n');

  const foundTokens = new Set<string>();
  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(textPool)) !== null) {
    foundTokens.add(`{{${match[1]}}}`);
  }
  if (Array.isArray(template.variables)) {
    template.variables.forEach((v) => {
      if (v) foundTokens.add(v.startsWith('{{') ? v : `{{${v}}}`);
    });
  }

  return Array.from(foundTokens).filter((token) => {
    const key = token.replace(/^\{\{|\}\}$/g, '').trim().toLowerCase();
    return !BULK_IMPORT_SUPPORTED_KEYS.has(key);
  });
}

export const BulkImportView: React.FC = () => {
  const { templates, templateLoadState, refreshTemplates, navigateTo, addToast } = useApp();
  const { user, isLoading: isAuthLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active step (1 to 6)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // File & Batch state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing'>('uploading');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [activeBatch, setActiveBatch] = useState<ImportBatchRecord | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  // Step 2: Mapping Configuration State
  const [mappingState, setMappingState] = useState<{
    worksheetName: string;
    headerRow: number;
    emailColumn: string;
    nameColumn: string;
  }>({
    worksheetName: '',
    headerRow: 1,
    emailColumn: '',
    nameColumn: '',
  });
  const [isUpdatingMapping, setIsUpdatingMapping] = useState<boolean>(false);

  // Step 4: Staging Rows Table State
  const [stagedRows, setStagedRows] = useState<ImportBatchRowRecord[]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState<boolean>(false);
  const [rowsPagination, setRowsPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    pages: number;
  }>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [statusFilter, setStatusFilter] = useState<'all' | ImportValidationStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isUpdatingSelection, setIsUpdatingSelection] = useState<boolean>(false);

  // Step 5: Campaign Staging Configuration
  const [campaignTitle, setCampaignTitle] = useState<string>('Recipient Notification Campaign');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Step 6: Confirmation & Commit
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [committedResult, setCommittedResult] = useState<{
    campaign_id: string;
    recipients_count: number;
    idempotent_replay: boolean;
  } | null>(null);

  // Active templates (excluding archived)
  const activeTemplates = useMemo(() => {
    return templates.filter((t) => t.is_active !== false && !t.archived_at);
  }, [templates]);

  // Set or synchronize selected template if none or previously selected template was deleted
  useEffect(() => {
    const stillExists = activeTemplates.some((t) => t.id === selectedTemplateId);
    if ((!selectedTemplateId || !stillExists) && activeTemplates.length > 0) {
      setSelectedTemplateId(activeTemplates[0].id);
    } else if (selectedTemplateId && activeTemplates.length === 0) {
      setSelectedTemplateId('');
    }
  }, [activeTemplates, selectedTemplateId]);

  // Selected template object
  const selectedTemplate = useMemo(() => {
    return activeTemplates.find((t) => t.id === selectedTemplateId) || null;
  }, [activeTemplates, selectedTemplateId]);

  // Detect placeholders in selected template that are not supplied by the 2-column import schema
  const unavailableTemplatePlaceholders = useMemo(() => {
    return extractUnavailableTemplatePlaceholders(selectedTemplate);
  }, [selectedTemplate]);

  // Extra columns detected beyond mapped Name & Email columns
  const liveIgnoredColumns = useMemo(() => {
    const headers = activeBatch?.headers || [];
    if (headers.length === 0) {
      return activeBatch?.ignored_columns || [];
    }
    const mapped = new Set([mappingState.emailColumn, mappingState.nameColumn].filter(Boolean));
    return headers.filter((h) => h && !mapped.has(h));
  }, [activeBatch?.headers, activeBatch?.ignored_columns, mappingState.emailColumn, mappingState.nameColumn]);

  // Check and restore active import batch on mount only when authenticated
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      localStorage.removeItem(STORAGE_ACTIVE_BATCH_KEY);
      setActiveBatch(null);
      setCurrentStep(1);
      return;
    }

    const savedBatchId = localStorage.getItem(STORAGE_ACTIVE_BATCH_KEY);
    if (savedBatchId) {
      ImportService.getBatch(savedBatchId).then((res) => {
        if (res.success && res.batch && res.batch.status !== 'Committed' && res.batch.status !== 'Cancelled') {
          setActiveBatch(res.batch);
          setMappingState({
            worksheetName: res.batch.worksheet_name || '',
            headerRow: res.batch.header_row || 1,
            emailColumn: res.batch.mapping_config?.emailColumn || '',
            nameColumn: res.batch.mapping_config?.nameColumn || '',
          });
          setCurrentStep(3); // Resume at validation summary
        } else {
          localStorage.removeItem(STORAGE_ACTIVE_BATCH_KEY);
        }
      });
    }
  }, [isAuthLoading, user?.id]);

  // Fetch staging rows when activeBatch, pagination, filter, or search changes
  const fetchStagedRows = async (page = 1, status = statusFilter, search = searchQuery) => {
    if (!activeBatch?.id) return;
    setIsLoadingRows(true);
    try {
      const res = await ImportService.getBatchRows(activeBatch.id, {
        page,
        limit: rowsPagination.limit,
        status,
        search,
      });

      if (res.success) {
        setStagedRows(res.rows);
        setRowsPagination(res.pagination);
      }
    } catch (err: any) {
      console.warn('Error fetching staged rows:', err.message);
    } finally {
      setIsLoadingRows(false);
    }
  };

  useEffect(() => {
    if (activeBatch?.id && (currentStep === 4 || currentStep === 3)) {
      fetchStagedRows(rowsPagination.page, statusFilter, searchQuery);
    }
  }, [activeBatch?.id, currentStep, rowsPagination.page, statusFilter]);

  // Step 1: Handle File Selection & Upload
  const handleFileChosen = (file: File) => {
    setUploadError(null);
    setSelectedFile(file);
  };

  const handleStartUpload = async () => {
    if (!selectedFile || isUploading) return;

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    setIsUploading(true);
    setUploadProgress(5);
    setUploadPhase('uploading');
    setUploadError(null);

    try {
      const res = await ImportService.uploadFile(selectedFile, {
        signal: controller.signal,
        onProgress: (pct, phase) => {
          setUploadProgress(pct);
          setUploadPhase(phase);
        },
      });

      if (res.success && res.batch) {
        setUploadProgress(100);
        setActiveBatch(res.batch);
        localStorage.setItem(STORAGE_ACTIVE_BATCH_KEY, res.batch.id);

        setMappingState({
          worksheetName: res.batch.worksheet_name || '',
          headerRow: res.batch.header_row || 1,
          emailColumn: res.batch.mapping_config?.emailColumn || '',
          nameColumn: res.batch.mapping_config?.nameColumn || '',
        });

        addToast({
          type: 'success',
          title: 'Spreadsheet Uploaded & Parsed',
          message: `Parsed ${res.batch.total_rows} records. Name: "${res.batch.mapping_config?.nameColumn || 'Select'}", Email: "${res.batch.mapping_config?.emailColumn || 'Select'}".`,
        });

        if (res.batch.ignored_columns && res.batch.ignored_columns.length > 0) {
          addToast({
            type: 'warning',
            title: 'Unsupported Columns Ignored',
            message: `Ignored extra columns (${res.batch.ignored_columns.join(', ')}). Only Full Name and Email Address are imported.`,
          });
        }

        // Advance to Step 2 (Configuration & Mapping)
        setCurrentStep(2);
      } else if (res.errorCode !== 'ABORTED') {
        setUploadError(res.error || 'File upload failed. Ensure the spreadsheet is valid.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setUploadError(err.message || 'An unexpected error occurred during upload.');
      }
    } finally {
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
      }
      setIsUploading(false);
    }
  };

  // Step 2: Update Mapping
  const handleApplyMapping = async () => {
    if (!activeBatch?.id) return;
    if (!mappingState.nameColumn) {
      addToast({
        type: 'error',
        title: 'Full Name Column Required',
        message: 'You must map a Full Name column before proceeding.',
      });
      return;
    }
    if (!mappingState.emailColumn) {
      addToast({
        type: 'error',
        title: 'Email Column Required',
        message: 'You must map an Email Address column before proceeding.',
      });
      return;
    }
    if (mappingState.emailColumn === mappingState.nameColumn) {
      addToast({
        type: 'error',
        title: 'Duplicate Column Selection',
        message: 'Full Name and Email Address must be mapped to different columns.',
      });
      return;
    }

    setIsUpdatingMapping(true);
    try {
      const res = await ImportService.updateMapping(activeBatch.id, {
        emailColumn: mappingState.emailColumn,
        nameColumn: mappingState.nameColumn,
        headerRow: mappingState.headerRow,
        worksheetName: mappingState.worksheetName,
      });

      if (res.success && res.batch) {
        setActiveBatch(res.batch);
        addToast({
          type: 'success',
          title: 'Mapping Applied',
          message: `Validated ${res.batch.total_rows} rows: ${res.batch.valid_count} valid, ${res.batch.duplicate_count} duplicates, ${res.batch.invalid_count} invalid.`,
        });
        setCurrentStep(3); // Advance to Step 3 (Summary)
      } else {
        addToast({
          type: 'error',
          title: 'Mapping Update Failed',
          message: res.error || 'Failed to re-validate mapping.',
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error',
        message: err.message,
      });
    } finally {
      setIsUpdatingMapping(false);
    }
  };

  // Step 4: Toggle Row Selection
  const handleToggleRowSelection = async (row: ImportBatchRowRecord) => {
    if (!activeBatch?.id) return;
    if (row.validation_status === 'invalid' || row.validation_status === 'duplicate') return;

    setIsUpdatingSelection(true);
    const newSelected = !row.is_selected;

    // Optimistic UI update
    setStagedRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_selected: newSelected } : r))
    );

    try {
      const res = await ImportService.updateSelection(activeBatch.id, {
        rowIds: [row.id],
        isSelected: newSelected,
      });

      if (res.success) {
        setActiveBatch((prev) => (prev ? { ...prev, selected_count: res.selectedCount } : prev));
      }
    } catch (err: any) {
      // Revert on failure
      fetchStagedRows(rowsPagination.page);
    } finally {
      setIsUpdatingSelection(false);
    }
  };

  // Toggle select all on current page
  const handleToggleSelectAllOnPage = async (selectAll: boolean) => {
    if (!activeBatch?.id) return;
    const eligibleRows = stagedRows.filter(
      (r) => r.validation_status === 'valid' || r.validation_status === 'warning'
    );
    if (eligibleRows.length === 0) return;

    setIsUpdatingSelection(true);
    const rowIds = eligibleRows.map((r) => r.id);

    setStagedRows((prev) =>
      prev.map((r) =>
        r.validation_status === 'valid' || r.validation_status === 'warning'
          ? { ...r, is_selected: selectAll }
          : r
      )
    );

    try {
      const res = await ImportService.updateSelection(activeBatch.id, {
        rowIds,
        isSelected: selectAll,
      });

      if (res.success) {
        setActiveBatch((prev) => (prev ? { ...prev, selected_count: res.selectedCount } : prev));
      }
    } finally {
      setIsUpdatingSelection(false);
    }
  };

  // Step 6: Commit Campaign Creation
  const handleConfirmCommit = async () => {
    if (!activeBatch?.id || !selectedTemplateId) return;

    setIsCommitting(true);
    const idempotencyKey = `snpsunexus_commit_${activeBatch.id}_${Date.now()}`;

    try {
      const res = await ImportService.commitImport(activeBatch.id, {
        campaignName: campaignTitle.trim(),
        templateId: selectedTemplateId,
        idempotencyKey,
      });

      if (res.success && res.campaign_id) {
        setCommittedResult(res);
        setActiveBatch((prev) =>
          prev
            ? {
                ...prev,
                status: 'Committed',
                committed_campaign_id: res.campaign_id,
              }
            : prev
        );
        localStorage.removeItem(STORAGE_ACTIVE_BATCH_KEY);
        setIsConfirmationModalOpen(false);
        addToast({
          type: 'success',
          title: 'Bulk Campaign Created Successfully',
          message: `Campaign "${campaignTitle}" initialized with ${res.recipients_count} pending recipients in Ready state.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Commit Failed',
          message: res.error || 'Failed to commit campaign.',
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Commit Error',
        message: err.message,
      });
    } finally {
      setIsCommitting(false);
    }
  };

  // Cancel / Reset Import
  const handleResetImport = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      if (activeBatch?.id && activeBatch.status !== 'Committed' && !committedResult) {
        await ImportService.cancelImport(activeBatch.id);
      }
      localStorage.removeItem(STORAGE_ACTIVE_BATCH_KEY);
      setActiveBatch(null);
      setSelectedFile(null);
      setStagedRows([]);
      setCommittedResult(null);
      setCurrentStep(1);
      addToast({
        type: 'info',
        title: 'Import Reset',
        message: 'Import workflow reset. Ready for new spreadsheet upload.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Download official clean two-column template (CSV, XLSX, or XLS)
  const handleDownloadTemplate = (format: 'csv' | 'xlsx' | 'xls') => {
    const filename = ExportService.downloadRecipientTemplate(format);
    addToast({
      type: 'success',
      title: `Template ${format.toUpperCase()} Downloaded`,
      message: `Downloaded clean two-column template (${filename}) with Full Name and Email Address.`,
    });
  };

  // Steps breadcrumb titles
  const stepsList = [
    { number: 1, title: 'Upload' },
    { number: 2, title: 'Configure Mapping' },
    { number: 3, title: 'Validation Summary' },
    { number: 4, title: 'Review Recipients' },
    { number: 5, title: 'Campaign Staging' },
  ];

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv, .xlsx, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileChosen(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* Top Header & Workflow Stepper Navigation */}
      <Card className="border-b-4 border-b-[#1456AD]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#172E58] flex items-center gap-2">
              <Database size={20} className="text-[#1456AD]" />
              Bulk Recipient Import & Campaign Preparation
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Secure recipient ingestion with RFC 5322 syntax validation, deduplication, and template snapshotting
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() => handleDownloadTemplate('csv')}
              className="text-xs"
            >
              Template CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() => handleDownloadTemplate('xlsx')}
              className="text-xs"
            >
              Template XLSX
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() => handleDownloadTemplate('xls')}
              className="text-xs"
            >
              Template XLS
            </Button>

            {activeBatch && !committedResult && (
              <Button
                variant="ghost"
                size="sm"
                isLoading={isResetting}
                loadingText="Cancelling..."
                icon={<RefreshCw size={13} />}
                onClick={handleResetImport}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                Reset Import
              </Button>
            )}
          </div>
        </div>

        {/* 5-Step Visual Progress Bar */}
        {!committedResult && (
          <div className="mt-6 pt-4 border-t border-[#CBD5E1]">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {stepsList.map((step) => {
                const isCompleted = currentStep > step.number;
                const isCurrent = currentStep === step.number;
                const isClickable = activeBatch !== null && step.number <= (activeBatch ? 5 : 1);

                return (
                  <button
                    key={step.number}
                    disabled={!isClickable}
                    onClick={() => isClickable && setCurrentStep(step.number)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                      isCurrent
                        ? 'border-[#1456AD] bg-[#EBF3FC] text-[#1456AD] shadow-xs'
                        : isCompleted
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                        : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B] opacity-70'
                    } ${isClickable ? 'cursor-pointer hover:border-[#1456AD]/50' : 'cursor-not-allowed'}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        isCurrent
                          ? 'bg-[#1456AD] text-white'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 size={14} /> : step.number}
                    </div>
                    <span className="text-xs font-semibold truncate">{step.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Committed Success View */}
      {committedResult && (
        <Card className="bg-white border-2 border-emerald-500 shadow-md p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} />
          </div>

          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-bold text-[#172E58]">Bulk Campaign Successfully Prepared</h3>
            <p className="text-xs text-[#64748B]">
              The recipient list has been validated and saved to campaigns.
            </p>
          </div>

          <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-4 rounded-xl max-w-lg mx-auto grid grid-cols-2 gap-4 text-xs text-left">
            <div>
              <span className="text-[#64748B] block text-[11px]">Campaign Title:</span>
              <strong className="text-[#172E58]">{campaignTitle}</strong>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">Campaign ID:</span>
              <strong className="text-[#1456AD] font-mono text-[11px] truncate block" title={committedResult.campaign_id}>
                {committedResult.campaign_id}
              </strong>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">Enqueued Recipients:</span>
              <strong className="text-emerald-700">{committedResult.recipients_count} Pending Recipients</strong>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">Campaign Status:</span>
              <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">
                Ready (Prepared)
              </span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg max-w-lg mx-auto text-amber-800 text-xs flex items-start gap-2 text-left">
            <ShieldCheck size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>Strict Phase 6 Boundary Confirmation:</strong>
              <p className="mt-0.5 text-[11px]">
                No emails have been dispatched. The campaign and its recipients are safely staged in the database in the <code>Ready</code> state. Sending execution belongs to Phase 7.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={handleResetImport}
            >
              Start Another Import
            </Button>
            <Button
              variant="gold"
              size="md"
              icon={<ArrowRight size={16} />}
              onClick={() => navigateTo('sending-queue')}
              className="font-bold"
            >
              Open Sending Queue
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<ArrowRight size={16} />}
              onClick={() => navigateTo('email-activity')}
            >
              View in Email Activity
            </Button>
          </div>
        </Card>
      )}

      {/* Auth gate if administrator is not signed in */}
      {!isAuthLoading && !user && (
        <StateNotice
          kind="auth_required"
          message="Sign in as an administrator to upload recipient spreadsheets and persist bulk campaigns."
        />
      )}

      {/* STEP 1: UPLOAD SPREADSHEET */}
      {!committedResult && currentStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 min-w-0 flex flex-col">
            <Card className="h-full flex flex-col justify-between">
              <CardHeader
                title="Select Recipient Spreadsheet"
                subtitle="Upload CSV, XLSX, or legacy XLS roster with up to 10,000 recipient rows"
              />

              <div
                role="button"
                tabIndex={0}
                aria-label="Drop spreadsheet here or press Enter to browse files"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileChosen(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-[12px] p-8 text-center transition-all duration-150 ease-out snpsu-focus-ring cursor-pointer ${
                  isDragOver
                    ? 'border-[#1456AD] bg-[#EBF3FC]/75 scale-[1.005] shadow-md'
                    : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#1456AD]/70 hover:bg-[#F4F8FF]/60'
                }`}
              >
                <div className="w-14 h-14 mx-auto rounded-full bg-[#EBF3FC] text-[#1456AD] flex items-center justify-center mb-3.5 shadow-xs">
                  <UploadCloud size={28} />
                </div>

                <h4 className="text-sm font-semibold text-[#172E58]">
                  {selectedFile ? selectedFile.name : 'Drop spreadsheet here or click to browse'}
                </h4>
                <p className="text-xs text-[#64748B] max-w-md mx-auto mt-1 mb-4">
                  Supported formats: <strong className="text-[#1E293B]">.csv, .xlsx, .xls</strong> (Max file size: 10 MB)
                </p>

                {selectedFile ? (
                  <div className="inline-flex items-center gap-2 p-2 bg-white rounded-lg border border-[#CBD5E1] shadow-xs text-xs text-[#172E58]">
                    <FileSpreadsheet size={16} className="text-[#1456AD]" />
                    <span className="font-semibold">{selectedFile.name}</span>
                    <span className="text-[#64748B]">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <Button variant="primary" size="md" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    Browse Local Files
                  </Button>
                )}
              </div>

              {uploadError && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{uploadError}</span>
                </div>
              )}

              {isUploading && (
                <div className="mt-3">
                  <ProgressIndicator
                    progress={uploadProgress}
                    label={
                      uploadPhase === 'processing'
                        ? 'Parsing & validating recipient rows on server...'
                        : 'Uploading recipient spreadsheet...'
                    }
                    subLabel={
                      selectedFile
                        ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                        : undefined
                    }
                  />
                </div>
              )}

              {selectedFile && (
                <div className="mt-4 pt-3 border-t border-[#CBD5E1] flex items-center justify-between gap-3">
                  <span className="text-xs text-[#64748B]">
                    {isUploading
                      ? 'Transfer & validation active'
                      : 'Ready for server-side parsing & verification'}
                  </span>
                  <Button
                    variant="gold"
                    size="md"
                    isLoading={isUploading}
                    loadingText={uploadPhase === 'processing' ? 'Validating Roster...' : 'Uploading...'}
                    onClick={handleStartUpload}
                    icon={<ArrowRight size={16} />}
                    className="font-bold"
                  >
                    Upload & Process Roster
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Guidelines Sidebar */}
          <div className="lg:col-span-5 min-w-0 flex flex-col">
            <Card className="h-full flex flex-col justify-between">
              <CardHeader
                title="System Requirements & Ingestion Rules"
                subtitle="Authoritative backend verification specifications"
                action={<Info size={16} className="text-[#64748B]" />}
              />

              <div className="space-y-3 text-xs text-[#1E293B]">
                <div className="p-3 bg-[#EBF3FC] rounded-lg border border-[#1456AD]/25 space-y-1.5">
                  <strong className="text-[#172E58] block">1. Simplified Two-Column Schema</strong>
                  <p className="text-[11px] text-[#1E293B] leading-relaxed">
                    Recipient spreadsheets require <strong>ONLY TWO</strong> mandatory columns: <code>Full Name</code> and <code>Email Address</code>. Extra columns in older spreadsheets (such as Department or Role) are safely ignored.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('csv')}
                      className="text-[11px] font-semibold text-[#1456AD] hover:bg-[#1456AD]/10 hover:border-[#1456AD]/50 bg-white border border-[#1456AD]/25 px-2.5 py-1 rounded-md snpsu-control-pill"
                    >
                      Download CSV Template
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('xlsx')}
                      className="text-[11px] font-semibold text-[#1456AD] hover:bg-[#1456AD]/10 hover:border-[#1456AD]/50 bg-white border border-[#1456AD]/25 px-2.5 py-1 rounded-md snpsu-control-pill"
                    >
                      Download XLSX Template
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('xls')}
                      className="text-[11px] font-semibold text-[#1456AD] hover:bg-[#1456AD]/10 hover:border-[#1456AD]/50 bg-white border border-[#1456AD]/25 px-2.5 py-1 rounded-md snpsu-control-pill"
                    >
                      Download XLS Template
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] space-y-1">
                  <strong className="text-[#172E58] block">2. File Format & Magic Bytes</strong>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Supports <code>.csv</code>, <code>.xlsx</code>, and legacy <code>.xls</code> up to 10 MB / 10,000 rows. Binary signatures are verified in memory with zero permanent file storage.
                  </p>
                </div>

                <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] space-y-1">
                  <strong className="text-[#172E58] block">3. Mandatory Field & Duplicate Checks</strong>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Both Full Name and a syntactically valid Email Address are required for every row. Case-insensitive duplicate emails are flagged automatically so each recipient is contacted once.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* STEP 2: CONFIGURE MAPPING */}
      {!committedResult && currentStep === 2 && activeBatch && (
        <Card>
          <CardHeader
            title="Map Mandatory Recipient Fields"
            subtitle={`File: ${activeBatch.original_filename} • ${activeBatch.total_rows} rows detected • Accepts Full Name and Email Address only`}
          />

          <div className="space-y-6 text-xs text-[#1E293B] mt-2">
            {liveIgnoredColumns.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong className="block text-xs">
                    Extra Unsupported Columns Will Be Ignored ({liveIgnoredColumns.join(', ')})
                  </strong>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    SNPSUNEXUS Mail Studio now accepts only <strong>Full Name</strong> and <strong>Email Address</strong> from recipient spreadsheets. Any extra columns (such as Department or Role) are automatically ignored and will not be stored.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-[#F8FAFC] rounded-xl border border-[#CBD5E1]">
              {/* Worksheet Selector (for Excel) */}
              {activeBatch.file_type !== 'csv' && (
                <div>
                  <label className="block text-xs font-semibold text-[#172E58] mb-1.5">
                    Select Worksheet
                  </label>
                  <select
                    value={mappingState.worksheetName}
                    onChange={(e) => setMappingState({ ...mappingState, worksheetName: e.target.value })}
                    className="w-full bg-white border border-[#CBD5E1] rounded-[10px] text-xs px-3 h-10 focus:outline-none focus:border-[#1456AD] focus:ring-2 focus:ring-[#1456AD]/15"
                  >
                    {(activeBatch.available_sheets || ['Sheet1']).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Header Row Index */}
              <div>
                <label className="block text-xs font-semibold text-[#172E58] mb-1.5">
                  Header Row Number
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={mappingState.headerRow}
                  onChange={(e) => setMappingState({ ...mappingState, headerRow: parseInt(e.target.value, 10) || 1 })}
                  className="w-full bg-white border border-[#CBD5E1] rounded-[10px] text-xs px-3 h-10 focus:outline-none focus:border-[#1456AD] focus:ring-2 focus:ring-[#1456AD]/15"
                />
              </div>

              {/* Full Name Column Mapping */}
              <div>
                <label className="block text-xs font-semibold text-[#172E58] mb-1.5 flex items-center justify-between gap-2">
                  <span>Full Name Column (Required)</span>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${mappingState.nameColumn ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {mappingState.nameColumn ? 'Mapped' : 'Select'}
                  </span>
                </label>
                <select
                  value={mappingState.nameColumn}
                  onChange={(e) => setMappingState({ ...mappingState, nameColumn: e.target.value })}
                  className="w-full bg-white border border-[#1456AD] rounded-[10px] text-xs px-3 h-10 font-semibold text-[#172E58] focus:outline-none focus:ring-2 focus:ring-[#1456AD]/15"
                >
                  <option value="">-- Choose Full Name Column --</option>
                  {(activeBatch.headers || []).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Email Column Mapping */}
              <div>
                <label className="block text-xs font-semibold text-[#172E58] mb-1.5 flex items-center justify-between gap-2">
                  <span>Email Column (Required)</span>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${mappingState.emailColumn ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {mappingState.emailColumn ? 'Mapped' : 'Select'}
                  </span>
                </label>
                <select
                  value={mappingState.emailColumn}
                  onChange={(e) => setMappingState({ ...mappingState, emailColumn: e.target.value })}
                  className="w-full bg-white border border-[#1456AD] rounded-[10px] text-xs px-3 h-10 font-semibold text-[#1456AD] focus:outline-none focus:ring-2 focus:ring-[#1456AD]/15"
                >
                  <option value="">-- Choose Email Column --</option>
                  {(activeBatch.headers || []).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Navigation Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#CBD5E1]">
              <Button
                variant="outline"
                size="md"
                icon={<ArrowLeft size={16} />}
                onClick={() => setCurrentStep(1)}
              >
                Back to Upload
              </Button>

              <Button
                variant="primary"
                size="md"
                isLoading={isUpdatingMapping}
                loadingText="Validating Mapping..."
                icon={<ArrowRight size={16} />}
                onClick={handleApplyMapping}
                className="font-bold"
              >
                Apply Mapping & Validate
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3: VALIDATION SUMMARY */}
      {!committedResult && currentStep === 3 && activeBatch && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-[#CBD5E1] shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#64748B] uppercase">Total Rows</p>
                <p className="text-2xl font-bold text-[#172E58] mt-0.5">{activeBatch.total_rows}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-100 text-slate-600">
                <FileSpreadsheet size={22} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase">Valid & Ready</p>
                <p className="text-2xl font-bold text-emerald-700 mt-0.5">{activeBatch.valid_count}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={22} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-amber-700 uppercase">Duplicates</p>
                <p className="text-2xl font-bold text-amber-700 mt-0.5">{activeBatch.duplicate_count}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                <Copy size={22} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-rose-700 uppercase">Invalid / Missing Fields</p>
                <p className="text-2xl font-bold text-rose-700 mt-0.5">{activeBatch.invalid_count}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600">
                <AlertCircle size={22} />
              </div>
            </div>
          </div>

          {/* Validation Analysis Box */}
          <Card>
            <CardHeader
              title="Authoritative Validation Ledger Summary"
              subtitle="Verification of mandatory Full Name and Email Address records vs suppressed duplicates and errors"
            />

            <div className="space-y-4 text-xs text-[#1E293B]">
              {activeBatch.ignored_columns && activeBatch.ignored_columns.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Unsupported columns ignored: <strong>{activeBatch.ignored_columns.join(', ')}</strong>. Only Full Name and Email Address are staged for import.
                  </span>
                </div>
              )}

              <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#172E58]">Eligible for Campaign Staging:</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {activeBatch.valid_count + activeBatch.warning_count} Verified Recipients
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] leading-relaxed">
                  Only records with both a non-empty <strong>Full Name</strong> and a syntactically valid, unique <strong>Email Address</strong> are eligible for campaign staging. All {activeBatch.duplicate_count} duplicate addresses and {activeBatch.invalid_count} invalid or incomplete records are automatically excluded.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="md"
                  icon={<ArrowLeft size={16} />}
                  onClick={() => setCurrentStep(2)}
                >
                  Adjust Column Mapping
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  icon={<ArrowRight size={16} />}
                  onClick={() => setCurrentStep(4)}
                  className="font-bold"
                >
                  Proceed to Recipient Review
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 4: RECIPIENT REVIEW TABLE */}
      {!committedResult && currentStep === 4 && activeBatch && (
        <Card>
          <CardHeader
            title="Staged Recipient Review Ledger"
            subtitle={`Showing ${rowsPagination.total} records • ${activeBatch.selected_count} currently selected for campaign`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1 bg-[#F4F6FA] p-1 rounded-lg border border-[#CBD5E1]">
                  <button
                    onClick={() => { setStatusFilter('all'); setRowsPagination((p) => ({ ...p, page: 1 })); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'all' ? 'bg-white text-[#1456AD] shadow-xs' : 'text-[#64748B]'
                    }`}
                  >
                    All ({activeBatch.total_rows})
                  </button>
                  <button
                    onClick={() => { setStatusFilter('valid'); setRowsPagination((p) => ({ ...p, page: 1 })); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'valid' ? 'bg-white text-emerald-700 shadow-xs' : 'text-[#64748B]'
                    }`}
                  >
                    Valid ({activeBatch.valid_count})
                  </button>
                  {activeBatch.warning_count > 0 && (
                    <button
                      onClick={() => { setStatusFilter('warning'); setRowsPagination((p) => ({ ...p, page: 1 })); }}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        statusFilter === 'warning' ? 'bg-white text-blue-700 shadow-xs' : 'text-[#64748B]'
                      }`}
                    >
                      Warnings ({activeBatch.warning_count})
                    </button>
                  )}
                  <button
                    onClick={() => { setStatusFilter('duplicate'); setRowsPagination((p) => ({ ...p, page: 1 })); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'duplicate' ? 'bg-white text-amber-700 shadow-xs' : 'text-[#64748B]'
                    }`}
                  >
                    Duplicates ({activeBatch.duplicate_count})
                  </button>
                  <button
                    onClick={() => { setStatusFilter('invalid'); setRowsPagination((p) => ({ ...p, page: 1 })); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === 'invalid' ? 'bg-white text-rose-700 shadow-xs' : 'text-[#64748B]'
                    }`}
                  >
                    Invalid ({activeBatch.invalid_count})
                  </button>
                </div>

                {/* Search */}
                <div className="w-full sm:w-56">
                  <Input
                    placeholder="Search ledger..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    leftIcon={<Search size={14} />}
                  />
                </div>
              </div>
            }
          />

          {/* Table Actions Toolbar */}
          <div className="p-3 bg-[#F8FAFC] border-y border-[#CBD5E1] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleToggleSelectAllOnPage(true)}
                disabled={isUpdatingSelection}
                className="text-[#1456AD] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare size={13} />
                Select All Eligible on Page
              </button>
              <button
                onClick={() => handleToggleSelectAllOnPage(false)}
                disabled={isUpdatingSelection}
                className="text-[#64748B] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Square size={13} />
                Deselect All on Page
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isUpdatingSelection && <SyncStatusPill label="Saving selection..." />}
              {isLoadingRows && <SyncStatusPill label="Loading rows..." />}
              <span className="text-[#64748B]">Page {rowsPagination.page} of {rowsPagination.pages}</span>
              <div className="flex items-center gap-1">
                <button
                  disabled={rowsPagination.page <= 1 || isLoadingRows}
                  onClick={() => setRowsPagination((p) => ({ ...p, page: p.page - 1 }))}
                  className="p-1 rounded border border-[#CBD5E1] bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={rowsPagination.page >= rowsPagination.pages || isLoadingRows}
                  onClick={() => setRowsPagination((p) => ({ ...p, page: p.page + 1 }))}
                  className="p-1 rounded border border-[#CBD5E1] bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Table Surface */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#64748B] border-b border-[#CBD5E1] uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 w-10 text-center">Select</th>
                  <th className="py-2.5 px-3 w-16">Row #</th>
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Email Address</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Validation Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {isLoadingRows ? (
                  <TableSkeleton rows={6} columns={6} asTableRows />
                ) : (
                stagedRows.map((row) => {
                  const isEligible = row.validation_status === 'valid' || row.validation_status === 'warning';
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        !row.is_selected || !isEligible ? 'bg-slate-50/60 opacity-75' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.is_selected}
                          disabled={!isEligible || isUpdatingSelection}
                          onChange={() => handleToggleRowSelection(row)}
                          aria-label={`Select ${row.recipient_name || row.recipient_email || `row ${row.row_number}`}`}
                          className="w-4 h-4 rounded border-[#CBD5E1] accent-[#1456AD] text-[#1456AD] transition-transform duration-100 checked:scale-105 snpsu-focus-ring cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                        {row.row_number}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#172E58]">
                        {row.recipient_name || (
                          <span className="text-rose-500 italic">[Missing Name]</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {row.recipient_email || <span className="text-rose-500 italic">[Missing Email]</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.validation_status === 'valid' && (
                          <Badge variant="success">Valid</Badge>
                        )}
                        {row.validation_status === 'warning' && (
                          <Badge variant="info">Warning</Badge>
                        )}
                        {row.validation_status === 'duplicate' && (
                          <Badge variant="warning">Duplicate</Badge>
                        )}
                        {row.validation_status === 'invalid' && (
                          <Badge variant="error">Invalid</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[#64748B]">
                        {row.validation_errors && row.validation_errors.length > 0 ? (
                          <span className={row.validation_status === 'duplicate' ? 'text-amber-700' : 'text-rose-600'}>
                            {row.validation_errors.join(' • ')}
                          </span>
                        ) : (
                          <span className="text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Clean & verified
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>

          {/* Review Footer Actions */}
          <div className="p-4 border-t border-[#CBD5E1] flex items-center justify-between">
            <Button
              variant="outline"
              size="md"
              icon={<ArrowLeft size={16} />}
              onClick={() => setCurrentStep(3)}
            >
              Back to Summary
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={<ArrowRight size={16} />}
              onClick={() => setCurrentStep(5)}
              className="font-bold"
            >
              Proceed to Campaign Staging
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 5: CAMPAIGN STAGING & TEMPLATE ATTACHMENT */}
      {!committedResult && currentStep === 5 && activeBatch && (
        <div className="space-y-6">
          <Card className="bg-[#172E58] text-white border-0 shadow-lg p-6">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#E7C27B] bg-[#C69A4C]/25 px-2.5 py-1 rounded border border-[#C69A4C]/40">
                  Step 5 — Campaign Parameters
                </span>
                <h3 className="text-base font-bold text-white mt-2">
                  Attach Email Template & Configure Campaign Title
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1 font-medium">Campaign Title</label>
                  <input
                    type="text"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:border-[#C69A4C]"
                    placeholder="e.g. Q1 Product Update Campaign"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 mb-1 font-medium">Apply Email Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full bg-[#1F3C73] border border-white/20 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#C69A4C]"
                  >
                    {activeTemplates.length === 0 ? (
                      <option value="">No active templates available in database</option>
                    ) : (
                      activeTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          [{tpl.category}] {tpl.name} (v{tpl.version || 1})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {templateLoadState.status === 'error' && (
            <StateNotice
              kind="error"
              title="Unable to Load Email Templates"
              message={templateLoadState.error}
              errorCode={templateLoadState.errorCode}
              statusCode={templateLoadState.statusCode}
              onRetry={() => refreshTemplates()}
            />
          )}

          {/* Template Details & Subject Preview */}
          {selectedTemplate && (
            <Card>
              <CardHeader
                title={`Attached Template: ${selectedTemplate.name}`}
                subtitle={`Version v${selectedTemplate.version || 1} • Category: ${selectedTemplate.category}`}
              />

              <div className="space-y-3 text-xs text-[#1E293B]">
                {unavailableTemplatePlaceholders.length > 0 && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                    <div className="space-y-1">
                      <strong className="block text-xs">
                        Personalization Compatibility Warning
                      </strong>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        The selected template contains placeholder(s) not supplied by the two-column recipient import (<code>Full Name</code> &rarr; <code>{'{{recipient_name}}'}</code> and <code>Email Address</code> &rarr; <code>{'{{recipient_email}}'}</code>):
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {unavailableTemplatePlaceholders.map((tok) => (
                          <code
                            key={tok}
                            className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 font-mono text-[11px]"
                          >
                            {tok}
                          </code>
                        ))}
                      </div>
                      <p className="text-[11px] text-amber-800 pt-0.5">
                        SNPSUNEXUS will not invent missing per-recipient fields or import Department/Role columns. Choose a simpler template or remove unused placeholders before sending.
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] space-y-1">
                  <span className="text-[#64748B] font-semibold block text-[11px]">Subject Template:</span>
                  <p className="font-mono text-[#172E58] font-medium">{selectedTemplate.subject}</p>
                </div>

                {selectedTemplate.html_content ? (
                  <div className="bg-slate-100 rounded-lg border border-[#CBD5E1] overflow-hidden">
                    <iframe
                      title="Bulk Campaign Attached Template Preview"
                      srcDoc={selectedTemplate.html_content}
                      className="w-full border-0"
                      style={{ height: '420px', display: 'block', background: '#F4F6FA' }}
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="p-4 bg-white rounded-lg border border-[#CBD5E1] max-h-60 overflow-y-auto font-mono text-xs text-slate-700 whitespace-pre-wrap">
                    {selectedTemplate.text_content || selectedTemplate.contentPreview}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#CBD5E1]">
                  <Button
                    variant="outline"
                    size="md"
                    icon={<ArrowLeft size={16} />}
                    onClick={() => setCurrentStep(4)}
                  >
                    Back to Recipient Review
                  </Button>

                  <Button
                    variant="gold"
                    size="lg"
                    icon={<ArrowRight size={18} />}
                    iconPosition="right"
                    onClick={() => setIsConfirmationModalOpen(true)}
                    className="font-bold shadow-md"
                  >
                    Final Review & Confirmation
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* STEP 6: FINAL REVIEW & COMMITMENT CONFIRMATION MODAL */}
      <Modal
        isOpen={isConfirmationModalOpen}
        onClose={() => !isCommitting && setIsConfirmationModalOpen(false)}
        title="Final Review — Confirm Campaign Creation"
        subtitle="Verify roster parameters before committing to the permanent database"
        maxWidth="lg"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              size="md"
              disabled={isCommitting}
              onClick={() => setIsConfirmationModalOpen(false)}
            >
              Back to Editing
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isCommitting}
              loadingText="Committing Campaign..."
              onClick={handleConfirmCommit}
              className="font-bold bg-[#1456AD]"
            >
              Confirm & Commit Campaign
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-[#1E293B]">
          <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[10px] grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[#64748B] block text-[11px]">Campaign Title:</span>
              <strong className="text-[#172E58]">{campaignTitle}</strong>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">Selected Template:</span>
              <strong className="text-[#1456AD]">
                {selectedTemplate?.name} (v{selectedTemplate?.version || 1})
              </strong>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">Total Selected Recipients:</span>
              <strong className="text-emerald-700 text-sm">
                {activeBatch?.selected_count} Verified Candidates
              </strong>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">Excluded Invalid / Duplicates:</span>
              <strong className="text-amber-700">
                {(activeBatch?.duplicate_count || 0) + (activeBatch?.invalid_count || 0)} Suppressed Records
              </strong>
            </div>
          </div>

          {unavailableTemplatePlaceholders.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong className="block">Template Uses Unavailable Placeholders</strong>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Missing from 2-column recipient import: <strong>{unavailableTemplatePlaceholders.join(', ')}</strong>. Imported recipients provide only Full Name and Email Address.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 p-3 bg-[#EBF3FC] border border-[#1456AD]/20 rounded-lg text-[#172E58] text-xs">
            <div className="flex items-center gap-2 font-bold text-[#1456AD]">
              <ShieldCheck size={16} />
              <span>Immutable Snapshot & Transaction Guarantee</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
              <li>A complete snapshot of template version v{selectedTemplate?.version || 1} will be captured into the campaign. Future template changes will not modify this campaign.</li>
              <li>Selected recipients will be stored with status <code>pending</code>.</li>
              <li>Campaign will be marked <code>ready</code> (prepared, but NOT sent).</li>
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
};
