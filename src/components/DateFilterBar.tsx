import React from 'react';
import { Calendar, Globe } from 'lucide-react';
import { getDateRangeFromFilter, toLocalDateInputValue } from '../lib/dateUtils';
import type { DateFilterPreset, DateFilterState } from '../types';

interface DateFilterBarProps {
  value: DateFilterState;
  onChange: (next: DateFilterState) => void;
  compact?: boolean;
  isDateSearchOverride?: boolean;
}

const PRESETS: { id: DateFilterPreset; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'today', label: 'Hari Ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: '7days', label: '7 Hari' },
  { id: 'month', label: 'Bulan Ini' },
  { id: 'custom', label: 'Custom' },
];

export const DateFilterBar: React.FC<DateFilterBarProps> = ({
  value,
  onChange,
  compact = false,
  isDateSearchOverride = false,
}) => {
  const resolved = getDateRangeFromFilter(value);

  const handlePresetClick = (preset: DateFilterPreset) => {
    if (preset === 'custom') {
      const todayStr = toLocalDateInputValue(new Date());
      onChange({
        preset: 'custom',
        startDate: value.startDate || todayStr,
        endDate: value.endDate || todayStr,
      });
    } else {
      onChange({ ...value, preset });
    }
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
          <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span>Filter Tanggal Memo:</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {resolved.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {PRESETS.map((p) => {
            const active = value.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetClick(p.id)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {value.preset === 'custom' && (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            compact ? 'gap-2.5' : 'gap-3'
          } pt-2 border-t border-slate-100 dark:border-slate-800`}
        >
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Dari Tanggal (atau Tanggal Tunggal)
            </span>
            <input
              type="date"
              value={value.startDate}
              onChange={(e) =>
                onChange({
                  ...value,
                  preset: 'custom',
                  startDate: e.target.value,
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Sampai Tanggal (opsional)
            </span>
            <input
              type="date"
              value={value.endDate}
              onChange={(e) =>
                onChange({
                  ...value,
                  preset: 'custom',
                  endDate: e.target.value,
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
            />
          </label>
        </div>
      )}

      {isDateSearchOverride && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-blue-700 dark:text-blue-400">
          <span className="inline-flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>
              Menarik data tanggal <strong>{resolved.label}</strong> langsung dari server.
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, preset: 'all' })}
            className="font-semibold underline shrink-0"
          >
            Kembali ke Default
          </button>
        </div>
      )}
    </div>
  );
};
