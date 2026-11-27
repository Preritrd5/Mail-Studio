import { fetchApiEnvelope } from './apiConfig';
import { EmailTemplateItem, TemplateVersionRecord } from '../types';

export const STANDARD_PLACEHOLDERS = [
  '{{recipient_name}}',
  '{{recipient_email}}',
  '{{institution_name}}',
  '{{designation}}',
  '{{activation_link}}',
  '{{current_year}}',
] as const;

export interface PlaceholderDetail {
  token: string;
  key: string;
  label: string;
  description: string;
  sampleValue: string;
}

export const PLACEHOLDER_DETAILS: Record<string, PlaceholderDetail> = {
  '{{recipient_name}}': {
    token: '{{recipient_name}}',
    key: 'recipient_name',
    label: 'Recipient Name',
    description: 'Full name of the recipient',
    sampleValue: '[Recipient Name]',
  },
  '{{recipient_email}}': {
    token: '{{recipient_email}}',
    key: 'recipient_email',
    label: 'Recipient Email',
    description: 'Verified recipient email address',
    sampleValue: '[Recipient Email]',
  },
  '{{institution_name}}': {
    token: '{{institution_name}}',
    key: 'institution_name',
    label: 'Brand / Organization',
    description: 'Product brand or organization name',
    sampleValue: 'SNPSUNEXUS',
  },
  '{{designation}}': {
    token: '{{designation}}',
    key: 'designation',
    label: 'Designation / Role',
    description: 'Professional title or role',
    sampleValue: '[Designation]',
  },
  '{{activation_link}}': {
    token: '{{activation_link}}',
    key: 'activation_link',
    label: 'Action Link',
    description: 'Secured authentication or portal URL',
    sampleValue: 'https://snpsunexus.vercel.app',
  },
  '{{current_year}}': {
    token: '{{current_year}}',
    key: 'current_year',
    label: 'Current Year',
    description: 'Active calendar year',
    sampleValue: String(new Date().getFullYear()),
  },
};

export interface TemplateServiceResult<T = void> {
  success: boolean;
  error?: string;
  statusCode?: number;
  errorCode?: string;
  data?: T;
}

export class TemplateService {
  /**
   * Normalize backend database response into frontend EmailTemplateItem
   */
  public static normalizeTemplate(raw: any): EmailTemplateItem {
    return {
      id: raw.id,
      name: raw.name,
      category: raw.category || 'Notifications',
      subject: raw.subject,
      description: raw.description || '',
      html_content: raw.html_content || '',
      text_content: raw.text_content || '',
      contentPreview:
        raw.text_content ||
        (raw.html_content ? raw.html_content.replace(/<[^>]*>/g, '').trim().substring(0, 240) : ''),
      lastEdited: raw.updated_at
        ? raw.updated_at.split('T')[0]
        : raw.created_at
        ? raw.created_at.split('T')[0]
        : new Date().toISOString().split('T')[0],
      author: raw.created_by || 'Administrator',
      usageCount: raw.usage_count || 0,
      variables: [...STANDARD_PLACEHOLDERS],
      isDefault: raw.is_default || false,
      version: raw.version || 1,
      is_active: raw.is_active !== false,
      archived_at: raw.archived_at || null,
      created_at: raw.created_at || new Date().toISOString(),
      updated_at: raw.updated_at || new Date().toISOString(),
      created_by: raw.created_by || null,
      updated_by: raw.updated_by || null,
      versions: raw.versions || [],
    };
  }

  /**
   * Fetch all email templates with optional search, category, and active/archived status.
   * Never returns hardcoded fallback templates when the database is empty or unreachable.
   */
  public static async listTemplates(params?: {
    search?: string;
    category?: string;
    status?: 'active' | 'archived' | 'all';
    page?: number;
    limit?: number;
  }): Promise<{
    templates: EmailTemplateItem[];
    total: number;
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.category && params.category !== 'All') query.set('category', params.category);
      if (params?.status) query.set('status', params.status);
      if (params?.page) query.set('page', params.page.toString());
      if (params?.limit) query.set('limit', params.limit.toString());

      const json = await fetchApiEnvelope<{
        templates: any[];
        pagination?: { total?: number };
      }>(`/templates?${query.toString()}`);

