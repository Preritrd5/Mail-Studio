import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, 
  Eye, 
  Copy, 
  Edit3, 
  Archive, 
  Trash2,
  RotateCcw, 
  Search, 
  Bold, 
  Italic, 
  Underline,
  List, 
  ListOrdered,
  Quote, 
  Code, 
  Sparkles, 
  Smartphone, 
  Monitor, 
  FileText, 
  Send, 
  History, 
  AlertTriangle, 
  Check, 
  RefreshCw,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ExternalLink,
  Info,
  Clock,
  Layers,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Modal } from '../components/common/Modal';
import { BrandWordmark } from '../components/common/BrandWordmark';
import { StateNotice } from '../components/common/StateNotice';
import { BlockBasedEditor } from '../components/templates/BlockBasedEditor';
import { useApp } from '../context/AppContext';
import { EmailTemplateItem, TemplateVersionRecord, EmailBlock } from '../types';
import { 
  renderBlocksToHtml, 
  renderBlocksToText, 
  getPremiumNotificationCardBlocks, 
  getBlankTemplateBlocks 
} from '../services/templateHtmlGenerator';
import { 
  STANDARD_PLACEHOLDERS, 
  PLACEHOLDER_DETAILS, 
  TemplateService 
} from '../services/templateService';

export const EmailTemplatesView: React.FC = () => {
  const {
    templates,
    isLoadingTemplates,
    templateLoadState,
    refreshTemplates,
    addTemplate,
    updateTemplate,
    archiveTemplate,
    deleteTemplate,
    restoreTemplate,
    duplicateTemplate,
    useTemplateInCompose,
    addToast
  } = useApp();

  // Status & Filter states
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateItem | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewFormat, setPreviewFormat] = useState<'html' | 'text'>('html');

  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateItem | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [deleteTargetTemplate, setDeleteTargetTemplate] = useState<EmailTemplateItem | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const [historyTemplate, setHistoryTemplate] = useState<EmailTemplateItem | null>(null);
  const [selectedVersionSnapshot, setSelectedVersionSnapshot] = useState<TemplateVersionRecord | null>(null);

  // Editor mode & form data
  const [editorMode, setEditorMode] = useState<'blocks' | 'preview' | 'html' | 'text'>('blocks');
  const [activeBlocks, setActiveBlocks] = useState<EmailBlock[]>([]);
  const [isVariablesDrawerOpen, setIsVariablesDrawerOpen] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    name: string;
    category: EmailTemplateItem['category'];
    description: string;
    subject: string;
    html_content: string;
    text_content: string;
    change_summary: string;
  }>({
    name: '',
    category: 'General Notifications',
    description: '',
    subject: '',
    html_content: '',
    text_content: '',
    change_summary: '',
  });

  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const plainTextareaRef = useRef<HTMLTextAreaElement>(null);

  const categories: ('All' | EmailTemplateItem['category'])[] = [
    'All',
    'General Notifications',
    'Notifications',
    'Product Updates',
    'Account Alerts',
    'Operational Announcements',
  ];

  // Filter templates by active/archived status, category, and search query
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const isArchived = tpl.is_active === false || !!tpl.archived_at;
      const matchesStatus = statusFilter === 'archived' ? isArchived : !isArchived;
      const matchesCategory = selectedCategory === 'All' || tpl.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tpl.name.toLowerCase().includes(q) ||
        tpl.subject.toLowerCase().includes(q) ||
        (tpl.description && tpl.description.toLowerCase().includes(q));

      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [templates, statusFilter, selectedCategory, searchQuery]);

  // Counts for tabs
  const activeCount = useMemo(() => templates.filter((t) => t.is_active !== false && !t.archived_at).length, [templates]);
  const archivedCount = useMemo(() => templates.filter((t) => t.is_active === false || !!t.archived_at).length, [templates]);

  // Open Create Modal with clean blank block sequence by default
  const openCreateModal = (presetArg?: 'premium' | 'blank' | unknown) => {
    const preset = presetArg === 'premium' ? 'premium' : 'blank';
    const initialBlocks = preset === 'premium' ? getPremiumNotificationCardBlocks() : getBlankTemplateBlocks();
    setActiveBlocks(initialBlocks);
    const initialHtml = renderBlocksToHtml(initialBlocks, {
      emailTitle: preset === 'premium' ? 'SNPSUNEXUS Notification' : 'SNPSUNEXUS Message',
    });
    const initialText = renderBlocksToText(initialBlocks);

    setFormData({
      name: '',
      category: 'General Notifications',
      description: '',
      subject: '',
      html_content: initialHtml,
      text_content: initialText,
      change_summary: 'Initial template creation',
    });
    setEditorMode('blocks');
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal with existing template values
  const openEditModal = (tpl: EmailTemplateItem) => {
    setEditingTemplate(tpl);
    const initialBlocks = getBlankTemplateBlocks();
    setActiveBlocks(initialBlocks);

    setFormData({
      name: tpl.name,
      category: tpl.category,
      description: tpl.description || '',
      subject: tpl.subject,
      html_content: tpl.html_content || renderBlocksToHtml(initialBlocks),
      text_content: tpl.text_content || tpl.contentPreview || renderBlocksToText(initialBlocks),
      change_summary: '',
    });
    setEditorMode('blocks');
  };

  // Handle block changes and sync HTML/Text
  const handleBlocksChange = (newBlocks: EmailBlock[]) => {
    setActiveBlocks(newBlocks);
    const compiledHtml = renderBlocksToHtml(newBlocks, {
      emailTitle: formData.subject || 'SNPSUNEXUS Notification',
    });
    const compiledText = renderBlocksToText(newBlocks);
    setFormData((prev) => ({
      ...prev,
      html_content: compiledHtml,
      text_content: compiledText,
    }));
  };

  // Insert token at cursor or append
  const insertVariable = (token: string) => {
    if (editorMode === 'html' && htmlTextareaRef.current) {
      const el = htmlTextareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = formData.html_content;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const updated = `${before}${token}${after}`;
      setFormData((prev) => ({ ...prev, html_content: updated }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    } else if (editorMode === 'text' && plainTextareaRef.current) {
      const el = plainTextareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = formData.text_content;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const updated = `${before}${token}${after}`;
      setFormData((prev) => ({ ...prev, text_content: updated }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    } else {
      // Append to both HTML and text
      setFormData((prev) => ({
        ...prev,
        html_content: prev.html_content.includes('</body>')
          ? prev.html_content.replace('</body>', `<p>${token}</p></body>`)
          : `${prev.html_content}\n<p>${token}</p>`,
        text_content: `${prev.text_content}\n${token}`,
      }));
    }
  };

  // Visual helper insertions
  const insertFormattingSnippet = (type: string) => {
    let snippet = '';
    switch (type) {
      case 'h1':
        snippet = '\n<h1 style="color: #172E58; font-size: 20px; margin: 16px 0 8px 0;">Official Announcement</h1>\n';
        break;
      case 'h2':
        snippet = '\n<h2 style="color: #1456AD; font-size: 16px; margin: 14px 0 6px 0;">Important Update</h2>\n';
        break;
      case 'bold':
        snippet = '<strong>Highlighted Text</strong>';
        break;
      case 'italic':
        snippet = '<em>Notice</em>';
        break;
      case 'button-royal':
        snippet = '\n<div style="text-align: center; margin: 20px 0;"><a href="{{activation_link}}" style="background-color: #1456AD; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open Verification Link</a></div>\n';
        break;
      case 'button-gold':
        snippet = '\n<div style="text-align: center; margin: 20px 0;"><a href="{{activation_link}}" style="background-color: #C69A4C; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Details</a></div>\n';
        break;
      case 'callout':
        snippet = '\n<div style="background-color: #F8FAFC; border-left: 4px solid #1456AD; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0; font-size: 13px; color: #1E293B;"><strong>Notice:</strong> Add key details for your recipients here.</div>\n';
        break;
      case 'divider':
        snippet = '\n<hr style="border: 0; border-top: 1px solid #CBD5E1; margin: 20px 0;" />\n';
        break;
      default:
        break;
    }

    if (snippet) {
      setFormData((prev) => ({
        ...prev,
        html_content: `${prev.html_content}${snippet}`,
      }));
    }
  };

  // Save New Template
  const handleSaveCreate = async () => {
    let finalHtml = formData.html_content;
    let finalText = formData.text_content;
    if (editorMode === 'blocks') {
      finalHtml = renderBlocksToHtml(activeBlocks, {
        emailTitle: formData.subject || 'SNPSUNEXUS Notification',
      });
      finalText = renderBlocksToText(activeBlocks);
    }

    if (!formData.name.trim() || !formData.subject.trim() || !finalHtml.trim()) {
      addToast({
        type: 'error',
        title: 'Validation Failed',
        message: 'Template name, subject line, and content are required.',
      });
      return;
    }

    try {
      await addTemplate({
        name: formData.name.trim(),
        category: formData.category,
        subject: formData.subject.trim(),
        description: formData.description.trim(),
        html_content: finalHtml,
        text_content: finalText || finalHtml.replace(/<[^>]*>/g, '').trim(),
      });
      setIsCreateModalOpen(false);
    } catch {
      // Toast already displayed by AppContext
    }
  };

  // Save Edit (Increments version)
  const handleSaveEdit = async () => {
    if (!editingTemplate) return;

    let finalHtml = formData.html_content;
    let finalText = formData.text_content;
    if (editorMode === 'blocks') {
      finalHtml = renderBlocksToHtml(activeBlocks, {
        emailTitle: formData.subject || 'SNPSUNEXUS Notification',
      });
      finalText = renderBlocksToText(activeBlocks);
    }

    if (!formData.name.trim() || !formData.subject.trim() || !finalHtml.trim()) {
      addToast({
        type: 'error',
        title: 'Validation Failed',
        message: 'Template name, subject line, and content are required.',
      });
      return;
    }

    try {
      await updateTemplate(editingTemplate.id, {
        name: formData.name.trim(),
        category: formData.category,
        subject: formData.subject.trim(),
        description: formData.description.trim(),
        html_content: finalHtml,
        text_content: finalText || finalHtml.replace(/<[^>]*>/g, '').trim(),
        change_summary: formData.change_summary.trim() || 'Updated template content and styling',
      });
      setEditingTemplate(null);
    } catch {
      // Toast already displayed by AppContext
    }
  };

  // Neutral placeholder preview labels (never injects fake user records)
  const previewPlaceholderLabels: Record<string, string> = {
    '{{recipient_name}}': '[Recipient Name]',
    '{{recipient_email}}': '[recipient@domain.com]',
    '{{institution_name}}': 'SNPSUNEXUS',
    '{{designation}}': '[Designation]',
    '{{activation_link}}': 'https://snpsunexus.vercel.app',
    '{{current_year}}': String(new Date().getFullYear()),
  };

  const getInterpolatedHtml = (html: string) => {
    let result = html;
    for (const [token, val] of Object.entries(previewPlaceholderLabels)) {
      result = result.split(token).join(val);
    }
    return result;
  };

  const getInterpolatedText = (text: string) => {
    let result = text;
    for (const [token, val] of Object.entries(previewPlaceholderLabels)) {
      result = result.split(token).join(val);
    }
    return result;
  };

  // Detect unsupported placeholders in preview template
  const previewUnsupportedTokens = useMemo(() => {
    if (!previewTemplate) return [];
    const source = `${previewTemplate.subject} ${previewTemplate.html_content || ''} ${previewTemplate.text_content || ''}`;
    const matches = source.match(/{{[a-zA-Z0-9_]+}}/g) || [];
    const supported = new Set(STANDARD_PLACEHOLDERS as unknown as string[]);
    return [...new Set(matches.filter((m) => !supported.has(m)))];
  }, [previewTemplate]);

  return (
    <div className="space-y-6">
      {/* Top Controls Card: Tabs, Search, Category Filter & Create Action */}
      <Card>
        <div className="space-y-4">
          {/* Row 1: Status Tabs & Primary Action */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[#CBD5E1] pb-3.5">
            {/* Status Tabs: Active vs Archived */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`flex items-center gap-2 px-3.5 min-h-8 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'active'
                    ? 'bg-[#172E58] text-white shadow-xs'
                    : 'bg-[#F4F6FA] text-[#64748B] hover:text-[#172E58] hover:bg-slate-200'
                }`}
              >
                <span>Active Templates</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] leading-none ${
                  statusFilter === 'active' ? 'bg-[#C69A4C] text-white' : 'bg-slate-300 text-slate-700'
                }`}>
                  {activeCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('archived')}
                className={`flex items-center gap-2 px-3.5 min-h-8 py-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'archived'
                    ? 'bg-[#172E58] text-white shadow-xs'
                    : 'bg-[#F4F6FA] text-[#64748B] hover:text-[#172E58] hover:bg-slate-200'
                }`}
              >
                <Archive size={13} className="shrink-0" />
                <span>Archived Templates</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] leading-none ${
                  statusFilter === 'archived' ? 'bg-[#C69A4C] text-white' : 'bg-slate-300 text-slate-700'
                }`}>
                  {archivedCount}
                </span>
              </button>
            </div>

            {/* Top Right: Refresh & Create New Template Button */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw size={13} className={isLoadingTemplates ? 'animate-spin' : ''} />}
                onClick={() => refreshTemplates()}
                title="Synchronize templates with Supabase backend"
              >
                Sync
              </Button>

              <Button
                variant="gold"
                size="sm"
                icon={<Plus size={15} />}
                onClick={openCreateModal}
                className="font-bold shadow-xs"
              >
                Create New Template
              </Button>
            </div>
          </div>

          {/* Row 2: Search Input & Category Filter Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="w-full lg:w-80 xl:w-96 shrink-0">
              <Input
                placeholder="Search templates by name or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-[#64748B] shrink-0 mr-1">Category:</span>
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1.5 min-h-7 rounded-[6px] text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#1456AD] text-white shadow-xs'
                      : 'bg-[#F4F6FA] text-[#64748B] hover:text-[#172E58] hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Templates Gallery Grid / Live Load States */}
      {templateLoadState.status === 'loading' && templates.length === 0 ? (
        <StateNotice kind="loading" title="Loading email templates from backend..." />
      ) : templateLoadState.status === 'auth_required' ? (
        <StateNotice
          kind="auth_required"
          message={templateLoadState.error || 'Sign in as an administrator to view and manage persisted email templates.'}
        />
      ) : templateLoadState.status === 'error' ? (
        <StateNotice
          kind="error"
          message={templateLoadState.error}
          errorCode={templateLoadState.errorCode}
          statusCode={templateLoadState.statusCode}
          onRetry={() => refreshTemplates()}
        />
      ) : filteredTemplates.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-[#EBF3FC] text-[#1456AD] flex items-center justify-center mx-auto mb-3">
            <FileText size={22} />
          </div>
          <h4 className="text-sm font-bold text-[#172E58]">
            {templates.length === 0 ? 'No templates yet' : 'No Templates Found'}
          </h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto mt-1">
            {templates.length === 0
              ? 'Create your first reusable email template using the block builder or HTML editor.'
              : statusFilter === 'archived'
              ? 'No templates have been archived.'
              : 'No templates match your current filter criteria.'}
          </p>
          {statusFilter === 'active' && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="primary"
                size="md"
                icon={<Plus size={14} />}
                onClick={() => openCreateModal('blank')}
              >
                Create Template
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => openCreateModal('premium')}
              >
                Start with Notification Layout
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTemplates.map((tpl) => {
            const isArchived = tpl.is_active === false || !!tpl.archived_at;
            const versionNumber = tpl.version || 1;

            return (
              <Card 
                key={tpl.id} 
                hoverable 
                className={`flex flex-col justify-between border-t-4 transition-all ${
                  isArchived ? 'border-t-[#94A3B8] opacity-80 bg-slate-50/50' : 'border-t-[#1456AD]'
                }`}
              >
                <div>
                  {/* Category, Version Badge & Status Header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#172E58]/10 text-[#172E58] border border-[#172E58]/20">
                        {tpl.category}
                      </span>
                      
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EBF3FC] text-[#1456AD] border border-[#1456AD]/20 flex items-center gap-1">
                        <Layers size={10} />
                        v{versionNumber}
                      </span>

                      {isArchived ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          Archived
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-[#64748B]">
                      Used in <strong className="text-[#172E58]">{tpl.usageCount}</strong> dispatches
                    </span>
                  </div>

                  {/* Template Title & Subject */}
                  <h3 className="text-base font-bold text-[#172E58] hover:text-[#1456AD] transition-colors leading-snug">
                    {tpl.name}
                  </h3>

                  {tpl.description && (
                    <p className="text-xs text-[#64748B] mt-1 line-clamp-1">
                      {tpl.description}
                    </p>
                  )}

                  <div className="mt-2 text-xs text-[#64748B] font-mono bg-white p-2 rounded border border-[#CBD5E1] flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-[#172E58] shrink-0 font-sans text-[11px]">Subject:</span>
                    <span className="truncate text-slate-700">{tpl.subject}</span>
                  </div>

                  {/* Clean Content Preview Box */}
                  <div className="mt-3 p-3 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] text-xs text-[#1E293B] leading-relaxed line-clamp-3 font-sans">
                    {tpl.contentPreview}
                  </div>

                  {/* Placeholders Tokens List */}
                  <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-semibold text-[#64748B]">Placeholders:</span>
                    {(tpl.variables || STANDARD_PLACEHOLDERS).map((v) => (
                      <span
                        key={v}
                        className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[#EBF3FC] text-[#1456AD] border border-[#1456AD]/20"
                        title={PLACEHOLDER_DETAILS[v]?.description || v}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer Metadata & Card Actions */}
                <div className="mt-4 pt-3 border-t border-[#CBD5E1] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
                    <span>Rev v{versionNumber} • {tpl.lastEdited}</span>
                    <span>•</span>
                    <span className="truncate max-w-[120px]" title={tpl.author}>{tpl.author}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                    {/* Preview Button */}
                    <button
                      onClick={() => setPreviewTemplate(tpl)}
                      className="p-1.5 rounded-md text-[#64748B] hover:text-[#1456AD] hover:bg-[#EBF3FC] transition-colors cursor-pointer"
                      title="Preview Template (Desktop & Mobile Simulation)"
                    >
                      <Eye size={15} />
                    </button>

                    {/* Edit Button */}
                    <button
                      onClick={() => openEditModal(tpl)}
                      className="p-1.5 rounded-md text-[#64748B] hover:text-[#172E58] hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit Template (Visual & HTML Mode)"
                    >
                      <Edit3 size={15} />
                    </button>

                    {/* Duplicate Button */}
                    <button
                      onClick={() => duplicateTemplate(tpl.id)}
                      className="p-1.5 rounded-md text-[#64748B] hover:text-[#C69A4C] hover:bg-[#FDF8EE] transition-colors cursor-pointer"
                      title="Duplicate Template"
                    >
                      <Copy size={15} />
                    </button>

                    {/* Archive or Restore Button */}
                    {isArchived ? (
                      <button
                        onClick={() => restoreTemplate(tpl.id)}
                        className="p-1.5 rounded-md text-[#64748B] hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Restore Template to Active Status"
                      >
                        <RotateCcw size={15} />
                      </button>
                    ) : (
                      <button
                        onClick={() => setArchiveTargetId(tpl.id)}
                        className="p-1.5 rounded-md text-[#64748B] hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                        title="Archive Template (Soft Delete)"
                      >
                        <Archive size={15} />
                      </button>
                    )}

                    {/* Version History Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryTemplate(tpl);
                        setSelectedVersionSnapshot(null);
                      }}
                      className="p-1.5 rounded-md text-[#64748B] hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      title="View Version History & Snapshots"
                    >
                      <History size={15} />
                    </button>

                    {/* Permanent Delete Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTargetTemplate(tpl);
                        setDeleteConfirmInput('');
                        setDeleteModalError(null);
                      }}
                      className="p-1.5 rounded-md text-[#64748B] hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Permanently Delete Template"
                      aria-label={`Permanently delete ${tpl.name}`}
                    >
                      <Trash2 size={15} />
                    </button>

                    {/* Use in Compose Button */}
                    {!isArchived && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Send size={11} />}
                        onClick={() => useTemplateInCompose(tpl.id, tpl.version || 1)}
                        className="ml-1 text-[11px] py-1 px-2.5 font-semibold h-7"
                        title="Load exact template version into Compose Email"
                      >
                        Use
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Realistic Responsive Preview Modal (Desktop & Mobile, HTML & Text) */}
      {previewTemplate && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewTemplate(null)}
          title={`Preview: ${previewTemplate.name}`}
          subtitle={`Version v${previewTemplate.version || 1} • Category: ${previewTemplate.category} • Author: ${previewTemplate.author}`}
          maxWidth="3xl"
          footer={
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
              <Button variant="outline" size="md" onClick={() => setPreviewTemplate(null)}>
                Close
              </Button>
              <Button 
                variant="primary" 
                size="md" 
                icon={<Send size={14} />}
                onClick={() => {
                  const id = previewTemplate.id;
                  const version = previewTemplate.version || 1;
                  setPreviewTemplate(null);
                  useTemplateInCompose(id, version);
                }}
              >
                Use in Compose Email
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs text-[#1E293B]">
            {/* View Mode Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-[#F4F6FA] p-2.5 rounded-lg border border-[#CBD5E1]">
              {/* Device Toggle */}
              <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 bg-white p-1 rounded-md border border-[#CBD5E1] w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-[#172E58] text-white shadow-xs'
                      : 'text-[#64748B] hover:text-[#172E58]'
                  }`}
                >
                  <Monitor size={13} />
                  <span>Desktop (650px)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-[#172E58] text-white shadow-xs'
                      : 'text-[#64748B] hover:text-[#172E58]'
                  }`}
                >
                  <Smartphone size={13} />
                  <span>Mobile (375px)</span>
                </button>
              </div>

              {/* Format Toggle */}
              <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 bg-white p-1 rounded-md border border-[#CBD5E1] w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPreviewFormat('html')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    previewFormat === 'html'
                      ? 'bg-[#1456AD] text-white shadow-xs'
                      : 'text-[#64748B] hover:text-[#172E58]'
                  }`}
                >
                  HTML Format
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFormat('text')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    previewFormat === 'text'
                      ? 'bg-[#1456AD] text-white shadow-xs'
                      : 'text-[#64748B] hover:text-[#172E58]'
                  }`}
                >
                  Plain Text
                </button>
              </div>
            </div>

            {/* Warning if unsupported placeholders are found */}
            {previewUnsupportedTokens.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-amber-800 text-xs">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong>Unsupported Merge Placeholders Detected:</strong>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    This template contains tokens not recognized by the central registry: {previewUnsupportedTokens.join(', ')}. Unregistered tokens will not be interpolated automatically during live dispatch.
                  </p>
                </div>
              </div>
            )}

            {/* Rendered Subject Line Banner */}
            <div className="p-3 bg-white rounded-lg border border-[#CBD5E1] space-y-1">
              <span className="text-[#64748B] font-semibold block text-[11px]">Interpolated Subject Header:</span>
              <p className="font-mono text-[#172E58] font-medium">
                {getInterpolatedText(previewTemplate.subject)}
              </p>
            </div>

            {/* Rendered Envelope Container */}
            <div className="flex justify-center bg-slate-100 p-2.5 sm:p-4 rounded-xl border border-[#CBD5E1] overflow-x-auto min-h-[260px] sm:min-h-[380px]">
              {previewFormat === 'html' ? (
                <div 
                  className={`bg-white rounded-xl shadow-sm border border-[#CBD5E1] overflow-hidden transition-all duration-300 flex justify-center shrink-0 ${
                    previewDevice === 'mobile' ? 'w-full max-w-[375px]' : 'w-full max-w-[650px]'
                  }`}
                >
                  {previewTemplate.html_content ? (
                    <iframe
                      title="Email Template Preview"
                      srcDoc={getInterpolatedHtml(previewTemplate.html_content)}
                      className="w-full border-0 h-[320px] sm:h-[440px]"
                      style={{
                        width: previewDevice === 'mobile' ? '375px' : '100%',
                        maxWidth: '100%',
                        display: 'block',
                        background: '#FFFFFF',
                      }}
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    /* Plain Letterhead Layout */
                    <div className="p-4 sm:p-5 space-y-4 w-full">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#172E58]">
                        <BrandWordmark size="sm" theme="light" showSubtitle={false} />
                        <span className="text-[10px] font-bold text-[#C69A4C] bg-[#FDF8EE] px-2 py-0.5 rounded border border-[#C69A4C]/30 whitespace-nowrap">
                          STANDARD FORMAT
                        </span>
                      </div>

                      <div className="text-xs text-[#1E293B] leading-relaxed whitespace-pre-wrap font-sans">
                        {getInterpolatedText(previewTemplate.contentPreview)}
                      </div>

                      <div className="pt-3 border-t border-[#CBD5E1] text-[10px] text-[#64748B] flex items-center justify-between">
                        <span>SNPSUNEXUS</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Plain Text Preview Container */
                <div 
                  className={`p-4 font-mono text-xs text-[#1E293B] whitespace-pre-wrap leading-relaxed bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] w-full ${
                    previewDevice === 'mobile' ? 'max-w-[375px]' : 'max-w-[650px]'
                  }`}
                >
                  {getInterpolatedText(previewTemplate.text_content || previewTemplate.contentPreview)}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Archive Confirmation Modal (Soft Delete) */}
      {archiveTargetId && (
        <Modal
          isOpen={true}
          onClose={() => setArchiveTargetId(null)}
          title="Archive Email Template"
          subtitle="Are you sure you want to archive this template?"
          maxWidth="sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setArchiveTargetId(null)}>
                Cancel
              </Button>
              <Button 
                variant="danger" 
                size="sm" 
                icon={<Archive size={14} />}
                onClick={async () => {
                  await archiveTemplate(archiveTargetId);
                  setArchiveTargetId(null);
                }}
              >
                Archive Template
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-xs text-[#1E293B]">
            <p>
              This template will be removed from the active gallery and moved to the <strong>Archived</strong> tab.
            </p>
            <p className="text-[#64748B]">
              <strong>Audit Integrity:</strong> Previous campaigns, sending queues, and historical activity logs referencing this template will remain completely intact. You can restore this template at any time.
            </p>
          </div>
        </Modal>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deleteTargetTemplate && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!isDeletingTemplate) {
              setDeleteTargetTemplate(null);
              setDeleteConfirmInput('');
              setDeleteModalError(null);
            }
          }}
          title="Permanently Delete Template?"
          subtitle={`${deleteTargetTemplate.name} • Version v${deleteTargetTemplate.version || 1}`}
          maxWidth="md"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isDeletingTemplate}
                onClick={() => {
                  setDeleteTargetTemplate(null);
                  setDeleteConfirmInput('');
                  setDeleteModalError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={14} />}
                isLoading={isDeletingTemplate}
                disabled={
                  isDeletingTemplate ||
                  ((deleteTargetTemplate.usageCount || 0) > 0 &&
                    deleteConfirmInput.trim() !== deleteTargetTemplate.name.trim())
                }
                onClick={async () => {
                  if (isDeletingTemplate) return;
                  setIsDeletingTemplate(true);
                  setDeleteModalError(null);
                  try {
                    const targetId = deleteTargetTemplate.id;
                    const res = await deleteTemplate(targetId);
                    if (res.success) {
                      if (previewTemplate?.id === targetId) setPreviewTemplate(null);
                      if (editingTemplate?.id === targetId) setEditingTemplate(null);
                      if (historyTemplate?.id === targetId) {
                        setHistoryTemplate(null);
                        setSelectedVersionSnapshot(null);
                      }
                      setDeleteTargetTemplate(null);
                      setDeleteConfirmInput('');
                      setDeleteModalError(null);
                    } else {
                      setDeleteModalError(res.error || 'Template could not be permanently deleted.');
                    }
                  } finally {
                    setIsDeletingTemplate(false);
                  }
                }}
              >
                Permanently Delete
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs text-[#1E293B]">
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Irreversible Action</p>
                <p>
                  Permanently deleting <strong>{deleteTargetTemplate.name}</strong> (v{deleteTargetTemplate.version || 1}) will immediately erase the template and its stored version history. Unlike Archiving, it cannot be restored.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] space-y-1">
              <p>
                <strong>Historical Data Safety:</strong> Past campaigns that hold immutable template snapshots and all historical Email Activity / delivery logs stay preserved.
              </p>
              <p>
                Deletion is automatically blocked if an active or incomplete campaign still depends on this live template without a complete snapshot.
              </p>
            </div>

            {(deleteTargetTemplate.usageCount || 0) > 0 && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-semibold text-[#172E58]">
                  Referenced in {deleteTargetTemplate.usageCount} dispatch(es). Type{' '}
                  <span className="font-mono text-rose-700 bg-rose-50 px-1 py-0.5 rounded">
                    {deleteTargetTemplate.name}
                  </span>{' '}
                  to confirm:
                </label>
                <Input
                  placeholder={deleteTargetTemplate.name}
                  value={deleteConfirmInput}
                  disabled={isDeletingTemplate}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                />
              </div>
            )}

            {deleteModalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-[11px] font-medium">
                {deleteModalError}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Version History Modal */}
      {historyTemplate && (
        <Modal
          isOpen={true}
          onClose={() => {
            setHistoryTemplate(null);
            setSelectedVersionSnapshot(null);
          }}
          title={`Version History: ${historyTemplate.name}`}
          subtitle={`Current Version: v${historyTemplate.version || 1} • Total Revisions: ${(historyTemplate.versions?.length || 0) + 1}`}
          maxWidth="xl"
          footer={
            <Button 
              variant="primary" 
              size="sm" 
              onClick={() => {
                setHistoryTemplate(null);
                setSelectedVersionSnapshot(null);
              }}
            >
              Close History
            </Button>
          }
        >
          <div className="space-y-4 text-xs text-[#1E293B]">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Revision List (5 cols) */}
              <div className="md:col-span-5 space-y-2 border-b md:border-b-0 md:border-r border-[#CBD5E1] pb-3 md:pb-0 md:pr-4">
                <span className="font-bold text-[#172E58] block mb-2">Immutable Version Snapshots:</span>
                
                {/* Active Version Item */}
                <div 
                  onClick={() => setSelectedVersionSnapshot(null)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                    selectedVersionSnapshot === null
                      ? 'bg-[#EBF3FC] border-[#1456AD]'
                      : 'bg-white border-[#CBD5E1] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1456AD]">v{historyTemplate.version || 1} (Current)</span>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Updated: {historyTemplate.lastEdited}
                  </p>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">
                    Live operational version
                  </p>
                </div>

                {/* Past Versions */}
                {(historyTemplate.versions || []).map((ver) => (
                  <div
                    key={ver.id || ver.version}
                    onClick={() => setSelectedVersionSnapshot(ver)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                      selectedVersionSnapshot?.version === ver.version
                        ? 'bg-[#EBF3FC] border-[#1456AD]'
                        : 'bg-white border-[#CBD5E1] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#172E58]">v{ver.version}</span>
                      <span className="text-[10px] text-[#64748B] font-mono">
                        {ver.created_at ? ver.created_at.split('T')[0] : 'Historical'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">
                      {ver.change_summary || 'Standard revision snapshot'}
                    </p>
                  </div>
                ))}
              </div>

              {/* Version Snapshot Detail (7 cols) */}
              <div className="md:col-span-7 space-y-3">
                {selectedVersionSnapshot ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#172E58]">Snapshot v{selectedVersionSnapshot.version}</span>
                        <span className="text-[10px] text-[#64748B]">{selectedVersionSnapshot.created_at}</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">
                        <strong>Change Notes:</strong> {selectedVersionSnapshot.change_summary || 'None provided'}
                      </p>
                      <p className="text-[11px] text-[#172E58] font-mono">
                        <strong>Subject:</strong> {selectedVersionSnapshot.subject}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-[#CBD5E1] max-h-60 overflow-y-auto">
                      <span className="font-semibold text-[11px] text-[#64748B] block mb-1">Body Content Preview:</span>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                        {selectedVersionSnapshot.text_content || selectedVersionSnapshot.html_content?.replace(/<[^>]*>/g, '')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-[#EBF3FC] rounded-lg border border-[#1456AD]/20 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#1456AD]">Current Live Version: v{historyTemplate.version || 1}</span>
                        <Badge variant="success">Active</Badge>
                      </div>
                      <p className="text-[11px] text-[#172E58] font-mono">
                        <strong>Subject:</strong> {historyTemplate.subject}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-[#CBD5E1] max-h-60 overflow-y-auto">
                      <span className="font-semibold text-[11px] text-[#64748B] block mb-1">Live Body Preview:</span>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                        {historyTemplate.text_content || historyTemplate.contentPreview}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Edit Template Modal (Visual Block Builder & HTML Source Mode) */}
      {(isCreateModalOpen || editingTemplate) && (
        <Modal
          isOpen={true}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingTemplate(null);
          }}
          title={
            editingTemplate 
              ? `Edit Template: ${editingTemplate.name} (v${editingTemplate.version || 1})`
              : 'Create Email Template'
          }
          subtitle="Author reusable correspondence with validated placeholder merge tags"
          maxWidth="4xl"
          footer={
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 w-full">
              <span className="text-[11px] text-[#64748B]">
                {editingTemplate ? 'Saving creates a new immutable revision snapshot.' : 'Saved as version 1.'}
              </span>
              <div className="flex items-center justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingTemplate(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={editingTemplate ? handleSaveEdit : handleSaveCreate}
                  className="font-bold"
                >
                  {editingTemplate ? 'Save Revision' : 'Create Template'}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs text-[#1E293B]">
            {/* Compact 2x2 Metadata Form Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <Input
                  label="Template Name"
                  placeholder="e.g. Monthly Service Notification"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="sm:col-span-5">
                <Select
                  label="Category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                >
                  <option value="General Notifications">General Notifications</option>
                  <option value="Notifications">Notifications</option>
                  <option value="Product Updates">Product Updates</option>
                  <option value="Account Alerts">Account Alerts</option>
                  <option value="Operational Announcements">Operational Announcements</option>
                </Select>
              </div>

              <div className="sm:col-span-7">
                <Input
                  label="Email Subject Line"
                  placeholder="e.g. Account Update — {{recipient_name}}"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>

              <div className="sm:col-span-5">
                <Input
                  label="Brief Description / Purpose"
                  placeholder="e.g. Sent to verified contacts for updates."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            {/* Editor Mode Tabs & Flexible Surface */}
            <div className="border border-[#CBD5E1] rounded-[10px] overflow-hidden bg-white shadow-2xs">
              {/* Editor Header Bar with Responsive Wrapping Visual Block Builder Tabs */}
              <div className="bg-[#F8FAFC] border-b border-[#CBD5E1] p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-[#CBD5E1] w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setEditorMode('blocks')}
                    className={`px-2.5 sm:px-3 py-1.5 min-h-8 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      editorMode === 'blocks'
                        ? 'bg-[#172E58] text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#172E58]'
                    }`}
                  >
                    <Layers size={13} className="shrink-0" />
                    <span>Block Builder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('preview')}
                    className={`px-2.5 sm:px-3 py-1.5 min-h-8 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      editorMode === 'preview'
                        ? 'bg-[#1456AD] text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#172E58]'
                    }`}
                  >
                    <Eye size={13} className="shrink-0" />
                    <span>Live Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('html')}
                    className={`px-2.5 sm:px-3 py-1.5 min-h-8 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      editorMode === 'html'
                        ? 'bg-[#1456AD] text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#172E58]'
                    }`}
                  >
                    <Code size={13} className="shrink-0" />
                    <span>HTML Source</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('text')}
                    className={`px-2.5 sm:px-3 py-1.5 min-h-8 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      editorMode === 'text'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#172E58]'
                    }`}
                  >
                    <FileText size={13} className="shrink-0" />
                    <span>Plain Text</span>
                  </button>
                </div>

                {/* Sub-controls when in Live Preview mode */}
                {editorMode === 'preview' && (
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-[#CBD5E1] self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-2.5 py-1 min-h-7 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        previewDevice === 'desktop'
                          ? 'bg-[#172E58] text-white'
                          : 'text-[#64748B] hover:text-[#172E58]'
                      }`}
                    >
                      <Monitor size={12} /> Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-2.5 py-1 min-h-7 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        previewDevice === 'mobile'
                          ? 'bg-[#172E58] text-white'
                          : 'text-[#64748B] hover:text-[#172E58]'
                      }`}
                    >
                      <Smartphone size={12} /> Mobile
                    </button>
                  </div>
                )}
              </div>

              {/* Editor Workspace Surface */}
              <div className="p-3">
                {/* 1. VISUAL BLOCK BUILDER MODE */}
                {editorMode === 'blocks' && (
                  <BlockBasedEditor
                    blocks={activeBlocks}
                    onChange={handleBlocksChange}
                    onInsertVariableToActive={insertVariable}
                  />
                )}

                {/* 2. LIVE EMAIL PREVIEW MODE */}
                {editorMode === 'preview' && (
                  <div className="p-2.5 sm:p-4 bg-slate-100/80 rounded-xl overflow-x-auto flex justify-center">
                    <div
                      className={`transition-all bg-white rounded-xl shadow-sm border border-[#CBD5E1] overflow-hidden flex justify-center shrink-0 ${
                        previewDevice === 'mobile'
                          ? 'w-[375px]'
                          : 'w-full max-w-[620px]'
                      }`}
                    >
                      <iframe
                        title="Live Template Preview"
                        srcDoc={getInterpolatedHtml(formData.html_content)}
                        className="w-full border-0 h-[320px] sm:h-[420px]"
                        style={{
                          width: previewDevice === 'mobile' ? '375px' : '100%',
                          display: 'block',
                          background: '#FFFFFF',
                        }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                )}

                {/* 3. HTML SOURCE CODE MODE */}
                {editorMode === 'html' && (
                  <div className="space-y-2">
                    {/* Collapsible Variables Quick Strip */}
                    <div className="border border-[#CBD5E1] rounded-lg overflow-hidden bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setIsVariablesDrawerOpen(!isVariablesDrawerOpen)}
                        className="w-full px-3 py-1.5 flex items-center justify-between text-left text-xs font-bold text-[#172E58] cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Sparkles size={13} className="text-[#C69A4C]" />
                          Insert Personalization Variable
                        </span>
                        <span className="text-[10px] text-[#64748B]">{isVariablesDrawerOpen ? 'Hide' : 'Show (6 variables)'}</span>
                      </button>
                      {isVariablesDrawerOpen && (
                        <div className="p-2 border-t border-[#CBD5E1] bg-white flex flex-wrap gap-1.5">
                          {STANDARD_PLACEHOLDERS.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => insertVariable(v)}
                              className="px-2 py-0.5 text-[10px] font-mono bg-slate-50 hover:bg-[#1456AD] hover:text-white rounded border border-[#CBD5E1] text-[#172E58] cursor-pointer"
                            >
                              + {v}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <textarea
                      ref={htmlTextareaRef}
                      rows={14}
                      value={formData.html_content}
                      onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                      className="w-full p-3 font-mono text-xs text-[#1E293B] bg-white border border-[#CBD5E1] rounded-lg leading-relaxed focus:outline-none focus:border-[#1456AD]"
                      placeholder="Type or paste HTML email code..."
                    />
                  </div>
                )}

                {/* 4. PLAIN TEXT FALLBACK MODE */}
                {editorMode === 'text' && (
                  <div className="space-y-2">
                    <textarea
                      ref={plainTextareaRef}
                      rows={14}
                      value={formData.text_content}
                      onChange={(e) => setFormData({ ...formData, text_content: e.target.value })}
                      className="w-full p-3 font-mono text-xs text-[#1E293B] bg-white border border-[#CBD5E1] rounded-lg leading-relaxed focus:outline-none focus:border-[#1456AD]"
                      placeholder="Enter clean plain-text fallback content..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Revision Change Summary (Required when editing) */}
            {editingTemplate && (
              <Input
                label="Revision Notes / Change Summary"
                placeholder="e.g. Updated layout formatting and subject copy"
                value={formData.change_summary}
                onChange={(e) => setFormData({ ...formData, change_summary: e.target.value })}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
