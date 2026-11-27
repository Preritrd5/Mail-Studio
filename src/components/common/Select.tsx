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

  const sizeClass = controlSize === 'sm' ? 'h-9 text-xs px-2.5 rounded-[8px]' : 'h-10 text-xs sm:text-sm px-3 rounded-[10px]';

  return (
    <div className="w-full space-y-1.5 min-w-0">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-[#1E293B]">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full bg-white border text-[#1E293B] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1456AD]/20 focus:border-[#1456AD] disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${
          error ? 'border-rose-300 bg-rose-50/20' : 'border-[#CBD5E1] hover:border-[#94A3B8]'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#64748B]">{helperText}</p>}
    </div>
  );
};
