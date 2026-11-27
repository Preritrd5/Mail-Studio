import React, { useState } from 'react';
import {
  Heading,
  AlignLeft,
  FileText,
  CreditCard,
  Image as ImageIcon,
  MousePointer,
  List,
  ListOrdered,
  Minus,
  MoveVertical,
  PenTool,
  Check,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Maximize2,
  Layers,
  Settings,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import { EmailBlock, EmailBlockType, InfoCardField } from '../../types';
import { STANDARD_PLACEHOLDERS, PLACEHOLDER_DETAILS } from '../../services/templateService';

interface BlockBasedEditorProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  onInsertVariableToActive?: (token: string) => void;
}

export const BlockBasedEditor: React.FC<BlockBasedEditorProps> = ({
  blocks,
  onChange,
  onInsertVariableToActive,
}) => {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [expandedBlockIds, setExpandedBlockIds] = useState<Record<string, boolean>>({});
  const [isVariablesOpen, setIsVariablesOpen] = useState<boolean>(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Toggle expansion of a single block's settings
  const toggleExpand = (id: string) => {
    setExpandedBlockIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Move block up
  const moveBlockUp = (index: number) => {
    if (index === 0) return;
    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(index, 1);
    newBlocks.splice(index - 1, 0, moved);
    onChange(newBlocks);
  };

  // Move block down
  const moveBlockDown = (index: number) => {
    if (index === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(index, 1);
    newBlocks.splice(index + 1, 0, moved);
    onChange(newBlocks);
  };

  // Duplicate block
  const duplicateBlock = (index: number) => {
    const target = blocks[index];
    const copy: EmailBlock = {
      ...JSON.parse(JSON.stringify(target)),
      id: `blk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, copy);
    onChange(newBlocks);
  };

  // Delete block
  const deleteBlock = (id: string) => {
    const newBlocks = blocks.filter((b) => b.id !== id);
    onChange(newBlocks);
  };

  // Update specific block properties
  const updateBlock = (id: string, updates: Partial<EmailBlock>) => {
    const newBlocks = blocks.map((b) => (b.id === id ? { ...b, ...updates } : b));
    onChange(newBlocks);
  };

  // Add new block by type
  const handleAddBlock = (type: EmailBlockType) => {
    const newId = `blk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    let newBlock: EmailBlock;

    switch (type) {
      case 'heading':
        newBlock = {
          id: newId,
          type: 'heading',
          title: 'Section Heading',
          level: 'h2',
          align: 'left',
          textColor: '#172E58',
        };
        break;

      case 'paragraph':
        newBlock = {
          id: newId,
          type: 'paragraph',
          content: 'Add your message paragraph here. You can format text or add personal notes.',
          align: 'left',
          textColor: '#1E293B',
        };
        break;

      case 'richtext':
        newBlock = {
          id: newId,
          type: 'richtext',
          content: '<p>Formatted content block. Supports <strong>bold</strong>, <em>italics</em>, and links.</p>',
          align: 'left',
        };
        break;

      case 'infocard':
        newBlock = {
          id: newId,
          type: 'infocard',
          cardTitle: 'Information Summary',
          cardBgColor: '#EEF4FF',
          cardBorderColor: '#D0E0FC',
          cardFields: [
            { id: 'f1', label: 'Recipient Name', value: '{{recipient_name}}', icon: 'user' },
            { id: 'f2', label: 'Reference Code', value: 'REF-2026-001', icon: 'briefcase' },
            { id: 'f3', label: 'Email Address', value: '{{recipient_email}}', icon: 'mail' },
            { id: 'f4', label: 'Status Date', value: '{{current_year}}', icon: 'calendar' },
          ],
        };
        break;

      case 'image':
        newBlock = {
          id: newId,
          type: 'image',
          imageUrl: '/assets/snpsunexus-logo.png',
          imageAlt: 'SNPSUNEXUS Graphic',
          imageWidth: '320px',
          align: 'center',
        };
        break;

      case 'button':
        newBlock = {
          id: newId,
          type: 'button',
          buttonText: 'View Details →',
          buttonUrl: '{{activation_link}}',
          buttonBgColor: '#172E58',
          buttonTextColor: '#FFFFFF',
          buttonRadius: 8,
          buttonPaddingY: 13,
          buttonPaddingX: 28,
          align: 'center',
          buttonWidth: 'auto',
        };
        break;

      case 'bulletlist':
        newBlock = {
          id: newId,
          type: 'bulletlist',
          items: ['First key item or requirement', 'Second important instruction', 'Third note for reference'],
        };
        break;

      case 'numberedlist':
        newBlock = {
          id: newId,
          type: 'numberedlist',
          items: ['Step 1: Review your details', 'Step 2: Confirm your schedule', 'Step 3: Save official records'],
        };
        break;

      case 'divider':
        newBlock = {
          id: newId,
          type: 'divider',
          dividerColor: '#CBD5E1',
          dividerStyle: 'solid',
          dividerThickness: 1,
        };
        break;

      case 'spacer':
        newBlock = {
          id: newId,
          type: 'spacer',
          spacingHeight: 20,
        };
        break;

      case 'signature':
        newBlock = {
          id: newId,
          type: 'signature',
          signOff: 'Best regards,',
          senderName: 'SNPSUNEXUS',
          senderTitle: 'Administration Team',
        };
        break;

      case 'footer':
        newBlock = {
          id: newId,
          type: 'footer',
          copyrightText: '© {{current_year}} SNPSUNEXUS. All rights reserved.',
          showLogo: true,
        };
        break;
    }

    const updated = [...blocks, newBlock];
    onChange(updated);
    setIsAddMenuOpen(false);
    setExpandedBlockIds((prev) => ({ ...prev, [newId]: true }));
    setActiveBlockId(newId);
  };

  // Insert variable into active block or copy
  const handleInsertVariable = (token: string) => {
    if (activeBlockId) {
      const active = blocks.find((b) => b.id === activeBlockId);
      if (active) {
        if (active.type === 'paragraph' || active.type === 'richtext') {
          updateBlock(activeBlockId, {
            content: `${active.content || ''} ${token}`,
          });
        } else if (active.type === 'heading') {
          updateBlock(activeBlockId, {
            title: `${active.title || ''} ${token}`,
          });
        } else if (active.type === 'button') {
          updateBlock(activeBlockId, {
            buttonUrl: token,
          });
        }
      }
    }

    if (onInsertVariableToActive) {
      onInsertVariableToActive(token);
    }

    // Also copy to clipboard for user convenience
    navigator.clipboard?.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const ELEMENT_CATALOG: Array<{
    type: EmailBlockType;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    { type: 'heading', label: 'Heading', description: 'H1, H2, H3, or Hero Banner', icon: <Heading size={15} />, color: 'text-indigo-600 bg-indigo-50' },
    { type: 'paragraph', label: 'Paragraph', description: 'Standard text paragraph', icon: <AlignLeft size={15} />, color: 'text-blue-600 bg-blue-50' },
    { type: 'richtext', label: 'Rich Text', description: 'Formatted multi-line message', icon: <FileText size={15} />, color: 'text-sky-600 bg-sky-50' },
    { type: 'infocard', label: 'Information Card', description: 'Structured 2-column key-values', icon: <CreditCard size={15} />, color: 'text-emerald-600 bg-emerald-50' },
    { type: 'image', label: 'Image', description: 'Branded image or banner', icon: <ImageIcon size={15} />, color: 'text-purple-600 bg-purple-50' },
    { type: 'button', label: 'Button / CTA', description: 'Optional customized action button', icon: <MousePointer size={15} />, color: 'text-amber-600 bg-amber-50' },
    { type: 'bulletlist', label: 'Bullet List', description: 'Unordered bullet list', icon: <List size={15} />, color: 'text-teal-600 bg-teal-50' },
    { type: 'numberedlist', label: 'Numbered List', description: 'Sequential numbered steps', icon: <ListOrdered size={15} />, color: 'text-cyan-600 bg-cyan-50' },
    { type: 'divider', label: 'Divider', description: 'Horizontal dividing line', icon: <Minus size={15} />, color: 'text-slate-600 bg-slate-50' },
    { type: 'spacer', label: 'Spacer', description: 'Vertical breathing room', icon: <MoveVertical size={15} />, color: 'text-gray-600 bg-gray-50' },
    { type: 'signature', label: 'Signature', description: 'Sender sign-off and title', icon: <PenTool size={15} />, color: 'text-rose-600 bg-rose-50' },
    { type: 'footer', label: 'Footer', description: 'SNPSUNEXUS dark brand footer', icon: <Layers size={15} />, color: 'text-navy-600 bg-slate-100' },
  ];

  return (
    <div className="space-y-4 text-xs text-[#1E293B]">
      {/* 1. Optional Collapsible Personalization Variables */}
      <div className="border border-[#CBD5E1] rounded-[10px] overflow-hidden bg-white shadow-2xs">
        <button
          type="button"
          onClick={() => setIsVariablesOpen(!isVariablesOpen)}
          className="w-full px-4 py-2.5 bg-[#F8FAFC] hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#C69A4C]" />
            <span className="font-bold text-[#172E58] text-xs">Personalization Variables</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-[#475569] font-semibold">
              Optional (6 variables)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
            <span>{isVariablesOpen ? 'Hide' : 'Show'}</span>
            {isVariablesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {isVariablesOpen && (
          <div className="p-3.5 bg-white border-t border-[#CBD5E1] space-y-3">
            <p className="text-[11px] text-[#64748B] leading-relaxed">
              Variables are optional tools. Templates can contain standard static text without variables. Only variables used in the template will be resolved at send time using verified recipient records.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {STANDARD_PLACEHOLDERS.map((token) => {
                const detail = PLACEHOLDER_DETAILS[token];
                const isCopied = copiedToken === token;
                return (
                  <div
                    key={token}
                    className="p-2 rounded-lg border border-[#CBD5E1] bg-slate-50 hover:bg-blue-50/50 hover:border-[#1456AD]/30 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[#172E58] text-[11px]">{detail?.label}</span>
                        {isCopied && (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <Check size={10} /> Copied
                          </span>
                        )}
                      </div>
                      <code className="text-[10px] text-[#1456AD] font-mono bg-white px-1.5 py-0.5 rounded border border-[#CBD5E1] block w-fit mb-1">
                        {token}
                      </code>
                      <p className="text-[10px] text-[#64748B] line-clamp-1">{detail?.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleInsertVariable(token)}
                      className="mt-2 text-[10px] py-1 px-2 rounded bg-white hover:bg-[#1456AD] hover:text-white border border-[#CBD5E1] text-[#172E58] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Plus size={11} />
                      <span>Insert / Copy Variable</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Block List Header & Add Element Menu */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h4 className="font-bold text-xs text-[#172E58] flex items-center gap-1.5">
            <Layers size={14} className="text-[#1456AD] shrink-0" />
            <span>Template Content Blocks ({blocks.length})</span>
          </h4>
          <p className="text-[11px] text-[#64748B] mt-0.5">
            Every element is optional. Add, reorder, edit, duplicate, or delete any content block.
          </p>
        </div>

        {/* Add Element Dropdown Menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="px-3 py-1.5 min-h-8 bg-[#1456AD] hover:bg-[#0F438A] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus size={13} />
            <span>Insert Element</span>
            <ChevronDown size={13} />
          </button>

          {isAddMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 max-w-[calc(100vw-48px)] bg-white rounded-xl shadow-xl border border-[#CBD5E1] p-1.5 z-40 grid grid-cols-1 gap-1 max-h-72 overflow-y-auto">
              <div className="px-2.5 py-1 text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                Select Content Element
              </div>
              {ELEMENT_CATALOG.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => handleAddBlock(item.type)}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
                >
                  <div className={`p-1.5 rounded-md ${item.color} shrink-0`}>
                    {item.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-[#172E58]">{item.label}</div>
                    <div className="text-[10px] text-[#64748B] leading-tight">{item.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Empty Blocks State */}
      {blocks.length === 0 && (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-[#CBD5E1] space-y-2">
          <p className="font-semibold text-slate-700">No content elements added yet.</p>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Click <strong>"Insert Element"</strong> above to add headings, paragraphs, information cards, optional CTA buttons, or footers.
          </p>
        </div>
      )}

      {/* 4. Blocks List with Reordering and Controls */}
      <div className="space-y-3">
        {blocks.map((block, index) => {
          const isExpanded = expandedBlockIds[block.id] ?? false;
          const isActive = activeBlockId === block.id;

          return (
            <div
              key={block.id}
              onClick={() => setActiveBlockId(block.id)}
              className={`rounded-xl border transition-all ${
                isActive
                  ? 'border-[#1456AD] shadow-xs ring-1 ring-[#1456AD]/20'
                  : 'border-[#CBD5E1] hover:border-[#94A3B8]'
              } bg-white overflow-hidden`}
            >
              {/* Block Header Row */}
              <div className="p-2.5 bg-slate-50/70 border-b border-[#CBD5E1] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 font-mono w-4 shrink-0 text-center">
                    {index + 1}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-white text-[#172E58] border border-[#CBD5E1] shrink-0">
                    {block.type}
                  </span>
                  <span className="text-xs font-semibold text-[#1E293B] truncate">
                    {block.type === 'heading' && (block.title || 'Heading')}
                    {block.type === 'paragraph' && (block.content?.substring(0, 40) || 'Paragraph')}
                    {block.type === 'richtext' && 'Rich Text Box'}
                    {block.type === 'infocard' && (block.cardTitle || 'Information Card')}
                    {block.type === 'button' && `Button: "${block.buttonText || 'CTA'}"`}
                    {block.type === 'image' && 'Image Element'}
                    {block.type === 'bulletlist' && `Bullet List (${block.items?.length || 0} items)`}
                    {block.type === 'numberedlist' && `Numbered List (${block.items?.length || 0} steps)`}
                    {block.type === 'divider' && 'Horizontal Divider'}
                    {block.type === 'spacer' && `Spacer (${block.spacingHeight || 20}px)`}
                    {block.type === 'signature' && `Signature: ${block.senderName || 'Team'}`}
                    {block.type === 'footer' && 'SNPSUNEXUS Brand Footer'}
                  </span>
                </div>

                {/* Block Controls: Move Up, Move Down, Duplicate, Delete, Expand */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlockUp(index);
                    }}
                    disabled={index === 0}
                    className="p-1 rounded text-[#64748B] hover:text-[#172E58] hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                    title="Move Block Up"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlockDown(index);
                    }}
                    disabled={index === blocks.length - 1}
                    className="p-1 rounded text-[#64748B] hover:text-[#172E58] hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                    title="Move Block Down"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateBlock(index);
                    }}
                    className="p-1 rounded text-[#64748B] hover:text-[#1456AD] hover:bg-slate-200 cursor-pointer"
                    title="Duplicate Block"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBlock(block.id);
                    }}
                    className="p-1 rounded text-[#64748B] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Delete Block"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(block.id);
                    }}
                    className="p-1 rounded text-[#1456AD] hover:bg-blue-50 cursor-pointer ml-0.5"
                    title={isExpanded ? 'Collapse Settings' : 'Edit Block Settings'}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <Settings size={14} />}
                  </button>
                </div>
              </div>

              {/* Inline Block Configuration Settings */}
              {isExpanded && (
                <div className="p-3.5 bg-white space-y-3 border-t border-[#CBD5E1]">
                  {/* HEADING BLOCK CONTROLS */}
                  {block.type === 'heading' && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Heading Text</label>
                        <input
                          type="text"
                          value={block.title || ''}
                          onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#1456AD]"
                          placeholder="e.g. Official Notification"
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Style Format</label>
                          <select
                            value={block.subtitle || 'standard'}
                            onChange={(e) => updateBlock(block.id, { subtitle: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="standard">Standard Header</option>
                            <option value="hero-banner">Deep Navy Hero Banner</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Level</label>
                          <select
                            value={block.level || 'h2'}
                            onChange={(e) => updateBlock(block.id, { level: e.target.value as any })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="h1">H1 (Large)</option>
                            <option value="h2">H2 (Medium)</option>
                            <option value="h3">H3 (Small)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Alignment</label>
                          <select
                            value={block.align || 'left'}
                            onChange={(e) => updateBlock(block.id, { align: e.target.value as any })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PARAGRAPH BLOCK CONTROLS */}
                  {block.type === 'paragraph' && (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-[#64748B]">Paragraph Content</label>
                      <textarea
                        rows={3}
                        value={block.content || ''}
                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        className="w-full p-2.5 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#1456AD]"
                        placeholder="Write paragraph content here..."
                      />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#64748B]">Alignment:</span>
                        <div className="flex items-center gap-1">
                          {(['left', 'center', 'right'] as const).map((al) => (
                            <button
                              key={al}
                              type="button"
                              onClick={() => updateBlock(block.id, { align: al })}
                              className={`px-2 py-0.5 rounded capitalize ${
                                (block.align || 'left') === al
                                  ? 'bg-[#172E58] text-white font-bold'
                                  : 'bg-slate-100 text-[#64748B]'
                              }`}
                            >
                              {al}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* RICH TEXT BLOCK CONTROLS */}
                  {block.type === 'richtext' && (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-[#64748B]">Formatted Message Content (HTML)</label>
                      <textarea
                        rows={4}
                        value={block.content || ''}
                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        className="w-full p-2.5 font-mono text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#1456AD]"
                        placeholder="<div>Enter rich text or notice HTML...</div>"
                      />
                    </div>
                  )}

                  {/* INFORMATION CARD CONTROLS */}
                  {block.type === 'infocard' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Card Header Title</label>
                          <input
                            type="text"
                            value={block.cardTitle || ''}
                            onChange={(e) => updateBlock(block.id, { cardTitle: e.target.value })}
                            className="w-full h-9 px-2.5 text-xs border border-[#CBD5E1] rounded-lg"
                            placeholder="e.g. Recipient Details"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Background Theme</label>
                          <select
                            value={block.cardBgColor || '#EEF4FF'}
                            onChange={(e) => updateBlock(block.id, { cardBgColor: e.target.value })}
                            className="w-full h-9 px-2 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="#EEF4FF">Light Royal Blue (#EEF4FF)</option>
                            <option value="#F8FAFC">Clean Slate Grey (#F8FAFC)</option>
                            <option value="#FFFFFF">Crisp White (#FFFFFF)</option>
                          </select>
                        </div>
                      </div>

                      {/* Configurable Card Rows */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-[#172E58]">Information Fields (Key-Value)</label>
                          <button
                            type="button"
                            onClick={() => {
                              const existing = block.cardFields || [];
                              const newField: InfoCardField = {
                                id: `f-${Date.now()}`,
                                label: 'Field Label',
                                value: '{{current_year}}',
                                icon: 'briefcase',
                              };
                              updateBlock(block.id, { cardFields: [...existing, newField] });
                            }}
                            className="text-[10px] font-semibold text-[#1456AD] hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Plus size={11} /> Add Field Row
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(block.cardFields || []).map((f, fIdx) => (
                            <div
                              key={f.id || fIdx}
                              className="grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_auto] items-center gap-1.5 bg-slate-50 p-2 rounded-lg border border-[#CBD5E1]"
                            >
                              <select
                                value={f.icon || 'user'}
                                onChange={(e) => {
                                  const updated = [...(block.cardFields || [])];
                                  updated[fIdx] = { ...updated[fIdx], icon: e.target.value as any };
                                  updateBlock(block.id, { cardFields: updated });
                                }}
                                className="w-full h-8 px-1.5 text-[11px] border border-[#CBD5E1] rounded bg-white"
                              >
                                <option value="user">👤 User</option>
                                <option value="mail">✉️ Mail</option>
                                <option value="briefcase">💼 Role</option>
                                <option value="calendar">📅 Date</option>
                              </select>

                              <input
                                type="text"
                                value={f.label}
                                onChange={(e) => {
                                  const updated = [...(block.cardFields || [])];
                                  updated[fIdx] = { ...updated[fIdx], label: e.target.value };
                                  updateBlock(block.id, { cardFields: updated });
                                }}
                                className="w-full h-8 px-2 text-[11px] border border-[#CBD5E1] rounded bg-white"
                                placeholder="Label"
                              />

                              <input
                                type="text"
                                value={f.value}
                                onChange={(e) => {
                                  const updated = [...(block.cardFields || [])];
                                  updated[fIdx] = { ...updated[fIdx], value: e.target.value };
                                  updateBlock(block.id, { cardFields: updated });
                                }}
                                className="w-full h-8 px-2 text-[11px] border border-[#CBD5E1] rounded bg-white font-mono"
                                placeholder="Value / Variable"
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (block.cardFields || []).filter((_, idx) => idx !== fIdx);
                                  updateBlock(block.id, { cardFields: updated });
                                }}
                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded cursor-pointer justify-self-end"
                                title="Remove Field"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BUTTON / CTA CONTROLS (OPTIONAL ELEMENT) */}
                  {block.type === 'button' && (
                    <div className="space-y-3 bg-amber-50/40 p-3 rounded-lg border border-amber-200/60">
                      <div className="flex items-center justify-between text-[11px] text-amber-800">
                        <span className="font-bold flex items-center gap-1">
                          <MousePointer size={13} />
                          Customizable Action Button
                        </span>
                        <span>Completely optional</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Button Text</label>
                          <input
                            type="text"
                            value={block.buttonText || ''}
                            onChange={(e) => updateBlock(block.id, { buttonText: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                            placeholder="e.g. Open Details →"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Destination URL</label>
                          <input
                            type="text"
                            value={block.buttonUrl || ''}
                            onChange={(e) => updateBlock(block.id, { buttonUrl: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs font-mono border border-[#CBD5E1] rounded-lg"
                            placeholder="https://... or {{activation_link}}"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Background</label>
                          <select
                            value={block.buttonBgColor || '#172E58'}
                            onChange={(e) => updateBlock(block.id, { buttonBgColor: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="#172E58">Deep Navy (#172E58)</option>
                            <option value="#1456AD">Royal Blue (#1456AD)</option>
                            <option value="#C69A4C">Gold Accent (#C69A4C)</option>
                            <option value="#1E293B">Slate Dark (#1E293B)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Corner Radius</label>
                          <select
                            value={block.buttonRadius ?? 8}
                            onChange={(e) => updateBlock(block.id, { buttonRadius: parseInt(e.target.value, 10) })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value={0}>Square (0px)</option>
                            <option value={4}>Subtle (4px)</option>
                            <option value={8}>Standard (8px)</option>
                            <option value={24}>Pill (24px)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Alignment</label>
                          <select
                            value={block.align || 'center'}
                            onChange={(e) => updateBlock(block.id, { align: e.target.value as any })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="center">Center</option>
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Button Width</label>
                          <select
                            value={block.buttonWidth || 'auto'}
                            onChange={(e) => updateBlock(block.id, { buttonWidth: e.target.value as any })}
                            className="w-full px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white"
                          >
                            <option value="auto">Auto (Fitted)</option>
                            <option value="full">Full Width</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* IMAGE CONTROLS */}
                  {block.type === 'image' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Image URL</label>
                          <input
                            type="text"
                            value={block.imageUrl || ''}
                            onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                            placeholder="/assets/snpsunexus-logo.png or https://..."
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Max Width</label>
                          <input
                            type="text"
                            value={block.imageWidth || '300px'}
                            onChange={(e) => updateBlock(block.id, { imageWidth: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                            placeholder="e.g. 100% or 300px"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LIST CONTROLS */}
                  {(block.type === 'bulletlist' || block.type === 'numberedlist') && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-[#172E58]">
                          {block.type === 'numberedlist' ? 'Numbered Steps' : 'Bullet Items'}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const items = block.items || [];
                            updateBlock(block.id, { items: [...items, `Item ${items.length + 1}`] });
                          }}
                          className="text-[10px] font-semibold text-[#1456AD] hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus size={11} /> Add Item
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {(block.items || []).map((it, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <span className="text-[11px] font-mono text-slate-400 w-4 text-center">
                              {block.type === 'numberedlist' ? `${idx + 1}.` : '•'}
                            </span>
                            <input
                              type="text"
                              value={it}
                              onChange={(e) => {
                                const newItems = [...(block.items || [])];
                                newItems[idx] = e.target.value;
                                updateBlock(block.id, { items: newItems });
                              }}
                              className="flex-1 px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = (block.items || []).filter((_, i) => i !== idx);
                                updateBlock(block.id, { items: newItems });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SIGNATURE CONTROLS */}
                  {block.type === 'signature' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Sign-Off</label>
                        <input
                          type="text"
                          value={block.signOff || ''}
                          onChange={(e) => updateBlock(block.id, { signOff: e.target.value })}
                          className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                          placeholder="Best regards,"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Sender Name</label>
                        <input
                          type="text"
                          value={block.senderName || ''}
                          onChange={(e) => updateBlock(block.id, { senderName: e.target.value })}
                          className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                          placeholder="SNPSUNEXUS"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Title / Subtitle</label>
                        <input
                          type="text"
                          value={block.senderTitle || ''}
                          onChange={(e) => updateBlock(block.id, { senderTitle: e.target.value })}
                          className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                          placeholder="Optional subtitle or role"
                        />
                      </div>
                    </div>
                  )}

                  {/* FOOTER CONTROLS */}
                  {block.type === 'footer' && (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-[#64748B]">Copyright Notice</label>
                      <input
                        type="text"
                        value={block.copyrightText || ''}
                        onChange={(e) => updateBlock(block.id, { copyrightText: e.target.value })}
                        className="w-full px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg"
                        placeholder="© {{current_year}} SNPSUNEXUS. All rights reserved."
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
