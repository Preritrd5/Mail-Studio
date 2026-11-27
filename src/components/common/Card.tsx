import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hoverable = false,
  ...props
}) => {
  return (
    <div
      className={`bg-white border border-[#CBD5E1] rounded-[12px] p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 min-w-0 ${
        hoverable ? 'hover:border-[#94A3B8] hover:shadow-[0_4px_12px_rgba(23,46,88,0.06)]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <div className={`flex flex-wrap items-start justify-between gap-3 pb-4 mb-4 border-b border-[#CBD5E1] min-w-0 ${className}`}>
    <div className="min-w-0 flex-1">
      <h3 className="text-base font-semibold text-[#172E58] tracking-tight leading-snug">{title}</h3>
      {subtitle && <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0 max-w-full">{action}</div>}
  </div>
);
