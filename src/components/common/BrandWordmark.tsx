import React from 'react';

interface BrandWordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  collapsed?: boolean;
  theme?: 'dark' | 'light';
  className?: string;
}

export const BrandWordmark: React.FC<BrandWordmarkProps> = ({
  size = 'md',
  showSubtitle = true,
  collapsed = false,
  theme = 'dark',
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
  };

  const titleSizes = {
    sm: 'text-xs tracking-wider',
    md: 'text-sm tracking-wider',
    lg: 'text-base tracking-wider',
  };

  const subtitleSizes = {
    sm: 'text-[9px]',
    md: 'text-[11px]',
    lg: 'text-xs',
  };

  return (
    <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} ${className}`}>
      {/* Official SNPSUNEXUS Logo Shield Emblem */}
      <div 
        className={`relative shrink-0 flex items-center justify-center rounded-xl overflow-hidden transition-all duration-200 ${
          collapsed ? 'w-10 h-10' : iconSizes[size]
        }`}
        title="SNPSUNEXUS Mail Studio"
      >
        <img 
          src="/assets/snpsunexus-logo.png" 
          alt="SNPSUNEXUS Shield Logo" 
          className="w-full h-full object-contain filter drop-shadow-xs"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            if (e.currentTarget.parentElement) {
              e.currentTarget.parentElement.classList.add('bg-gradient-to-br', 'from-[#1456AD]', 'to-[#172E58]', 'p-1.5', 'border', 'border-white/10');
            }
          }}
        />
      </div>

      {/* Brand Typography (Hidden when collapsed) */}
      {!collapsed && (
        <div className="flex flex-col min-w-0 transition-opacity duration-200">
          <div className="flex items-center gap-1.5">
            <span className={`font-black font-sans uppercase ${theme === 'light' ? 'text-[#172E58]' : 'text-white'} ${titleSizes[size]}`}>
              SNPSUNEXUS
            </span>
          </div>
          {showSubtitle && (
            <span className={`font-medium tracking-tight ${theme === 'light' ? 'text-[#64748B]' : 'text-slate-300'} ${subtitleSizes[size]}`}>
              Mail Studio
            </span>
          )}
        </div>
      )}
    </div>
  );
};
