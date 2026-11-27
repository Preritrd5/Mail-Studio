import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center rounded-[12px] border border-dashed border-[#CBD5E1] bg-white/60 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-[#EBF3FC] text-[#1456AD] flex items-center justify-center mb-3 shadow-xs">
        <Icon size={24} />
      </div>
      <h3 className="text-base font-semibold text-[#172E58]">{title}</h3>
      <p className="text-xs text-[#64748B] max-w-sm mt-1 mb-5">{description}</p>
      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
