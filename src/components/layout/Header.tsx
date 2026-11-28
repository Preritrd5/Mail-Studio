import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Bell,
  ChevronRight,
  LogIn,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { NavigationSection } from '../../types';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';

const sectionMeta: Record<NavigationSection, { title: string; breadcrumb: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard',
    breadcrumb: 'Dashboard',
    subtitle: 'Real-time email sending metrics and system status',
  },
  compose: {
    title: 'Compose Email',
    breadcrumb: 'Compose',
    subtitle: 'Draft single or targeted communications with template support',
  },
  'bulk-import': {
    title: 'Bulk Recipient Import',
    breadcrumb: 'Bulk Import',
    subtitle: 'Parse, validate, and batch process recipient lists (CSV / XLSX)',
  },
  'sending-queue': {
    title: 'Sending Queue',
    breadcrumb: 'Sending Queue',
    subtitle: 'Sequential dispatch engine monitoring and queue controls',
  },
  'email-activity': {
    title: 'Email Activity',
    breadcrumb: 'Email Activity',
    subtitle: 'Audit ledger of sent, pending, and failed communications',
  },
  'email-templates': {
    title: 'Email Templates',
    breadcrumb: 'Templates',
    subtitle: 'Reusable template repository with dynamic variable tokens',
  },
  reports: {
    title: 'Reports & Analytics',
    breadcrumb: 'Reports',
    subtitle: 'Performance reports, delivery breakdown, and data exports',
  },
};

export const Header: React.FC = () => {
  const {
    activeSection,
    toggleMobileMenu,
    addToast,
    isSidebarCollapsed,
    toggleSidebarCollapse,
  } = useApp();
  const { user, adminProfile, isAdmin, logout, openAuthModal } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { shouldRender: shouldRenderMenu, isClosing: isMenuClosing } = useAnimatedPresence(
    isProfileMenuOpen,
    150
  );

  const current = sectionMeta[activeSection] || {
    title: 'SNPSUNEXUS Mail Studio',
    breadcrumb: 'Dashboard',
    subtitle: 'Email Management Platform',
  };

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleNotificationClick = () => {
    addToast({
      type: 'info',
      title: 'Notifications',
      message: 'No new system notifications.',
    });
  };

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    await logout();
    addToast({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been signed out successfully.',
    });
  };

  const isAuthenticated = Boolean(user);
  const displayName =
    adminProfile?.displayName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '';
  const displayEmail = user?.email || adminProfile?.email || '';
  const initials = displayName
    ? displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n: string) => n[0].toUpperCase())
        .join('')
    : displayEmail
    ? displayEmail.slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#CBD5E1] px-4 sm:px-6 lg:px-8 py-3 shadow-xs transition-colors">
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-2 sm:gap-4 min-w-0">
        {/* Left: Mobile hamburger + Single Desktop Sidebar Toggle + Page Title + Breadcrumbs */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Mobile hamburger drawer toggle */}
          <button
            type="button"
            onClick={toggleMobileMenu}
            className="w-9 h-9 -ml-1 snpsu-icon-btn text-[#64748B] hover:text-[#172E58] hover:bg-[#F4F6FA] lg:hidden shrink-0"
            aria-label="Open sidebar drawer"
          >
            <Menu size={20} />
          </button>

          {/* Single Desktop sidebar expand/collapse toggle */}
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className="w-9 h-9 -ml-1 snpsu-icon-btn text-[#64748B] hover:text-[#172E58] hover:bg-[#F4F6FA] hidden lg:inline-flex shrink-0"
            title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={19} className="text-[#1456AD]" />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>

          <div className="min-w-0 flex-1">
            {/* Breadcrumb line */}
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] mb-0.5 min-w-0">
              <img
                src="/assets/snpsunexus-logo.png"
                alt="SNPSUNEXUS"
                className="w-3.5 h-4 object-contain shrink-0 lg:hidden"
              />
              <span className="hidden sm:inline truncate">SNPSUNEXUS Mail Studio</span>
              <ChevronRight size={11} className="text-slate-400 shrink-0 hidden sm:inline" />
              <span className="font-semibold text-[#1456AD] truncate">{current.breadcrumb}</span>
            </div>

            <h1 className="text-base sm:text-xl font-bold text-[#172E58] tracking-tight truncate leading-snug">
              {current.title}
            </h1>
            <p className="text-xs text-[#64748B] hidden md:block truncate mt-0.5">
              {current.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Quick actions & Authentication / Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Notifications bell */}
          <button
            type="button"
            onClick={handleNotificationClick}
            className="relative w-9 h-9 snpsu-icon-btn text-[#64748B] hover:text-[#172E58] hover:bg-[#F4F6FA] shrink-0"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>

          {/* Divider with refined #CBD5E1 border color */}
          <div className="h-6 w-px bg-[#CBD5E1] hidden sm:block shrink-0" />

          {/* Authentication & Profile Menu */}
          {isAuthenticated ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsProfileMenuOpen((prev) => !prev);
                }}
                className="flex items-center gap-2.5 pl-1 text-left p-1 rounded-xl hover:bg-[#F4F6FA] active:scale-[0.99] transition-all duration-150 snpsu-focus-ring cursor-pointer"
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="true"
              >
                <div className="relative shrink-0">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#172E58] text-white flex items-center justify-center font-semibold text-xs ring-2 ring-[#1456AD]/30 shadow-xs">
                    {initials}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                      isAdmin ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                </div>

                <div className="hidden md:flex flex-col text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#172E58] truncate max-w-[120px]">
                      {displayName || 'Administrator'}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                        isAdmin
                          ? 'text-[#1456AD] bg-[#1456AD]/10'
                          : 'text-amber-800 bg-amber-100'
                      }`}
                    >
                      {isAdmin ? 'Admin' : 'Pending'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#64748B] truncate max-w-[150px]">
                    {displayEmail}
                  </span>
                </div>

                <ChevronDown
                  size={14}
                  className={`text-[#64748B] hidden sm:block shrink-0 transition-transform duration-150 ease-out ${
                    isProfileMenuOpen ? 'rotate-180 text-[#172E58]' : ''
                  }`}
                />
              </button>

              {/* Profile Popover / Dropdown Menu */}
              {shouldRenderMenu && (
                <div
                  className={`absolute right-0 mt-2 w-64 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-[#CBD5E1] p-3 z-50 text-xs ${
                    isMenuClosing ? 'snpsu-dropdown-out pointer-events-none' : 'snpsu-dropdown-in'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-2 border-b border-[#CBD5E1] mb-2">
                    <div className="font-semibold text-[#172E58] text-sm truncate">
                      {displayName || 'Administrator'}
                    </div>
                    <div className="text-[11px] text-[#64748B] break-all">{displayEmail}</div>
                    <div className="mt-1.5">
                      <span className="text-[10px] font-medium text-[#1456AD] bg-[#1456AD]/10 px-2 py-0.5 rounded inline-block">
                        Administrator
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 active:scale-[0.99] font-medium transition-all duration-150 snpsu-focus-ring cursor-pointer"
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={openAuthModal}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 min-h-9 rounded-[10px] bg-[#1456AD] text-white hover:bg-[#0E448D] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(20,86,173,0.28)] active:translate-y-0 active:scale-[0.98] font-medium text-xs transition-all duration-150 ease-out shadow-sm snpsu-focus-ring cursor-pointer shrink-0 whitespace-nowrap"
            >
              <LogIn size={15} className="shrink-0" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
