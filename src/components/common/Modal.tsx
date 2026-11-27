import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  footer?: React.ReactNode;
  headerVariant?: 'light' | 'navy';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
  footer,
  headerVariant = 'light',
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles: Record<NonNullable<ModalProps['maxWidth']>, string> = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    '5xl': 'sm:max-w-5xl',
  };

  const isNavy = headerVariant === 'navy';

  const modalContent = (
    <div
      className="fixed inset-0 z-50 !mt-0 flex items-center justify-center p-2 sm:p-4 bg-[#172E58]/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidthStyles[maxWidth]} bg-white rounded-[12px] sm:rounded-[14px] shadow-2xl border border-[#CBD5E1] overflow-hidden flex flex-col max-h-[calc(100dvh-16px)] sm:max-h-[calc(100dvh-32px)] min-w-0`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div
          className={`flex items-start justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b shrink-0 ${
            isNavy
              ? 'bg-[#172E58] text-white border-[#1F3C73]'
              : 'bg-white text-[#172E58] border-[#CBD5E1]'
          }`}
        >
          <div className="min-w-0 flex-1">
            <h3
              className={`text-base sm:text-lg font-semibold leading-snug break-words ${
                isNavy ? 'text-white' : 'text-[#172E58]'
              }`}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isNavy ? 'text-slate-300' : 'text-[#64748B]'
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
              isNavy
                ? 'text-slate-300 hover:text-white hover:bg-white/10'
                : 'text-[#64748B] hover:text-[#172E58] hover:bg-[#F4F6FA]'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Independently Scrollable Body */}
        <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain text-sm text-[#1E293B] min-w-0">
          {children}
        </div>

        {/* Fixed Footer */}
        {footer && (
          <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-[#F8FAFC] border-t border-[#CBD5E1] flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
