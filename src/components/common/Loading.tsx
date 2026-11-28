import React from 'react';
import { Card } from './Card';

export type LoadingSpinnerSize = 'sm' | 'md' | 'lg';
export type LoadingSpinnerTone = 'brand' | 'gold' | 'current' | 'light';

export interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  tone?: LoadingSpinnerTone;
  label?: string;
  className?: string;
}

const SPINNER_SIZES: Record<LoadingSpinnerSize, string> = {
  // Small: 18px (16–20px), Medium: 32px (28–36px), Large: 48px (44–52px)
  sm: 'w-[18px] h-[18px] border-2',
  md: 'w-8 h-8 border-[3px]',
  lg: 'w-12 h-12 border-4',
};

const SPINNER_TONES: Record<LoadingSpinnerTone, string> = {
  brand: 'border-[#CBD5E1] border-t-[#1456AD] border-r-[#172E58]',
  gold: 'border-[#E2E8F0] border-t-[#C69A4C] border-r-[#172E58]',
  current: 'border-current/25 border-t-current border-r-current/80',
  light: 'border-white/25 border-t-white border-r-[#C69A4C]',
};

/**
 * Dedicated circular CSS loading indicator styled in SNPSUNEXUS Deep Navy, Royal Blue, and optional Gold accent.
 * Strictly independent from the official brand logo (which must never animate).
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  tone = 'brand',
  label = 'Loading',
  className = '',
}) => (
  <span
    role="status"
    aria-label={label}
    className={`snpsu-spinner shrink-0 bg-transparent ${SPINNER_SIZES[size]} ${SPINNER_TONES[tone]} ${className}`}
  >
    <span className="sr-only">{label}</span>
  </span>
);

/**
 * Compact 16–18px inline spinner tailored for Button action states without layout shift.
 */
export const ButtonLoader: React.FC<{
  tone?: LoadingSpinnerTone;
  label?: string;
  className?: string;
}> = ({ tone = 'current', label = 'Processing', className = '' }) => (
  <LoadingSpinner size="sm" tone={tone} label={label} className={className} />
);

/**
 * Subtle non-blocking background status badge for polling and live telemetry sync.
 */
export const SyncStatusPill: React.FC<{
  label?: string;
  tone?: 'light' | 'dark';
  className?: string;
}> = ({ label = 'Synchronizing...', tone = 'light', className = '' }) => (
  <span
    role="status"
    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 ${
      tone === 'dark'
        ? 'bg-white/10 text-slate-200 border-white/20'
        : 'bg-[#EBF3FC] text-[#172E58] border-[#1456AD]/25'
    } ${className}`}
  >
    <LoadingSpinner size="sm" tone={tone === 'dark' ? 'light' : 'brand'} label={label} />
    <span>{label}</span>
  </span>
);

/**
 * Centered section or modal loader with structured typography and clean surface spacing.
 */
export const PageLoader: React.FC<{
  title?: string;
  subtitle?: string;
  size?: LoadingSpinnerSize;
  compact?: boolean;
  className?: string;
}> = ({
  title = 'Loading data...',
  subtitle,
  size = 'lg',
  compact = false,
  className = '',
}) => {
  const inner = (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 ${
        compact ? 'py-7 px-4' : 'py-12 px-6'
      } ${className}`}
    >
      <LoadingSpinner size={compact ? 'md' : size} tone="brand" label={title} />
      <div className="space-y-1 max-w-md">
        <p className="text-xs sm:text-sm font-semibold text-[#172E58]">{title}</p>
        {subtitle && <p className="text-[11px] sm:text-xs text-[#64748B] leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );

  return compact ? inner : <Card>{inner}</Card>;
};

export interface CardSkeletonProps {
  variant?: 'kpi' | 'chart' | 'template' | 'list';
  className?: string;
}

/**
 * Dimension-preserving skeleton card matching real SaaS card geometry across Dashboard, Templates, Queue, and Reports.
 */