      const templates = (json.data?.templates || []).map(this.normalizeTemplate);
      return {
        templates,
        total: json.data?.pagination?.total ?? templates.length,
        success: true,
      };
    } catch (err: any) {
      return {
        templates: [],
        total: 0,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Fetch a single template by ID including version history
   */
  public static async getTemplateById(
    id: string
  ): Promise<{
    template: EmailTemplateItem | null;
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const json = await fetchApiEnvelope<any>(`/templates/${id}`);
      return {
        template: this.normalizeTemplate(json.data),
        success: true,
      };
    } catch (err: any) {
      return {
        template: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Create a new template (version 1)
   */
  public static async createTemplate(data: {
    name: string;
    description?: string;
    category: string;
    subject: string;
    html_content: string;
    text_content?: string;
  }): Promise<{
    template: EmailTemplateItem | null;
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const json = await fetchApiEnvelope<any>('/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return {
        template: this.normalizeTemplate(json.data),
        success: true,
      };
    } catch (err: any) {
      return {
        template: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Update an existing template (auto-increments version and snapshots history)
   */
  public static async updateTemplate(
    id: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      subject?: string;
      html_content?: string;
      text_content?: string;
      change_summary?: string;
    }
  ): Promise<{
    template: EmailTemplateItem | null;
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const json = await fetchApiEnvelope<any>(`/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return {
        template: this.normalizeTemplate(json.data),
        success: true,
      };
    } catch (err: any) {
      return {
        template: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Duplicate template into a fresh version 1 clone
   */
  public static async duplicateTemplate(
    id: string
  ): Promise<{
    template: EmailTemplateItem | null;
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const json = await fetchApiEnvelope<any>(`/templates/${id}/duplicate`, {
        method: 'POST',
      });
      return {
        template: this.normalizeTemplate(json.data),
        success: true,
      };
    } catch (err: any) {
      return {
        template: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Soft-delete / archive template
   */
  public static async archiveTemplate(
    id: string
  ): Promise<{ success: boolean; error?: string; statusCode?: number; errorCode?: string }> {
    try {
      await fetchApiEnvelope(`/templates/${id}/archive`, { method: 'PATCH' });
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

  /**
   * Restore archived template
   */
  public static async restoreTemplate(
    id: string
  ): Promise<{
    template: EmailTemplateItem | null;
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const json = await fetchApiEnvelope<any>(`/templates/${id}/restore`, {
        method: 'PATCH',
      });
      return {
        template: this.normalizeTemplate(json.data),
        success: true,
      };
    } catch (err: any) {
      return {
        template: null,
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Safe server-side preview rendering with placeholder interpolation & security checks
   */
  public static async previewTemplate(data: {
    template_id?: string;
    version?: number;
    subject: string;
    html_content: string;
    text_content?: string;
    variables?: Record<string, string>;
  }): Promise<{
    rendered_subject: string;
    rendered_html: string;
    rendered_text: string;
    unsupported_placeholders: string[];
    success: boolean;
    error?: string;
    statusCode?: number;
    errorCode?: string;
  }> {
    try {
      const endpoint = data.template_id
        ? `/templates/${data.template_id}/preview`
        : '/templates/preview';
      const json = await fetchApiEnvelope<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          context: data.variables,
        }),
      });

      return {
        rendered_subject: json.data?.rendered_subject || json.data?.subject || data.subject,
        rendered_html: json.data?.rendered_html || json.data?.html_content || data.html_content,
        rendered_text: json.data?.rendered_text || json.data?.text_content || data.text_content || '',
        unsupported_placeholders:
          json.data?.unsupported_placeholders || json.data?.unsupported_tokens || [],
        success: true,
      };
    } catch (err: any) {
      return {
        rendered_subject: data.subject,
        rendered_html: data.html_content,
        rendered_text: data.text_content || '',
        unsupported_placeholders: [],
        success: false,
        error: err.message,
        statusCode: err.status,
        errorCode: err.code,
      };
    }
  }

  /**
   * Fetch placeholder registry definitions from the backend
   */
  public static async getPlaceholders(): Promise<PlaceholderDetail[]> {
    const json = await fetchApiEnvelope<any[]>('/templates/placeholders');
    return (json.data || []).map((p: any) => ({
      token: p.token,
      key: p.key,
      label: p.label || p.description,
      description: p.description,
      sampleValue: p.sample_value || '',
    }));
  }
}

export type { TemplateVersionRecord };
