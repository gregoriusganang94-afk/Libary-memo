import React from 'react';
import { Database } from 'lucide-react';
import {
  getCurrentMonthInputValue,
  resolveLoadScopeRange,
} from '../lib/cleanupPolicy';
import type { DataLoadScope, DataLoadScopeMode } from '../types';

interface DataScopeBarProps {
  value: DataLoadScope;
  loadedCount: number;
  loading?: boolean;
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
  value,
  loadedCount,
  loading = false,
  onChange,
}) => {
  const resolved = resolveLoadScopeRange(value);

  const handleModeClick = (mode: DataLoadScopeMode) => {
    onChange({
      mode,
      monthValue: value.monthValue || getCurrentMonthInputValue(),
    });
  };

  return (
    <div className="mb-4 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:px-4 sm:py-3 space-y-2.5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Database className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
          <div className="leading-snug">
            <span>Muat Data Server: </span>
            <strong className="text-slate-900 dark:text-slate-100">
              {resolved.label}
            </strong>
            <span className="ml-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              ({loading ? 'memuat...' : `${loadedCount} memo di perangkat`})
            </span>
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
                  onClick={() => handleModeClick(opt.id)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap min-h-[34px] ${
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
              aria-label="Pilih bulan dan tahun dari server"
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

      {value.mode !== 'all' ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Mode ringan aktif: hanya memo pada periode terpilih dan memo yang masih belum selesai yang diunduh ke HP agar RAM &amp; kuota server tetap hemat.
        </p>
      ) : (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
          Mode Arsip Penuh aktif: seluruh riwayat memo dimuat ke perangkat. Kembalikan ke &ldquo;1 Bulan&rdquo; setelah selesai agar penggunaan perangkat tetap ringan.
        </p>
      )}
    </div>
  );
};