export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  variant = 'kpi',
  className = '',
}) => {
  if (variant === 'chart') {
    return (
      <Card className={`h-full flex flex-col justify-between ${className}`}>
        <div className="space-y-2 pb-4 border-b border-[#CBD5E1]">
          <div className="snpsu-skeleton h-4 w-48" />
          <div className="snpsu-skeleton h-3 w-36" />
        </div>
        <div className="flex-1 min-h-[220px] flex items-end gap-3 pt-6 pb-3 px-2">
          <div className="snpsu-skeleton flex-1 h-24" />
          <div className="snpsu-skeleton flex-1 h-40" />
          <div className="snpsu-skeleton flex-1 h-32" />
          <div className="snpsu-skeleton flex-1 h-48" />
          <div className="snpsu-skeleton flex-1 h-28" />
          <div className="snpsu-skeleton flex-1 h-36" />
        </div>
        <div className="pt-3 border-t border-[#CBD5E1] flex items-center justify-between gap-4">
          <div className="snpsu-skeleton h-3 w-32" />
          <div className="snpsu-skeleton h-3 w-24" />
        </div>
      </Card>
    );
  }

  if (variant === 'template') {
    return (
      <Card className={`border-t-4 border-t-[#CBD5E1] flex flex-col justify-between ${className}`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="snpsu-skeleton h-5 w-24" />
              <div className="snpsu-skeleton h-5 w-10" />
              <div className="snpsu-skeleton h-5 w-14" />
            </div>
            <div className="snpsu-skeleton h-3 w-20" />
          </div>
          <div className="snpsu-skeleton h-5 w-2/3" />
          <div className="snpsu-skeleton h-8 w-full" />
          <div className="snpsu-skeleton h-16 w-full" />
          <div className="flex flex-wrap gap-1.5">
            <div className="snpsu-skeleton h-5 w-24" />
            <div className="snpsu-skeleton h-5 w-24" />
            <div className="snpsu-skeleton h-5 w-20" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-[#CBD5E1] flex items-center justify-between gap-2">
          <div className="snpsu-skeleton h-3 w-36" />
          <div className="snpsu-skeleton h-7 w-32" />
        </div>
      </Card>
    );
  }

  if (variant === 'list') {
    return (
      <Card className={`h-full flex flex-col justify-between ${className}`}>
        <div className="space-y-2 pb-4 border-b border-[#CBD5E1]">
          <div className="snpsu-skeleton h-4 w-36" />
          <div className="snpsu-skeleton h-3 w-48" />
        </div>
        <div className="space-y-3 py-3 flex-1">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="p-3 rounded-lg border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="snpsu-skeleton h-3.5 w-32" />
                <div className="snpsu-skeleton h-4 w-16" />
              </div>
              <div className="snpsu-skeleton h-3 w-44" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Default KPI metric card
  return (
    <Card className={`h-full flex flex-col justify-between border-l-4 border-l-[#CBD5E1] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <div className="snpsu-skeleton h-3 w-28" />
          <div className="snpsu-skeleton h-7 w-20" />
        </div>
        <div className="snpsu-skeleton h-10 w-10 rounded-xl shrink-0" />
      </div>
      <div className="mt-4 snpsu-skeleton h-3 w-36" />
    </Card>
  );
};

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  asTableRows?: boolean;
  className?: string;
}

/**
 * Structured table row skeletons keeping existing table headers and column alignments intact.
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  columns = 6,
  asTableRows = false,
  className = '',
}) => {
  const rowArray = Array.from({ length: rows }, (_, idx) => idx);
  const colArray = Array.from({ length: columns }, (_, idx) => idx);

  if (asTableRows) {
    return (
      <>
        {rowArray.map((rIdx) => (
          <tr key={`sk-row-${rIdx}`} aria-hidden="true">
            {colArray.map((cIdx) => (
              <td key={`sk-cell-${rIdx}-${cIdx}`} className="py-3.5 px-4">
                <div
                  className={`snpsu-skeleton h-3.5 ${
                    cIdx === 0 ? 'w-32' : cIdx === columns - 1 ? 'w-16 ml-auto' : 'w-20'
                  }`}
                />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  return (
    <div className={`space-y-2.5 py-2 ${className}`} role="status" aria-label="Loading table rows">
      <span className="sr-only">Loading records...</span>
      {rowArray.map((rIdx) => (
        <div
          key={`sk-block-${rIdx}`}
          className="grid gap-3 items-center p-3 rounded-lg border border-[#E2E8F0] bg-white"
          style={{ gridTemplateColumns: `repeat(${Math.min(columns, 6)}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: Math.min(columns, 6) }, (_, cIdx) => (
            <div
              key={`sk-b-${rIdx}-${cIdx}`}
              className={`snpsu-skeleton h-3.5 ${cIdx === 0 ? 'w-4/5' : 'w-3/4'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export interface ProgressIndicatorProps {
  progress?: number;
  indeterminate?: boolean;
  label: string;
  subLabel?: string;
  showPercentage?: boolean;
  className?: string;
}

/**
 * Branded progress bar for genuine file upload progress, parsing phases, and report generation.
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress = 0,
  indeterminate = false,
  label,
  subLabel,
  showPercentage = true,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-3.5 rounded-[10px] bg-[#EBF3FC]/70 border border-[#1456AD]/25 space-y-2 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <LoadingSpinner size="sm" tone="brand" label={label} />
          <span className="font-semibold text-[#172E58] truncate">{label}</span>
        </div>
        {showPercentage && !indeterminate && (
          <span className="font-mono font-bold text-[#1456AD] shrink-0">{clamped}%</span>
        )}
      </div>

      <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-[#CBD5E1]">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-out bg-gradient-to-r from-[#172E58] via-[#1456AD] to-[#C69A4C] ${
            indeterminate ? 'w-1/2 snpsu-skeleton' : ''
          }`}
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>

      {subLabel && <p className="text-[11px] text-[#64748B]">{subLabel}</p>}
    </div>
  );
};
