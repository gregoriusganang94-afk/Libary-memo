import React from 'react';
import { Database, Globe } from 'lucide-react';
import {
  getCurrentMonthInputValue,
  resolveLoadScopeRange,
} from '../lib/cleanupPolicy';
import { formatDateIndo } from '../lib/dateUtils';
import type {
  DataLoadScope,
  DataLoadScopeMode,
  GlobalLoadScopeState,
} from '../types';

interface DataScopeBarProps {
  globalState: GlobalLoadScopeState;
  loadedCount: number;
  loading?: boolean;
  saving?: boolean;
  feedback?: { type: 'ok' | 'err'; text: string } | null;
  onChange: (next: DataLoadScope) => void;
}

const SCOPE_OPTIONS: { id: DataLoadScopeMode; label: string }[] = [
  { id: '1m', label: '1 Bulan' },
  { id: '3m', label: '3 Bulan' },
  { id: '6m', label: '6 Bulan' },
  { id: 'month', label: 'Pilih Bulan' },
  { id: 'all', label: 'Semua' },
];

export const DataScopeBar: React.FC<DataScopeBarProps> = ({
  globalState,
  loadedCount,
  loading = false,
  saving = false,
  feedback = null,
  onChange,
}) => {
  const value = globalState.scope;
  const resolved = resolveLoadScopeRange(value);

  const handleModeClick = (mode: DataLoadScopeMode) => {
    onChange({
      mode,
      monthValue: value.monthValue || getCurrentMonthInputValue(),
    });
  };

  return (
    <div className="mb-4 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:px-4 sm:py-3.5 space-y-2.5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Database className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="leading-snug space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Kontrol Muat Data Server (Semua Perangkat):
              </span>
              <strong className="text-blue-700 dark:text-blue-400">
                {resolved.label}
              </strong>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                ({loading ? 'memuat...' : `${loadedCount} memo dimuat`})
              </span>
            </div>
            {globalState.updatedAt && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Globe className="w-3 h-3 shrink-0" />
                <span>
                  Disinkronkan ke semua perangkat oleh{' '}
                  <strong>{globalState.updatedBy || 'Admin'}</strong> ·{' '}
                  {formatDateIndo(globalState.updatedAt, true)}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {SCOPE_OPTIONS.map((opt) => {
              const active = value.mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={saving}
                  onClick={() => handleModeClick(opt.id)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap min-h-[34px] disabled:opacity-60 ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {value.mode === 'month' && (
            <input
              type="month"
              aria-label="Pilih bulan dan tahun default untuk semua perangkat"
              disabled={saving}
              value={value.monthValue || getCurrentMonthInputValue()}
              onChange={(e) =>
                onChange({
                  mode: 'month',
                  monthValue: e.target.value || getCurrentMonthInputValue(),
                })
              }
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[36px]"
            />
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        {saving
          ? 'Menyimpan pengaturan muat server untuk semua perangkat...'
          : value.mode !== 'all'
          ? 'Menu ini khusus Admin. Semua perangkat lain otomatis memuat periode ini saat dibuka, kecuali jika pengguna mencari memo berdasarkan tanggal lama.'
          : 'Semua riwayat memo aktif dimuat ke semua perangkat saat dibuka. Disarankan kembali ke 1–3 Bulan agar perangkat lain tetap ringan.'}
      </p>

      {feedback && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11px] font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200'
              : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
};
