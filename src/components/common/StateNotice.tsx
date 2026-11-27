import React from 'react';
import { AlertCircle, Database, Lock, RefreshCw, Inbox, LogIn } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { useAuth } from '../../context/AuthContext';

export type DataStateKind = 'loading' | 'auth_required' | 'error' | 'empty';

export interface ClassifiedApiError {
  isAuthError: boolean;
  isDatabaseError: boolean;
  statusCode?: number;
  errorCode?: string;
  message: string;
}

export function classifyApiError(err: any, fallbackMessage = 'Request failed'): ClassifiedApiError {
  const statusCode = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : undefined;
  const errorCode = err?.code || err?.errorCode;
  const message = err?.message || fallbackMessage;

  const isAuthError =
    statusCode === 401 ||
    statusCode === 403 ||
    errorCode === 'AUTH_REQUIRED' ||
    errorCode === 'UNAUTHORIZED' ||
    errorCode === 'INVALID_TOKEN' ||
    errorCode === 'FORBIDDEN' ||
    /authentication is required|sign-in|session|unauthorized|token/i.test(message);

  const isDatabaseError =
    statusCode === 503 ||
    errorCode === 'DATABASE_SCHEMA_MISSING' ||
    errorCode === 'DATABASE_UNAVAILABLE';

  return {
    isAuthError,
    isDatabaseError,
    statusCode,
    errorCode,
    message,
  };
}

interface StateNoticeProps {
  kind: DataStateKind;
  title?: string;
  message?: string;
  errorCode?: string;
  statusCode?: number;
  onRetry?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export const StateNotice: React.FC<StateNoticeProps> = ({
  kind,
  title,
  message,
  errorCode,
  statusCode,
  onRetry,
  actionLabel,
  onAction,
  compact = false,
}) => {
  const { openAuthModal } = useAuth();

  if (kind === 'loading') {
    const content = (
      <div className="flex flex-col items-center justify-center text-center py-8 gap-2.5">
        <RefreshCw size={22} className="animate-spin text-[#1456AD]" />
        <p className="text-xs font-semibold text-[#172E58]">{title || 'Loading live data from backend...'}</p>
        {message && <p className="text-[11px] text-[#64748B] max-w-md">{message}</p>}
      </div>
    );
    return compact ? content : <Card>{content}</Card>;
  }

  if (kind === 'auth_required') {
    return (
      <Card className="border-amber-200 bg-amber-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#172E58]">
                {title || 'Administrator Sign-In Required'}
              </h4>
              <p className="text-xs text-[#475569] mt-0.5 leading-relaxed">
                {message ||
                  'Live records in SNPSUNEXUS Mail Studio require an authenticated administrator session.'}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<LogIn size={14} />}
            onClick={() => openAuthModal()}
            className="shrink-0"
          >
            Sign In
          </Button>
        </div>
      </Card>
    );
  }

  if (kind === 'error') {
    const isSchemaMissing = errorCode === 'DATABASE_SCHEMA_MISSING';
    const isDb = isSchemaMissing || errorCode === 'DATABASE_UNAVAILABLE' || statusCode === 503;

    return (
      <Card className="border-rose-200 bg-rose-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
              {isDb ? <Database size={18} /> : <AlertCircle size={18} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-rose-900">
                  {title || (isSchemaMissing ? 'Database Schema Not Initialized' : isDb ? 'Database Service Unavailable' : 'Unable to Load Records')}
                </h4>
                {(errorCode || statusCode) && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                    {statusCode ? `HTTP ${statusCode}` : ''}{statusCode && errorCode ? ' • ' : ''}{errorCode || ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                {message || 'The backend API could not retrieve persisted records.'}
              </p>
            </div>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={onRetry}
              className="shrink-0 bg-white border-rose-300 text-rose-800 hover:bg-rose-50"
            >
              Retry
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // kind === 'empty'
  const emptyContent = (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-full bg-[#EBF3FC] text-[#1456AD] flex items-center justify-center mb-3">
        <Inbox size={22} />
      </div>
      <h4 className="text-sm font-bold text-[#172E58]">{title || 'No records yet'}</h4>
      {message && <p className="text-xs text-[#64748B] max-w-md mt-1 leading-relaxed">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );

  return compact ? emptyContent : <Card>{emptyContent}</Card>;
};
