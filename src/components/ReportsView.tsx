import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import {
  getDateRangeFromFilter,
  isTimestampInRange,
  toLocalDateInputValue,
} from '../lib/dateUtils';
import {
  canManageDataCleanup,
  canViewTechnicianWorkload,
  exportMemosToCsv,
  filterMemosByRole,
  MEMO_CATEGORIES,
  MEMO_STATUSES,
} from '../lib/memoUtils';
import type {
  DateFilterPreset,
  DateFilterState,
  MemoCategory,
  RepairMemo,
  SessionUser,
} from '../types';
import { AdminCleanupPanel } from './AdminCleanupPanel';
import { DateFilterBar } from './DateFilterBar';
import { StatusLabel } from './StatusLabel';

interface ReportsViewProps {
  user: SessionUser;
  memos: RepairMemo[];
  dateFilter: DateFilterState;
  onDateFilterChange: (next: DateFilterState) => void;
  onCleanupCompleted?: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  user,
  memos,
  dateFilter,
  onDateFilterChange,
  onCleanupCompleted,
}) => {
  const showTechnicianWorkload = canViewTechnicianWorkload(user);
  const showAdminCleanup = canManageDataCleanup(user);
  const roleScopedMemos = useMemo(() => filterMemosByRole(memos, user), [memos, user]);
  const resolvedRange = useMemo(() => getDateRangeFromFilter(dateFilter), [dateFilter]);

  const filteredMemos = useMemo(() => {
    return roleScopedMemos.filter((m) =>
      isTimestampInRange(m._reportedAtMs, resolvedRange)
    );
  }, [roleScopedMemos, resolvedRange]);

  const [exportPreset, setExportPreset] = useState<'active' | DateFilterPreset>('active');
  const [exportStartDate, setExportStartDate] = useState(() =>
    toLocalDateInputValue(new Date())
  );
  const [exportEndDate, setExportEndDate] = useState(() =>
    toLocalDateInputValue(new Date())
  );
  const [exportCategory, setExportCategory] = useState<MemoCategory | 'ALL'>('ALL');

  const exportFilterState: DateFilterState = useMemo(() => {
    if (exportPreset === 'active') return dateFilter;
    return {
      preset: exportPreset,
      startDate: exportStartDate,
      endDate: exportEndDate,
    };
  }, [exportPreset, dateFilter, exportStartDate, exportEndDate]);

  const exportResolvedRange = useMemo(
    () => getDateRangeFromFilter(exportFilterState),
    [exportFilterState]
  );

  const exportMemos = useMemo(() => {
    return roleScopedMemos.filter((m) => {
      if (!isTimestampInRange(m._reportedAtMs, exportResolvedRange)) return false;
      if (exportCategory !== 'ALL' && m.category !== exportCategory) return false;
      return true;
    });
  }, [roleScopedMemos, exportResolvedRange, exportCategory]);

  const technicianStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; done: number }>();
    for (const m of filteredMemos) {
      const name = m.technicianName?.trim() || 'Belum Ditugaskan';
      const current = map.get(name) ?? { name, total: 0, done: 0 };
      current.total++;
      if (m.status === 'Selesai' || m.status === 'Tervalidasi SPV') {
        current.done++;
      }
      map.set(name, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredMemos]);

  const completionRate = useMemo(() => {
    if (filteredMemos.length === 0) return 0;
    const finished = filteredMemos.filter(
      (m) => m.status === 'Selesai' || m.status === 'Tervalidasi SPV'
    ).length;
    return Math.round((finished / filteredMemos.length) * 100);
  }, [filteredMemos]);

  const handleDownloadCsv = () => {
    const stamp = toLocalDateInputValue(new Date());
    exportMemosToCsv(
      exportMemos,
      `rekap-memo-perbaikan-pura-offset-${stamp}.csv`
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Laporan & Rekapitulasi
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Ringkasan kinerja pemeliharaan mesin Unit Offset dan ekspor data ke Excel / Google Sheets.
        </p>
      </div>

      <DateFilterBar value={dateFilter} onChange={onDateFilterChange} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Laporan</span>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {filteredMemos.length}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tingkat Penyelesaian</span>
          <p className="mt-1.5 text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
            {completionRate}%
          </p>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tervalidasi SPV</span>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {filteredMemos.filter((m) => m.status === 'Tervalidasi SPV').length}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Dalam Proses / Antre</span>
          <p className="mt-1.5 text-2xl font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
            {
              filteredMemos.filter(
                (m) =>
                  m.status === 'Menunggu Pengerjaan' ||
                  m.status === 'Dalam Pengerjaan' ||
                  m.status === 'Menunggu Sparepart'
              ).length
            }
          </p>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Ekspor Rekap Memo (.csv)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Format UTF-8 BOM — dapat langsung dibuka di Microsoft Excel maupun Google Sheets.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Pilihan Tanggal Rekap
            </label>
            <select
              value={exportPreset}
              onChange={(e) =>
                setExportPreset(e.target.value as 'active' | DateFilterPreset)
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
            >
              <option value="active">Ikuti Filter Aktif ({resolvedRange.label})</option>
              <option value="today">Hari Ini</option>
              <option value="yesterday">Kemarin</option>
              <option value="7days">7 Hari Terakhir</option>
              <option value="month">Bulan Ini</option>
              <option value="custom">Tanggal / Rentang Custom</option>
              <option value="all">Semua Tanggal</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Kategori Rekap
            </label>
            <select
              value={exportCategory}
              onChange={(e) =>
                setExportCategory(e.target.value as MemoCategory | 'ALL')
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
            >
              <option value="ALL">Semua Kategori</option>
              {MEMO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {exportPreset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dari Tanggal Rekap
              </label>
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 min-h-[42px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sampai Tanggal Rekap
              </label>
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 min-h-[42px]"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            Periode ekspor: <strong>{exportResolvedRange.label}</strong> ·{' '}
            <strong>{exportMemos.length}</strong> memo siap diekspor
          </p>
          <button
            type="button"
            disabled={exportMemos.length === 0}
            onClick={handleDownloadCsv}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 disabled:opacity-50 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Rekap (.csv)</span>
          </button>
        </div>
      </div>

      {showAdminCleanup && (
        <AdminCleanupPanel
          user={user}
          onCleanupCompleted={onCleanupCompleted ?? (() => {})}
        />
      )}

      <div
        className={
          showTechnicianWorkload
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-4'
            : 'grid grid-cols-1 gap-4'
        }
      >
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Rekap Berdasarkan Status
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {MEMO_STATUSES.map((st) => {
              const count = filteredMemos.filter((m) => m.status === st).length;
              return (
                <div
                  key={st}
                  className="px-4 py-2.5 flex items-center justify-between text-sm"
                >
                  <StatusLabel status={st} />
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {showTechnicianWorkload && (
          <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Beban Penanganan Teknisi
              </h2>
            </div>
            {technicianStats.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Belum ada data pada periode ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {technicianStats.map((row) => (
                  <div
                    key={row.name}
                    className="px-4 py-2.5 flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-3">
                      {row.name}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {row.done}/{row.total} selesai
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
