import React, { useState, useMemo, useEffect } from 'react';
import { 
  Send, 
  Eye, 
  Edit3, 
  RotateCcw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FileCode2,
  Unlink,
  Link2
} from 'lucide-react';
import { Card, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { TemplateService } from '../services/templateService';
import { getApiUrl } from '../services/apiConfig';

function escapeHtmlSafe(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolatePlaceholders(
  source: string,
  values: Record<string, string>,
  escapeForHtml: boolean
): string {
  if (!source) return '';
  let out = source;
  for (const [key, rawVal] of Object.entries(values)) {
    const val = String(rawVal || '');
    const safeVal =
      escapeForHtml && key !== 'activation_link'
        ? escapeHtmlSafe(val)
        : val.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    out = out.replace(regex, escapeForHtml ? safeVal : val);
  }
  return out;
}

function buildBrandedFreeformHtml(subjectLine: string, bodyText: string): string {
  const escapedSubject = escapeHtmlSafe(subjectLine || 'Official Notification');
  const escapedBody = escapeHtmlSafe(bodyText).replace(/\n/g, '<br>');
  const year = String(new Date().getFullYear());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6FA;padding:28px 12px;">
    <tr>
      <td align="center" valign="top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #CBD5E1;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(23,46,88,0.08);">
          <tr>
            <td style="padding:18px 24px;background-color:#FFFFFF;border-bottom:1px solid #EEF2F6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;padding-right:12px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="34" height="40" style="display:block;width:34px;height:40px;object-fit:contain;" />
                        </td>
                        <td style="border-left:2px solid #172E58;padding-left:12px;vertical-align:middle;">
                          <span style="font-size:18px;font-weight:800;color:#172E58;letter-spacing:0.5px;">SNPSUNEXUS</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:11px;font-style:italic;color:#64748B;font-weight:500;">Smarter Communication. Greater Impact.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#172E58;padding:22px 26px;color:#FFFFFF;">
              <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#C69A4C;text-transform:uppercase;margin-bottom:6px;">EMAIL NOTIFICATION</div>
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;line-height:1.35;">${escapedSubject}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:26px;font-size:14px;line-height:1.65;color:#1E293B;">
              ${escapedBody || '<span style="color:#94A3B8;">Message body preview...</span>'}
              <div style="margin-top:24px;font-size:13px;line-height:1.6;color:#1E293B;">
                <p style="margin:0 0 4px 0;color:#64748B;">Best regards,</p>
                <p style="margin:0;font-weight:700;color:#172E58;">SNPSUNEXUS</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#172E58;border-top:3px solid #C69A4C;padding:16px 26px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="22" height="26" style="display:inline-block;vertical-align:middle;margin-right:8px;" />
                    <span style="font-size:13px;font-weight:700;color:#FFFFFF;vertical-align:middle;">SNPSUNEXUS</span>
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:11px;color:#E2E8F0;">&copy; ${year} SNPSUNEXUS. All rights reserved.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const ComposeEmailView: React.FC = () => {
  const {
    templates,
    templateLoadState,
    refreshTemplates,
    addToast,
    selectedComposeTemplateId,
    setSelectedComposeTemplateId,
    selectedComposeTemplateVersion,
    setSelectedComposeTemplateVersion,
  } = useApp();
  const { user, session, openAuthModal } = useAuth();

  const [recipient, setRecipient] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [designation, setDesignation] = useState('');
  const [activationLink, setActivationLink] = useState('');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<number | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [customHtmlTemplate, setCustomHtmlTemplate] = useState<string | null>(null);
  const [templateRemovedNotice, setTemplateRemovedNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [isSending, setIsSending] = useState(false);
  const [isLiveSendNoticeOpen, setIsLiveSendNoticeOpen] = useState(false);
  const [lastSmtpResult, setLastSmtpResult] = useState<any>(null);

  // Filter active templates for compose selector
  const activeTemplates = useMemo(() => {
    return templates.filter((t) => t.is_active !== false && !t.archived_at);
  }, [templates]);

  // Apply persisted template & exact version helper
  const applyTemplateById = React.useCallback(async (tplId: string, targetVersion: number | null = null) => {
    let found = templates.find((t) => t.id === tplId) || null;

    // Attempt fetching full persisted record & version history from backend so exact HTML/version is preserved
    try {
      const apiRes = await TemplateService.getTemplateById(tplId);
      if (apiRes.success && apiRes.template) {
        found = apiRes.template;
      }
    } catch {
      // Fallback cleanly to local synced copy if offline
    }

    if (!found) {
      addToast({
        type: 'error',
        title: 'Template Not Found',
        message: 'Requested saved template could not be loaded.',
      });
      return;
    }

    // If a specific version number was requested, resolve that exact snapshot strictly
    let effectiveTemplate = found;
    if (targetVersion && Number(targetVersion) !== Number(found.version || 1)) {
      const snap = (found.versions || []).find((v) => Number(v.version) === Number(targetVersion));
      if (!snap) {
        addToast({
          type: 'error',
          title: 'Template Version Unavailable',
          message: `Requested version v${targetVersion} of "${found.name}" could not be found.`,
        });
        return;
      }
      effectiveTemplate = {
        ...found,
        version: snap.version,
        name: snap.name || found.name,
        subject: snap.subject,
        html_content: snap.html_content,
        text_content: snap.text_content,
      };
    }

    if (!effectiveTemplate.html_content || !effectiveTemplate.html_content.trim()) {
      addToast({
        type: 'warning',
        title: 'Missing HTML Layout',
        message: `"${effectiveTemplate.name}" does not contain saved HTML content. Only plain-text fallback is available.`,
      });
    }

    setSelectedTemplateId(found.id);
    setSelectedTemplateVersion(effectiveTemplate.version || 1);
    setSelectedTemplateName(effectiveTemplate.name);
    setSubject(effectiveTemplate.subject);
    setMessageBody(effectiveTemplate.text_content || effectiveTemplate.contentPreview || '');
    setCustomHtmlTemplate(effectiveTemplate.html_content || null);
    setTemplateRemovedNotice(null);

    addToast({
      type: 'info',
      title: 'Template Loaded',
      message: `Loaded "${effectiveTemplate.name}" (v${effectiveTemplate.version || 1}) with full HTML layout.`,
    });
  }, [templates, addToast]);

  // Handle preloaded template passed from Email Templates ("Use in Compose Email")
  useEffect(() => {
    if (selectedComposeTemplateId) {
      const idToLoad = selectedComposeTemplateId;
      const verToLoad = selectedComposeTemplateVersion;
      setSelectedComposeTemplateId(null);
      setSelectedComposeTemplateVersion(null);
      applyTemplateById(idToLoad, verToLoad);
    }
  }, [
    selectedComposeTemplateId,
    selectedComposeTemplateVersion,
    setSelectedComposeTemplateId,
    setSelectedComposeTemplateVersion,
    applyTemplateById,
  ]);

  // Preserve unsent draft cleanly if an attached template is permanently deleted elsewhere
  useEffect(() => {
    if (
      selectedTemplateId &&
      templateLoadState.status === 'loaded' &&
      !templates.some((t) => t.id === selectedTemplateId)
    ) {
      const removedName = selectedTemplateName || 'Previously attached template';
      setSelectedTemplateId('');
      setSelectedTemplateVersion(null);
      setSelectedTemplateName('');
      setTemplateRemovedNotice(
        `"${removedName}" was permanently deleted from Email Templates. Your draft subject and HTML/text body were preserved as custom content.`
      );
      addToast({
        type: 'warning',
        title: 'Template No Longer Saved',
        message: `"${removedName}" was deleted, but your active email draft has been preserved.`,
      });
    }
  }, [selectedTemplateId, selectedTemplateName, templateLoadState.status, templates, addToast]);

  // Validation errors
  const [errors, setErrors] = useState<{ recipient?: string; recipientName?: string; subject?: string; body?: string }>({});

  const placeholderContext = useMemo(() => ({
    recipient_name: recipientName.trim() || '[Recipient Name]',
    recipient_email: recipient.trim() || '[Recipient Email]',
    institution_name: 'SNPSUNEXUS',
    designation: designation.trim() || '[Designation]',
    activation_link: activationLink.trim() || 'https://snpsunexus.vercel.app',
    current_year: String(new Date().getFullYear()),
  }), [recipientName, recipient, designation, activationLink]);

  const availableVariables = [
    { token: '{{recipient_name}}', label: 'Recipient Name', sample: placeholderContext.recipient_name },
    { token: '{{recipient_email}}', label: 'Recipient Email', sample: placeholderContext.recipient_email },
    { token: '{{institution_name}}', label: 'Brand Name', sample: 'SNPSUNEXUS' },
    { token: '{{designation}}', label: 'Designation / Role', sample: placeholderContext.designation },
    { token: '{{activation_link}}', label: 'Action URL', sample: placeholderContext.activation_link },
    { token: '{{current_year}}', label: 'Current Year', sample: placeholderContext.current_year },
  ];

  // Template dropdown change handler
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tplId = e.target.value;
    if (!tplId) {
      setSelectedTemplateId('');
      setSelectedTemplateVersion(null);
      setSelectedTemplateName('');
      setCustomHtmlTemplate(null);
      return;
    }
    applyTemplateById(tplId, null);
  };

  // Detach HTML template if admin wants to convert back to pure free-form email
  const handleDetachTemplate = () => {
    setSelectedTemplateId('');
    setSelectedTemplateVersion(null);
    setSelectedTemplateName('');
    setCustomHtmlTemplate(null);
    addToast({
      type: 'info',
      title: 'Template Detached',
      message: 'Switched to custom free-form message composer.',
    });
  };

  // Insert token helper
  const insertVariable = (token: string) => {
    setMessageBody((prev) => prev + ' ' + token + ' ');
  };

  // Form Validation
  const validateForm = () => {
    const newErrors: { recipient?: string; recipientName?: string; subject?: string; body?: string } = {};

    if (!recipient.trim()) {
      newErrors.recipient = 'Recipient email address is required.';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipient.trim())) {
        newErrors.recipient = 'Please enter a valid email address.';
      }
    }

    if (!recipientName.trim()) {
      newErrors.recipientName = 'Recipient name is required.';
    }

    if (!subject.trim()) {
      newErrors.subject = 'Email subject line is required.';
    }

    if (!customHtmlTemplate && !messageBody.trim()) {
      newErrors.body = 'Email body message cannot be empty.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Live interpolated Subject, Plain Text, and Full HTML Card
  const renderedSubject = useMemo(() => {
    return interpolatePlaceholders(subject, placeholderContext, false);
  }, [subject, placeholderContext]);

  const renderedMessage = useMemo(() => {
    return interpolatePlaceholders(messageBody, placeholderContext, false);
  }, [messageBody, placeholderContext]);

  const renderedLiveHtml = useMemo(() => {
    if (customHtmlTemplate && customHtmlTemplate.trim()) {
      return interpolatePlaceholders(customHtmlTemplate, placeholderContext, true);
    }
    return buildBrandedFreeformHtml(renderedSubject, renderedMessage);
  }, [customHtmlTemplate, placeholderContext, renderedSubject, renderedMessage]);

  const handleSend = async () => {
    if (!validateForm()) {
      addToast({
        type: 'error',
        title: 'Validation Incomplete',
        message: 'Please resolve form errors before proceeding.',
      });
      return;
    }

    if (!user || !session?.access_token) {
      addToast({
        type: 'warning',
        title: 'Authentication Required',
        message: 'Please sign in as an administrator to dispatch emails.',
      });
      openAuthModal();
      return;
    }

    await performLiveSend();
  };

  const performLiveSend = async () => {
    setIsSending(true);
    setLastSmtpResult(null);

    const idempotencyKey = `snpsunexus_send_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const payload = {
        ...(selectedTemplateId ? {
          template_id: selectedTemplateId,
          template_version: selectedTemplateVersion || 1,
        } : {}),
        recipient_name: recipientName.trim(),
        recipient_email: recipient.trim().toLowerCase(),
        designation: designation.trim() || 'Member',
        activation_link: activationLink.trim() || 'https://snpsunexus.vercel.app/verify',
        institution_name: 'SNPSUNEXUS',
        raw_subject: subject.trim(),
        subject: renderedSubject.trim(),
        text_content: renderedMessage || `${renderedSubject}\n\nRecipient: ${recipientName.trim()}`,
        html_content: renderedLiveHtml,
        campaign_name: selectedTemplateName
          ? `${selectedTemplateName} (v${selectedTemplateVersion || 1})`
          : 'Individual Transactional Dispatch',
        idempotency_key: idempotencyKey,
      };

      const response = await fetch(getApiUrl('/emails/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      setLastSmtpResult(data);

      if (response.status === 200 && data.success) {
        addToast({
          type: 'success',
          title: 'SMTP Accepted',
          message: `Accepted by Gmail SMTP from SNPSUNEXUS. (Message ID: ${data.data?.smtp_message_id || '250 OK'}).`,
        });
        setIsLiveSendNoticeOpen(true);
      } else if (response.status === 502) {
        addToast({
          type: 'error',
          title: 'SMTP Rejected',
          message: data.error?.reason || 'The mail server rejected message transmission.',
        });
      } else if (response.status === 504) {
        addToast({
          type: 'warning',
          title: 'Outcome Unknown',
          message: 'Connection dropped during transmission. Flagged for audit.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Dispatch Failed',
          message: data.error?.message || `Server returned error (${response.status}).`,
        });
      }
    } catch (err: any) {
      console.error('[Live Send Error]:', err);
      addToast({
        type: 'error',
        title: 'Connection Error',
        message: err.message || 'Could not communicate with backend email service.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setRecipient('');
    setRecipientName('');
    setDesignation('');
    setActivationLink('');
    setSubject('');
    setMessageBody('');
    setSelectedTemplateId('');
    setSelectedTemplateVersion(null);
    setSelectedTemplateName('');
    setCustomHtmlTemplate(null);
    setTemplateRemovedNotice(null);
    setErrors({});
    addToast({
      type: 'info',
      title: 'Composer Reset',
      message: 'All editor fields have been cleared.',
    });
  };

  const wordCount = messageBody.trim() ? messageBody.trim().split(/\s+/).length : 0;
  const charCount = messageBody.length;

  return (
    <div className="space-y-6">
      {/* View Header with Mode Toggles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[#172E58]">Single Email Dispatch</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Draft correspondence with saved HTML template fidelity and dynamic variable interpolation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Tab buttons for mobile/desktop switcher */}
          <div className="flex items-center p-1 bg-white border border-[#CBD5E1] rounded-[10px] shadow-2xs min-h-10">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 min-h-8 rounded-[7px] text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'editor'
                  ? 'bg-[#1456AD] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172E58]'
              }`}
            >
              <Edit3 size={14} className="shrink-0" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 min-h-8 rounded-[7px] text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'preview'
                  ? 'bg-[#1456AD] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172E58]'
              }`}
            >
              <Eye size={14} className="shrink-0" />
              <span>Live Preview</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="md"
            icon={<RotateCcw size={14} />}
            onClick={handleReset}
            className="cursor-pointer"
          >
            Clear
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Send size={14} />}
            isLoading={isSending}
            onClick={handleSend}
            className="cursor-pointer font-semibold shadow-xs"
          >
            Dispatch Email
          </Button>
        </div>
      </div>

      {/* Two Column Grid: Editor (Left) & Live HTML Card Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Form Editor (6 cols) */}
        <div className={`lg:col-span-6 min-w-0 flex flex-col ${activeTab === 'preview' ? 'hidden lg:flex' : 'flex'}`}>
          <Card className="h-full flex flex-col">
            <CardHeader
              title="Message Composition"
              subtitle="Enter recipient details and template personalization values"
              action={
                <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <span className="font-semibold text-[#172E58]">Status:</span>
                  <Badge variant={user ? 'success' : 'neutral'} size="sm">
                    {user ? 'Authenticated' : 'Sign In Required'}
                  </Badge>
                </div>
              }
            />

            <div className="space-y-4">
              {/* Template Selection Dropdown */}
              <div>
                <Select
                  label={
                    <span className="flex items-center justify-between gap-2 w-full">
                      <span>Apply Saved Template</span>
                      <span className="text-[11px] font-normal text-[#64748B]">Preserves HTML &amp; version</span>
                    </span>
                  }
                  value={selectedTemplateId}
                  onChange={handleTemplateChange}
                >
                  <option value="">
                    {activeTemplates.length === 0
                      ? templateLoadState.status === 'auth_required'
                        ? '-- Sign in to load saved templates --'
                        : '-- No saved templates available --'
                      : '-- Choose a template --'}
                  </option>
                  {activeTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (v{t.version || 1})
                    </option>
                  ))}
                </Select>
                {templateLoadState.status === 'error' && (
                  <p className="mt-1 text-[11px] text-rose-600 flex items-center justify-between gap-2">
                    <span>Templates failed to load: {templateLoadState.error}</span>
                    <button
                      type="button"
                      onClick={() => refreshTemplates()}
                      className="font-semibold underline cursor-pointer shrink-0"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>

              {/* Active HTML Template Safeguard Indicator */}
              {selectedTemplateId && customHtmlTemplate && (
                <div className="p-3 rounded-xl bg-[#EEF4FF] border border-[#1456AD]/30 text-xs text-[#172E58] flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <FileCode2 size={16} className="text-[#1456AD] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">
                        HTML Template Active: {selectedTemplateName} (v{selectedTemplateVersion || 1})
                      </span>
                      <span className="text-[11px] text-[#475569] block mt-0.5">
                        Full branded SNPSUNEXUS card HTML will be rendered and dispatched via Gmail SMTP.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDetachTemplate}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white border border-[#CBD5E1] text-[#64748B] hover:text-rose-600 hover:border-rose-300 flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Detach template and send custom free-form email instead"
                  >
                    <Unlink size={12} /> Detach
                  </button>
                </div>
              )}

              {templateRemovedNotice && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start justify-between gap-2">
                  <span>{templateRemovedNotice}</span>
                  <button
                    type="button"
                    onClick={() => setTemplateRemovedNotice(null)}
                    className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Recipient Credentials row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Recipient Full Name"
                  placeholder="Enter recipient full name"
                  value={recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value);
                    if (errors.recipientName) setErrors((prev) => ({ ...prev, recipientName: undefined }));
                  }}
                  error={errors.recipientName}
                  required
                />

                <Input
                  label="Recipient Email Address"
                  type="email"
                  placeholder="recipient@domain.com"
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    if (errors.recipient) setErrors((prev) => ({ ...prev, recipient: undefined }));
                  }}
                  error={errors.recipient}
                  required
                />
              </div>

              {/* Template Context Row: Designation & Activation URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Designation / Role"
                  placeholder="e.g. Coordinator"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                />

                <Input
                  label="Action / Portal Link"
                  type="url"
                  placeholder="https://snpsunexus.vercel.app"
                  value={activationLink}
                  onChange={(e) => setActivationLink(e.target.value)}
                  leftIcon={<Link2 size={14} />}
                />
              </div>

              {/* Subject Line */}
              <Input
                label="Email Subject Line"
                placeholder="e.g. Official Notification — {{recipient_name}}"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
                }}
                error={errors.subject}
                required
              />

              {/* Variable Tokens Helper Ribbon */}
              <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs text-[#172E58] font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-[#C69A4C]" />
                    Personalization Tokens
                  </span>
                  <span className="text-[11px] font-normal text-[#64748B]">Auto-resolved on send</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariable(v.token)}
                      className="px-2 py-1 bg-white hover:bg-[#EBF3FC] text-[#1456AD] hover:text-[#0f438a] border border-[#CBD5E1] hover:border-[#1456AD] rounded-lg text-[11px] font-mono font-medium transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                      title={`Resolves to: ${v.sample}`}
                    >
                      <span>{v.token}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Plain-Text Alternative / Message Body Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#172E58]">
                    {customHtmlTemplate ? 'Plain-Text Fallback Alternative' : 'Email Message Content'} {!customHtmlTemplate && <span className="text-red-500">*</span>}
                  </label>
                  <span className="text-[11px] text-[#64748B]">
                    {wordCount} words • {charCount} characters
                  </span>
                </div>
                <textarea
                  rows={customHtmlTemplate ? 8 : 12}
                  value={messageBody}
                  onChange={(e) => {
                    setMessageBody(e.target.value);
                    if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }));
                  }}
                  placeholder="Type your message here. Insert tokens using the buttons above..."
                  className={`w-full p-3.5 text-xs font-sans rounded-xl border bg-white text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#1456AD] focus:border-transparent transition-all shadow-2xs leading-relaxed ${
                    errors.body ? 'border-red-400 bg-red-50/20' : 'border-[#CBD5E1]'
                  }`}
                />
                {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body}</p>}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Live Email HTML Preview (6 cols) */}
        <div className={`lg:col-span-6 min-w-0 flex flex-col ${activeTab === 'editor' ? 'hidden lg:flex' : 'flex'}`}>
          <Card className="h-full flex flex-col">
            <CardHeader
              title="Live Email Preview"
              subtitle="Exact HTML & subject rendering matching outgoing Gmail MIME"
              action={
                <Badge variant="gold" size="sm">
                  Live View
                </Badge>
              }
            />

            <div className="space-y-4 flex-1 flex flex-col">
              {/* SMTP Envelope Header */}
              <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[10px] space-y-1.5 text-xs">
                <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-1 text-[11px] text-[#64748B]">
                  <span>SMTP Envelope Preview</span>
                  <span className="flex items-center gap-1 text-[#172E58] font-medium">
                    <ShieldCheck size={12} className="text-[#1456AD]" />
                    SNPSUNEXUS Sender Identity
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px]">
                  <span className="text-[#64748B] font-medium">From:</span>
                  <span className="col-span-3 text-[#172E58] font-bold truncate">
                    SNPSUNEXUS
                  </span>

                  <span className="text-[#64748B] font-medium">To:</span>
                  <span className="col-span-3 text-[#1E293B] font-mono truncate">
                    {recipient ? (recipientName ? `${recipientName} <${recipient}>` : recipient) : '(No recipient specified)'}
                  </span>

                  <span className="text-[#64748B] font-medium">Subject:</span>
                  <span className="col-span-3 text-[#172E58] font-semibold">
                    {renderedSubject || '(No subject provided)'}
                  </span>
                </div>
              </div>

              {/* Isolated Responsive Iframe showing Exact Outgoing HTML Card */}
              <div className="bg-slate-100 border border-[#CBD5E1] rounded-[12px] overflow-hidden shadow-xs">
                <iframe
                  title="Compose Live Email Card Preview"
                  srcDoc={renderedLiveHtml}
                  className="w-full border-0"
                  style={{
                    width: '100%',
                    height: '580px',
                    display: 'block',
                    background: '#F4F6FA',
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Live Send Result Modal */}
      <Modal
        isOpen={isLiveSendNoticeOpen}
        onClose={() => setIsLiveSendNoticeOpen(false)}
        title="Email Dispatched Successfully"
        subtitle="SMTP Transmission Completed"
        maxWidth="md"
        footer={
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => setIsLiveSendNoticeOpen(false)}
            className="cursor-pointer"
          >
            Done
          </Button>
        }
      >
        <div className="space-y-3 text-xs text-[#1E293B]">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[10px] text-emerald-800 space-y-1">
            <h5 className="font-bold flex items-center gap-1.5 text-sm">
              <CheckCircle2 size={16} /> Accepted by Gmail SMTP Relay
            </h5>
            <p className="text-[11px] leading-relaxed">
              HTML + Plain-Text MIME email dispatched from <strong>SNPSUNEXUS</strong>.
            </p>
          </div>

          <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg font-mono text-[11px] space-y-1">
            <div><strong>From:</strong> SNPSUNEXUS</div>
            <div><strong>Recipient:</strong> {recipient}</div>
            <div><strong>Subject:</strong> {lastSmtpResult?.data?.rendered_subject || renderedSubject}</div>
            {lastSmtpResult?.data?.template_id && (
              <div><strong>Template:</strong> {lastSmtpResult.data.template_id} (v{lastSmtpResult.data.template_version || 1})</div>
            )}
            <div><strong>Message ID:</strong> {lastSmtpResult?.data?.smtp_message_id || '250 2.0.0 OK'}</div>
            {lastSmtpResult?.data?.mime_diagnostics && (
              <div>
                <strong>MIME Verification:</strong> HTML ({lastSmtpResult.data.mime_diagnostics.html_bytes} B) + Text ({lastSmtpResult.data.mime_diagnostics.text_bytes} B) {lastSmtpResult.data.mime_diagnostics.has_inline_logo ? '+ CID Logo Attached' : ''}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
