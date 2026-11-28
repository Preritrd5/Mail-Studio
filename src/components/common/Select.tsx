import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  error?: string;
  helperText?: string;
  controlSize?: 'sm' | 'md';
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  controlSize = 'md',
  className = '',
  id,
  children,
  ...props
}) => {
  const selectId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  const sizeClass =
    controlSize === 'sm'
      ? 'h-9 py-1.5 text-xs px-2.5 rounded-[8px] leading-normal'
      : 'h-10 py-2 text-sm px-3 rounded-[10px] leading-normal';

  return (
    <div className="w-full space-y-1.5 min-w-0">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-[#1E293B] leading-4">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full bg-white border text-[#1E293B] snpsu-input-base focus:shadow-[0_0_0_3px_rgba(20,86,173,0.08)] disabled:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeClass} ${
          error
            ? 'border-rose-300 bg-rose-50/20 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-[#CBD5E1]'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-rose-600 font-medium snpsu-panel-enter">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#64748B]">{helperText}</p>}
    </div>
  );
};
