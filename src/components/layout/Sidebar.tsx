import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Send,
  UploadCloud,
  ListOrdered,
  Activity,
  FileCode2,
  BarChart3,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NavigationSection } from '../../types';
import { BrandWordmark } from '../common/BrandWordmark';

export const Sidebar: React.FC = () => {
  const {
    activeSection,
    navigateTo,
    isMobileMenuOpen,
    closeMobileMenu,
    isSidebarCollapsed,
    queueState,
  } = useApp();

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen, closeMobileMenu]);

  // Ensure mobile drawer automatically closes if viewport switches to desktop (>= 1024px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleResizeChange = (e: MediaQueryListEvent) => {
      if (e.matches && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };
    mq.addEventListener('change', handleResizeChange);
    return () => mq.removeEventListener('change', handleResizeChange);
  }, [isMobileMenuOpen, closeMobileMenu]);

  const navItems = [
    {
      id: 'dashboard' as NavigationSection,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      id: 'compose' as NavigationSection,
      label: 'Compose Email',
      icon: Send,
      badge: undefined,
    },
    {
      id: 'bulk-import' as NavigationSection,
      label: 'Bulk Import',
      icon: UploadCloud,
      badge: undefined,
    },
    {
      id: 'sending-queue' as NavigationSection,
      label: 'Sending Queue',
      icon: ListOrdered,
      badge: queueState.pendingCount > 0 ? String(queueState.pendingCount) : undefined,
      badgeVariant: 'gold' as const,
    },
    {
      id: 'email-activity' as NavigationSection,
      label: 'Email Activity',
      icon: Activity,
      badge: undefined,
    },
    {
      id: 'email-templates' as NavigationSection,
      label: 'Email Templates',
      icon: FileCode2,
      badge: undefined,
    },
    {
      id: 'reports' as NavigationSection,
      label: 'Reports',
      icon: BarChart3,
      badge: undefined,
    },
  ];

  const handleNavClick = (sectionId: NavigationSection) => {
    closeMobileMenu();
    navigateTo(sectionId);
  };

  return (
    <>
      {/* Mobile backdrop with subtle blur */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#172E58]/60 backdrop-blur-xs lg:hidden transition-opacity duration-200"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Deep Navy #172E58 */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#172E58] text-white flex flex-col border-r border-[#1F3C73] transition-transform duration-200 ease-out lg:transition-[width] ${
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        } ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Brand Header */}
        <div
          className={`py-4 border-b border-[#1F3C73]/80 flex items-center shrink-0 transition-all duration-200 ${
            isSidebarCollapsed ? 'px-4 justify-between lg:px-3 lg:justify-center' : 'px-5 justify-between'
          }`}
        >
          <div className="flex items-center min-w-0">
            {/* Desktop brand */}
            <div className="hidden lg:block">
              <BrandWordmark size="md" collapsed={isSidebarCollapsed} />
            </div>
            {/* Mobile drawer brand */}
            <div className="lg:hidden">
              <BrandWordmark size="md" collapsed={false} />
            </div>
          </div>

          {/* Mobile drawer close button */}
          <button
            type="button"
            onClick={closeMobileMenu}
            className="w-8 h-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 lg:hidden flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Close mobile navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Section */}
        <nav
          aria-label="Primary Navigation"
          className={`flex-1 px-3 py-4 space-y-1.5 ${
            isSidebarCollapsed ? 'overflow-y-auto lg:overflow-visible' : 'overflow-y-auto overflow-x-hidden'
          }`}
        >
          <div
            className={`px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider ${
              isSidebarCollapsed ? 'lg:hidden' : ''
            }`}
          >
            Navigation
          </div>
          {isSidebarCollapsed && <div className="hidden lg:block h-px bg-[#1F3C73]/60 my-2 mx-1" />}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center rounded-[10px] transition-colors cursor-pointer ${
                    isSidebarCollapsed
                      ? 'justify-between px-3 py-2.5 text-xs font-medium lg:justify-center lg:p-2.5 lg:h-11'
                      : 'justify-between px-3 py-2.5 text-xs font-medium min-h-10'
                  } ${
                    isActive
                      ? 'bg-[#1456AD] text-white shadow-sm shadow-[#1456AD]/30 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {/* Left Active Accent Indicator Bar when collapsed on desktop */}
                  {isSidebarCollapsed && isActive && (
                    <span className="hidden lg:block absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[#C69A4C]" />
                  )}

                  <div className={`flex items-center gap-3 min-w-0 ${isSidebarCollapsed ? 'lg:justify-center' : ''}`}>
                    <Icon
                      size={18}
                      className={`shrink-0 transition-colors ${
                        isActive ? 'text-[#E7C27B]' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />
                    <span className={`truncate ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                  </div>

                  {/* Badge in expanded mode (or mobile drawer) */}
                  {item.badge && (
                    <span
                      className={`ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded-md shrink-0 ${
                        isSidebarCollapsed ? 'lg:hidden' : ''
                      } ${
                        item.badgeVariant === 'gold'
                          ? 'bg-[#C69A4C] text-white shadow-xs'
                          : isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}

                  {/* Badge count in collapsed desktop mode */}
                  {isSidebarCollapsed && item.badge && (
                    <span
                      className="hidden lg:flex absolute top-1 right-2 min-w-[16px] h-4 px-1 bg-[#C69A4C] text-white text-[9px] font-bold rounded-full items-center justify-center shadow-xs"
                      title={`${item.badge} pending`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>

                {/* Floating Tooltip in collapsed desktop mode */}
                {isSidebarCollapsed && (
                  <div
                    role="tooltip"
                    className="hidden lg:group-hover:flex items-center gap-2 absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-[#0F1F3D] text-white text-xs font-semibold rounded-lg shadow-xl border border-[#1F3C73] whitespace-nowrap z-50 pointer-events-none"
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#C69A4C] text-white font-bold">
                        {item.badge}
                      </span>
                    )}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[#0F1F3D] border-l border-b border-[#1F3C73] rotate-45" />
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
