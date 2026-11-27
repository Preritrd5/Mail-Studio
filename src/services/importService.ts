import { fetchApiEnvelope } from './apiConfig';
import { ImportBatchRecord, ImportBatchRowRecord } from '../types';

export class ImportService {
  /**
   * Upload spreadsheet file (CSV, XLSX, XLS) and create persistent import batch
   */
  public static async uploadFile(
    file: File,
    options?: {
      worksheet_name?: string;
      header_row?: number;
      email_column?: string;
      name_column?: string;
    }
  ): Promise<{ batch: ImportBatchRecord | null; success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.worksheet_name) formData.append('worksheet_name', options.worksheet_name);
      if (options?.header_row) formData.append('header_row', String(options.header_row));
      if (options?.email_column) formData.append('email_column', options.email_column);
      if (options?.name_column) formData.append('name_column', options.name_column);

      const json = await fetchApiEnvelope<{ batch: ImportBatchRecord }>(
        '/imports',
        { method: 'POST', body: formData },
        false
      );

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
