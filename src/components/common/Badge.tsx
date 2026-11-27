import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'navy' | 'gold';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 leading-tight',
    md: 'text-xs px-2.5 py-1 leading-tight',
  };

  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/80',
    error: 'bg-rose-50 text-rose-700 border-rose-200/80',
    info: 'bg-[#EBF3FC] text-[#1456AD] border-[#1456AD]/25',
    neutral: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
    navy: 'bg-[#172E58]/10 text-[#172E58] border-[#172E58]/20 font-medium',
    gold: 'bg-[#FDF8EE] text-[#C69A4C] border-[#C69A4C]/35 font-medium',
  };

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
    info: 'bg-[#1456AD]',
    neutral: 'bg-slate-400',
    navy: 'bg-[#172E58]',
    gold: 'bg-[#C69A4C]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-[6px] border whitespace-nowrap shrink-0 ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};
