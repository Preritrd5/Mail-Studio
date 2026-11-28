import { NavigationSection } from '../types';

export interface RouteDefinition {
  section: NavigationSection;
  path: string;
  aliases: string[];
  label: string;
}

export const APP_ROUTES: RouteDefinition[] = [
  {
    section: 'dashboard',
    path: '/dashboard',
    aliases: ['/'],
    label: 'Dashboard',
  },
  {
    section: 'compose',
    path: '/compose',
    aliases: [],
    label: 'Compose Email',
  },
  {
    section: 'bulk-import',
    path: '/bulk-import',
    aliases: [],
    label: 'Bulk Import',
  },
  {
    section: 'sending-queue',
    path: '/queue',
    aliases: ['/sending-queue'],
    label: 'Sending Queue',
  },
  {
    section: 'email-activity',
    path: '/activity',
    aliases: ['/email-activity'],
    label: 'Email Activity',
  },
  {
    section: 'email-templates',
    path: '/templates',
    aliases: ['/email-templates'],
    label: 'Email Templates',
  },
  {
    section: 'reports',
    path: '/reports',
    aliases: [],
    label: 'Reports',
  },
];

export const SECTION_TO_PATH: Record<NavigationSection, string> = {
  dashboard: '/dashboard',
  compose: '/compose',
  'bulk-import': '/bulk-import',
  'sending-queue': '/queue',
  'email-activity': '/activity',
  'email-templates': '/templates',
  reports: '/reports',
};

/**
 * Resolves the active navigation section from a URL pathname,
 * supporting both canonical paths (/queue) and legacy aliases (/sending-queue)
 * as well as nested sub-routes (/templates/123, /compose/draft, etc.).
 */
export function getSectionFromPathname(pathname: string): NavigationSection | null {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  if (!normalized || normalized === '/') {
    return 'dashboard';
  }

  for (const route of APP_ROUTES) {
    if (normalized === route.path || normalized.startsWith(`${route.path}/`)) {
      return route.section;
    }
    for (const alias of route.aliases) {
      if (alias !== '/' && (normalized === alias || normalized.startsWith(`${alias}/`))) {
        return route.section;
      }
    }
  }

  return null;
}

export function getPathForSection(section: NavigationSection): string {
  return SECTION_TO_PATH[section] || '/dashboard';
}

/**
 * Validates and sanitizes redirect query parameters so post-login redirects
 * stay strictly within in-app routes and never loop back to /login.
 */
export function getSafeRedirectTarget(rawTarget: string | null | undefined, fallback = '/dashboard'): string {
  if (!rawTarget || typeof rawTarget !== 'string') return fallback;
  const trimmed = rawTarget.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }
  const pathOnly = trimmed.split(/[?#]/)[0];
  if (pathOnly === '/login' || pathOnly.startsWith('/login/')) {
    return fallback;
  }
  return trimmed;
}
