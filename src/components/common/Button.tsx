import React from 'react';
import { ButtonLoader } from './Loading';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  loadingText?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading = false,
  loadingText,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const baseStyles =
    'group inline-flex items-center justify-center font-medium transition-all duration-150 ease-out rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 select-none whitespace-nowrap enabled:hover:-translate-y-[1px] enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none motion-reduce:transition-none motion-reduce:transform-none cursor-pointer shrink-0';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 min-h-8',
    md: 'text-xs sm:text-sm px-3.5 sm:px-4 py-2 gap-2 min-h-10',
    lg: 'text-sm sm:text-base px-5 py-2.5 gap-2 min-h-11',
  };

  const variantStyles = {
    primary:
      'bg-[#1456AD] enabled:hover:bg-[#0E448D] text-white focus-visible:ring-[#1456AD]/45 shadow-sm enabled:hover:shadow-[0_4px_12px_rgba(20,86,173,0.28)] enabled:active:shadow-xs',
    secondary:
      'bg-[#172E58] enabled:hover:bg-[#0F1F3D] text-white focus-visible:ring-[#172E58]/45 shadow-sm enabled:hover:shadow-[0_4px_12px_rgba(23,46,88,0.28)] enabled:active:shadow-xs',
    outline:
      'border border-[#CBD5E1] bg-white text-[#1E293B] enabled:hover:bg-[#F4F6FA] enabled:hover:border-[#94A3B8] enabled:hover:shadow-xs focus-visible:ring-[#1456AD]/35 enabled:active:shadow-none',
    ghost:
      'bg-transparent text-[#64748B] enabled:hover:text-[#172E58] enabled:hover:bg-[#F4F6FA] focus-visible:ring-[#1456AD]/30',
    gold:
      'bg-[#C69A4C] enabled:hover:bg-[#B0853B] text-white focus-visible:ring-[#C69A4C]/45 shadow-sm enabled:hover:shadow-[0_4px_12px_rgba(198,154,76,0.3)] enabled:active:shadow-xs',
    danger:
      'bg-rose-600 enabled:hover:bg-rose-700 text-white focus-visible:ring-rose-500/45 shadow-sm enabled:hover:shadow-[0_4px_12px_rgba(225,29,72,0.25)] enabled:active:shadow-xs',
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <ButtonLoader
          tone={variant === 'outline' || variant === 'ghost' ? 'brand' : 'current'}
          label={loadingText || (typeof children === 'string' ? children : 'Processing')}
        />
      ) : (
        icon && (
          <span className="shrink-0 flex items-center transition-transform duration-150 ease-out group-enabled:group-hover:scale-105 motion-reduce:transform-none">
            {icon}
          </span>
        )
      )}
      <span>{isLoading && loadingText ? loadingText : children}</span>
      {!isLoading && icon && iconPosition === 'right' && (
        <span className="shrink-0 flex items-center transition-transform duration-150 ease-out group-enabled:group-hover:translate-x-0.5 motion-reduce:transform-none">
          {icon}
        </span>
      )}
    </button>
  );
};
