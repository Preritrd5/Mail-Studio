export type NavigationSection = 
  | 'dashboard'
  | 'compose'
  | 'bulk-import'
  | 'sending-queue'
  | 'email-activity'
  | 'email-templates'
  | 'reports';

export type ActivityStatus = 'Pending' | 'Sending' | 'Sent' | 'Failed';

export interface EmailActivityItem {
  id: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  campaign: string;
  status: ActivityStatus;
  timestamp: string;
  failureReason?: string;
  messageId?: string;
  department?: string;
}

export interface EmailTemplateItem {
  id: string;
  name: string;
  category: 'Admissions' | 'Examinations' | 'Fees' | 'Faculty' | 'Notifications' | 'General Notifications' | string;
  subject: string;
  lastEdited: string;
  author: string;
  usageCount: number;
  variables: string[];
  contentPreview: string;
  isDefault?: boolean;
  // Phase 5 Enhanced Backend & Versioning Fields
  description?: string;
  html_content?: string;
  text_content?: string;
  version?: number;
  is_active?: boolean;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  versions?: TemplateVersionRecord[];
}

export interface TemplateVersionRecord {
  id: string;
  template_id: string;
  version: number;
  name: string;
  description?: string;
  category: string;
  subject: string;
  html_content: string;
  text_content?: string;
  created_at: string;
  created_by?: string | null;
  change_summary?: string;
}

export type RecipientStatus = 'valid' | 'duplicate' | 'invalid_email' | 'missing_fields';

export type ImportValidationStatus = 'valid' | 'warning' | 'invalid' | 'duplicate';

export interface ImportBatchRowRecord {
  id: string;
  batch_id: string;
  row_number: number;
  recipient_name: string;
  recipient_email: string;
  normalized_email: string;
  validation_status: ImportValidationStatus;
  validation_errors: string[];
  is_selected: boolean;
  raw_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ImportBatchRecord {
  id: string;
  created_by?: string | null;
  original_filename: string;
  file_type: 'csv' | 'xlsx' | 'xls';
  file_size_bytes: number;
  status: 'Uploaded' | 'Processing' | 'Ready' | 'Failed' | 'Committed' | 'Cancelled';
  worksheet_name?: string;
  available_sheets?: string[];
  header_row: number;
  total_rows: number;
  valid_count: number;
  warning_count: number;
  invalid_count: number;
  duplicate_count: number;
  selected_count: number;
  mapping_config: {
    emailColumn?: string;
    nameColumn?: string;
    headerRow?: number;
    worksheetName?: string;
  };
  detected_columns?: {
    emailColumn?: string;
    nameColumn?: string;
  };
  headers?: string[];
  ignored_columns?: string[];
  ignored_columns_warning?: string | null;
  summary?: {
    total_rows: number;
    valid_count: number;
    warning_count: number;
    invalid_count: number;
    duplicate_count: number;
    selected_count: number;
  };
  error_message?: string | null;
  committed_at?: string | null;
  committed_campaign_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecipientRecord {
  id: string;
  name: string;
  email: string;
  status: RecipientStatus;
  reason?: string;
  selected?: boolean;
}

export interface CampaignSummary {
  id: string;
  name: string;
  targetAudience: string;
  totalRecipients: number;
  sentCount: number;
  pendingCount: number;
  failedCount: number;
  status: 'draft' | 'queued' | 'sending' | 'completed' | 'paused' | 'cancelled';
  createdAt: string;
  completionRate: number;
  templateId?: string;
}

export type QueueEngineStatus = 'idle' | 'running' | 'paused' | 'cancelled' | 'completed';

export interface QueueItem {
  id: string;
  recipientEmail: string;
  recipientName: string;
  campaignName: string;
  priority: 'high' | 'normal' | 'low';
  status: 'queued' | 'processing' | 'sent' | 'failed' | 'paused';
  scheduledTime: string;
  failureReason?: string;
}

export interface QueueState {
  campaignName: string;
  totalRecipients: number;
  sentCount: number;
  pendingCount: number;
  failedCount: number;
  currentRecipientIndex: number;
  status: QueueEngineStatus;
  startTimestamp: string;
  countdown: number;
  rateLimit: number; // emails per sec
  items: QueueItem[];
}

export interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

export type DateRange = 'today' | '7d' | '30d' | 'all';

// Block-based Email Editor Types
export type EmailBlockType =
  | 'heading'
  | 'paragraph'
  | 'richtext'
  | 'infocard'
  | 'image'
  | 'button'
  | 'bulletlist'
  | 'numberedlist'
  | 'divider'
  | 'spacer'
  | 'signature'
  | 'footer';

export interface InfoCardField {
  id: string;
  label: string;
  value: string;
  icon?: 'user' | 'mail' | 'briefcase' | 'calendar' | 'id' | 'file';
}

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  // Content & Typography
  content?: string;
  title?: string;
  subtitle?: string;
  level?: 'h1' | 'h2' | 'h3';
  align?: 'left' | 'center' | 'right';
  textColor?: string;
  // Button Configuration
  buttonText?: string;
  buttonUrl?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  buttonRadius?: number;
  buttonPaddingY?: number;
  buttonPaddingX?: number;
  buttonWidth?: 'auto' | 'full';
  // Information Card Configuration
  cardTitle?: string;
  cardBadge?: string;
  cardBgColor?: string;
  cardBorderColor?: string;
  cardFields?: InfoCardField[];
  // Image Configuration
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: string;
  // Lists
  items?: string[];
  // Divider & Spacer
  spacingHeight?: number;
  dividerColor?: string;
  dividerStyle?: 'solid' | 'dashed';
  dividerThickness?: number;
  // Signature & Footer
  signOff?: string;
  senderName?: string;
  senderTitle?: string;
  companyName?: string;
  tagline?: string;
  footerText?: string;
  copyrightText?: string;
  showLogo?: boolean;
}
