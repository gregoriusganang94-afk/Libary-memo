import React, { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  PackageOpen,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { formatDateIndo, getDateRangeFromFilter, isTimestampInRange } from '../lib/dateUtils';
import { filterMemosByRole, MEMO_CATEGORIES, MEMO_STATUSES } from '../lib/memoUtils';
import type { DateFilterState, RepairMemo, SessionUser } from '../types';
import { DateFilterBar } from './DateFilterBar';
import { StatusLabel } from './StatusLabel';

interface DashboardViewProps {
  user: SessionUser;
  memos: RepairMemo[];
  loading: boolean;
  dateFilter: DateFilterState;
  onDateFilterChange: (next: DateFilterState) => void;
  onSelectMemo: (memo: RepairMemo) => void;
  onNavigateToMemos: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  memos,
  loading,
  dateFilter,
  onDateFilterChange,
  onSelectMemo,
  onNavigateToMemos,
}) => {
  const roleScopedMemos = useMemo(() => filterMemosByRole(memos, user), [memos, user]);
  const resolvedRange = useMemo(() => getDateRangeFromFilter(dateFilter), [dateFilter]);

  const filteredMemos = useMemo(() => {
    return roleScopedMemos.filter((m) =>
      isTimestampInRange(m._reportedAtMs, resolvedRange)
    );
  }, [roleScopedMemos, resolvedRange]);

  const stats = useMemo(() => {
    let waiting = 0;
    let inProgress = 0;
    let waitingParts = 0;
    let done = 0;
    let validated = 0;
    let cancelled = 0;

    const byCategory: Record<string, { total: number; finished: number }> = {
      Listrik: { total: 0, finished: 0 },
      Mekanik: { total: 0, finished: 0 },
      Workshop: { total: 0, finished: 0 },
    };

    for (const m of filteredMemos) {
      if (m.status === 'Menunggu Pengerjaan') waiting++;
      else if (m.status === 'Dalam Pengerjaan') inProgress++;
      else if (m.status === 'Menunggu Sparepart') waitingParts++;
      else if (m.status === 'Selesai') done++;
      else if (m.status === 'Tervalidasi SPV') validated++;
      else if (m.status === 'Dibatalkan') cancelled++;

      if (byCategory[m.category]) {
        byCategory[m.category].total++;
        if (m.status === 'Selesai' || m.status === 'Tervalidasi SPV') {
          byCategory[m.category].finished++;
        }
      }
    }

    return {
      total: filteredMemos.length,
      waiting,
      inProgress,
      waitingParts,
      done,
      validated,
      cancelled,
      activeWork: waiting + inProgress + waitingParts,
      completedAll: done + validated,
      byCategory,
    };
  }, [filteredMemos]);

  const visibleCategories = useMemo(() => {
    if (user.role === 'TEKNISI' && user.specialization) {
      return [user.specialization];
    }
    return MEMO_CATEGORIES;
  }, [user]);

  const recentMemos = useMemo(() => filteredMemos.slice(0, 6), [filteredMemos]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Ringkasan Pemeliharaan
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {user.role === 'TEKNISI' && user.specialization
              ? `Menampilkan khusus memo bidang ${user.specialization} · ${user.fullName}`
              : `${user.fullName} · ${user.role} (Semua Kategori)`}
          </p>
        </div>
      </div>

      <DateFilterBar value={dateFilter} onChange={onDateFilterChange} />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse p-4"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Total Memo</span>
                <ClipboardList className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {stats.total}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {resolvedRange.label}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Belum Selesai</span>
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                {stats.activeWork}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.waiting} antre · {stats.inProgress} proses
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Tunggu Sparepart</span>
                <PackageOpen className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-orange-700 dark:text-orange-400 font-mono tabular-nums">
                {stats.waitingParts}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Menunggu suku cadang
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Selesai & Valid</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                {stats.completedAll}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.done} selesai · {stats.validated} valid SPV
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                Distribusi Kategori
              </h2>
              <div className="space-y-3.5">
                {visibleCategories.map((cat) => {
                  const row = stats.byCategory[cat] ?? { total: 0, finished: 0 };
                  const pct = row.total > 0 ? Math.round((row.finished / row.total) * 100) : 0;
                  return (
                    <div key={cat} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{cat}</span>
                        <span className="text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                          {row.finished}/{row.total} selesai ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-700 dark:bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                Rincian Status Alur
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {MEMO_STATUSES.map((st) => {
                  const count = filteredMemos.filter((m) => m.status === st).length;
                  return (
                    <div
                      key={st}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <StatusLabel status={st} />
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Memo Terbaru pada Periode Ini
              </h2>
              <button
                type="button"
                onClick={onNavigateToMemos}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap py-1 px-2"
              >
                <span>Lihat Semua</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentMemos.length === 0 ? (
              <div className="p-8 text-center">
                <Wrench className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Belum ada memo pada periode {resolvedRange.label}.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ubah filter tanggal di atas untuk melihat periode lainnya.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentMemos.map((memo) => (
                  <button
                    key={memo.id}
                    type="button"
                    onClick={() => onSelectMemo(memo)}
                    className="w-full text-left px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-h-[56px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                          {memo.memoNumber || memo.id.slice(0, 8)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{memo.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{memo.location || 'Lokasi belum diisi'}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                        {memo.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        Pelapor: {memo.reporterName} · {formatDateIndo(memo.reportedAt, true)}
                        {memo.technicianName ? ` · Teknisi: ${memo.technicianName}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <StatusLabel status={memo.status} />
                      {memo.status === 'Selesai' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 hidden sm:inline" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
