import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ToastNotification } from '../../types';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[60] flex flex-col gap-2.5 sm:w-full sm:max-w-sm pointer-events-none">
      {toasts.map((toast: ToastNotification) => {
        const icons: Record<ToastNotification['type'], React.ReactNode> = {
          success: <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />,
          error: <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />,
          warning: <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />,
          info: <Info size={18} className="text-[#1456AD] shrink-0 mt-0.5" />,
        };

        const borderColors: Record<ToastNotification['type'], string> = {
          success: 'border-emerald-200 bg-white',
          error: 'border-rose-200 bg-white',
          warning: 'border-amber-200 bg-white',
          info: 'border-blue-200 bg-white',
        };

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto p-3.5 rounded-[12px] border shadow-elevation flex items-start gap-3 transition-all duration-200 ${borderColors[toast.type]}`}
          >
            {icons[toast.type]}

            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold text-[#172E58]">{toast.title}</h5>
              {toast.message && (
                <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug break-words">{toast.message}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#172E58] hover:bg-slate-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
