import { fetchApiEnvelope, getApiUrl, getAuthHeaders } from './apiConfig';
import { ImportBatchRecord, ImportBatchRowRecord } from '../types';

export type ImportUploadProgressCallback = (percent: number, phase: 'uploading' | 'processing') => void;

export class ImportService {
  /**
   * Upload spreadsheet file (CSV, XLSX, XLS) with real XHR upload progress tracking
   */
  public static async uploadFile(
    file: File,
    options?: {
      worksheet_name?: string;
      header_row?: number;
      email_column?: string;
      name_column?: string;
      onProgress?: ImportUploadProgressCallback;
      signal?: AbortSignal;
    }
  ): Promise<{ batch: ImportBatchRecord | null; success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.worksheet_name) formData.append('worksheet_name', options.worksheet_name);
      if (options?.header_row) formData.append('header_row', String(options.header_row));
      if (options?.email_column) formData.append('email_column', options.email_column);
      if (options?.name_column) formData.append('name_column', options.name_column);

      const authHeaders = await getAuthHeaders();
      const url = getApiUrl('/imports');
      const onProgress = options?.onProgress;

      const json = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.timeout = 60000;

        Object.entries(authHeaders).forEach(([k, v]) => {
          xhr.setRequestHeader(k, v);
        });

        const handleAbortSignal = () => {
          xhr.abort();
        };
        if (options?.signal) {
          if (options.signal.aborted) {
            const abortErr: any = new Error('Upload cancelled');
            abortErr.name = 'AbortError';
            reject(abortErr);
            return;
          }
          options.signal.addEventListener('abort', handleAbortSignal, { once: true });
        }

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            // Allocate 0-85% for network byte transfer and reserve 85-100% for server workbook parsing
            const pct = Math.min(85, Math.max(5, Math.round((evt.loaded / evt.total) * 85)));
            onProgress?.(pct, 'uploading');
          }
        };

        xhr.upload.onload = () => {
          onProgress?.(92, 'processing');
        };

        xhr.onload = () => {
          options?.signal?.removeEventListener('abort', handleAbortSignal);
          try {
            const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            if (xhr.status >= 200 && xhr.status < 300 && parsed?.success) {
              onProgress?.(100, 'processing');
              resolve(parsed);
            } else {
              const err: any = new Error(parsed?.error?.message || `Upload failed (${xhr.status})`);
              err.status = xhr.status || 500;
              err.code = parsed?.error?.code || 'UPLOAD_FAILED';
              reject(err);
            }
          } catch {
            const err: any = new Error(`Unexpected response from upload endpoint (${xhr.status})`);
            err.status = xhr.status || 502;
            err.code = 'INVALID_SERVER_RESPONSE';
            reject(err);
          }
        };

        xhr.onerror = () => {
          options?.signal?.removeEventListener('abort', handleAbortSignal);
          const err: any = new Error('Network error during file upload. Verify connection and retry.');
          err.status = 503;
          err.code = 'NETWORK_UNAVAILABLE';
          reject(err);
        };

        xhr.ontimeout = () => {
          options?.signal?.removeEventListener('abort', handleAbortSignal);
          const err: any = new Error('Spreadsheet upload and parsing timed out. Try a smaller file or retry.');
          err.status = 408;
          err.code = 'REQUEST_TIMEOUT';
          reject(err);
        };

        xhr.onabort = () => {
          options?.signal?.removeEventListener('abort', handleAbortSignal);
          const abortErr: any = new Error('Upload cancelled');
          abortErr.name = 'AbortError';
          reject(abortErr);
        };

        onProgress?.(5, 'uploading');
        xhr.send(formData);
      });

      return {
        batch: json.data?.batch || null,
        success: true,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          batch: null,
          success: false,
          error: 'Upload was cancelled.',
          statusCode: 499,
          errorCode: 'ABORTED',
        };
      }
      return {
        batch: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Retrieve import batch metadata and summary counts
   */
  public static async getBatch(
    id: string
  ): Promise<{ batch: ImportBatchRecord | null; success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      const json = await fetchApiEnvelope<ImportBatchRecord>(`/imports/${id}`);
      return {
        batch: json.data,
        success: true,
      };
    } catch (err: any) {
      return {
        batch: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Retrieve paginated and filtered staging rows
   */
  public static async getBatchRows(
    id: string,
    params?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    rows: ImportBatchRowRecord[];
    pagination: { page: number; limit: number; total: number; pages: number };
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.status && params.status !== 'all') query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      if (params?.sortField) query.set('sortField', params.sortField);
      if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

      const json = await fetchApiEnvelope<{
        rows: ImportBatchRowRecord[];
        pagination: { page: number; limit: number; total: number; pages: number };
      }>(`/imports/${id}/rows?${query.toString()}`);

      return {
        rows: json.data?.rows || [],
        pagination: json.data?.pagination || { page: 1, limit: 20, total: 0, pages: 1 },
        success: true,
      };
    } catch (err: any) {
      return {
        rows: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 1 },
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Update column mapping configuration and trigger authoritative re-validation
   */
  public static async updateMapping(
    id: string,
    mapping: {
      emailColumn: string;
      nameColumn: string;
      headerRow?: number;
      worksheetName?: string;
    }
  ): Promise<{ batch: ImportBatchRecord | null; success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      const json = await fetchApiEnvelope<{ batch: ImportBatchRecord }>(`/imports/${id}/mapping`, {
        method: 'PATCH',
        body: JSON.stringify(mapping),
      });

      return {
        batch: json.data?.batch || null,
        success: true,
      };
    } catch (err: any) {
      return {
        batch: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Update selection state of rows
   */
  public static async updateSelection(
    id: string,
    payload: {
      rowIds?: string[];
      isSelected: boolean;
      selectAllStatus?: string;
    }
  ): Promise<{ selectedCount: number; updatedCount: number; success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      const json = await fetchApiEnvelope<{ selectedCount: number; updatedCount: number }>(
        `/imports/${id}/selection`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      return {
        selectedCount: json.data?.selectedCount || 0,
        updatedCount: json.data?.updatedCount || 0,
        success: true,
      };
    } catch (err: any) {
      return {
        selectedCount: 0,
        updatedCount: 0,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Atomically commit import batch into permanent campaign and recipients
   */
  public static async commitImport(
    id: string,
    payload: {
      campaignName: string;
      templateId: string;
      idempotencyKey: string;
    }
  ): Promise<{
    campaign_id: string;
    recipients_count: number;
    idempotent_replay: boolean;
    personalization_warnings?: string[];
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const json = await fetchApiEnvelope<{
        campaign_id: string;
        recipients_count: number;
        idempotent_replay: boolean;
        personalization_warnings?: string[];
      }>(`/imports/${id}/commit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return {
        campaign_id: json.data?.campaign_id || '',
        recipients_count: json.data?.recipients_count || 0,
        idempotent_replay: !!json.data?.idempotent_replay,
        personalization_warnings: json.data?.personalization_warnings || [],
        success: true,
      };
    } catch (err: any) {
      return {
        campaign_id: '',
        recipients_count: 0,
        idempotent_replay: false,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Cancel an uncommitted batch
   */
  public static async cancelImport(id: string): Promise<{ success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      await fetchApiEnvelope(`/imports/${id}/cancel`, { method: 'POST' });
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }
}
