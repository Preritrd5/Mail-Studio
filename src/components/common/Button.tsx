import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading = false,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-offset-1 select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 min-h-8',
    md: 'text-xs sm:text-sm px-3.5 sm:px-4 py-2 gap-2 min-h-10',
    lg: 'text-sm sm:text-base px-5 py-2.5 gap-2 min-h-11',
  };

  const variantStyles = {
    primary: 'bg-[#1456AD] hover:bg-[#0E448D] text-white focus:ring-[#1456AD]/40 shadow-sm active:translate-y-[0.5px]',
    secondary: 'bg-[#172E58] hover:bg-[#0F1F3D] text-white focus:ring-[#172E58]/40 shadow-sm',
    outline: 'border border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-[#F4F6FA] hover:border-[#94A3B8] focus:ring-[#1456AD]/20',
    ghost: 'bg-transparent text-[#64748B] hover:text-[#172E58] hover:bg-[#F4F6FA] focus:ring-slate-300',
    gold: 'bg-[#C69A4C] hover:bg-[#B0853B] text-white focus:ring-[#C69A4C]/40 shadow-sm',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500/40',
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4 text-current shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        icon && iconPosition === 'left' && <span className="shrink-0 flex items-center">{icon}</span>
      )}
      <span>{children}</span>
      {!isLoading && icon && iconPosition === 'right' && <span className="shrink-0 flex items-center">{icon}</span>}
    </button>
  );
};
