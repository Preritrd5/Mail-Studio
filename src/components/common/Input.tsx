import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-[#1E293B]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-[#64748B] pointer-events-none flex items-center">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={`w-full bg-white border rounded-[10px] text-sm text-[#1E293B] placeholder-[#94A3B8] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1456AD]/20 focus:border-[#1456AD] ${
            leftIcon ? 'pl-9' : 'pl-3.5'
          } ${rightIcon ? 'pr-9' : 'pr-3.5'} py-2.5 h-10 ${
            error ? 'border-rose-300 bg-rose-50/20' : 'border-[#CBD5E1] hover:border-[#94A3B8]'
          } ${className}`}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 text-[#64748B] flex items-center">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#64748B]">{helperText}</p>}
    </div>
  );
};
