import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { formatDateIndo, getDateRangeFromFilter, isTimestampInRange } from '../lib/dateUtils';
import {
  canCreateMemo,
  filterMemosByRole,
  MEMO_CATEGORIES,
  MEMO_STATUSES,
} from '../lib/memoUtils';
import type {
  DateFilterState,
  MemoCategory,
  MemoStatus,
  RepairMemo,
  SessionUser,
} from '../types';
import { DateFilterBar } from './DateFilterBar';
import { StatusLabel } from './StatusLabel';

const PAGE_SIZE = 25;

interface MemoListViewProps {
  user: SessionUser;
  memos: RepairMemo[];
  loading: boolean;
  dateFilter: DateFilterState;
  onDateFilterChange: (next: DateFilterState) => void;
  onSelectMemo: (memo: RepairMemo) => void;
  onOpenCreate: () => void;
}

export const MemoListView: React.FC<MemoListViewProps> = ({
  user,
  memos,
  loading,
  dateFilter,
  onDateFilterChange,
  onSelectMemo,
  onOpenCreate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemoStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<MemoCategory | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const roleScopedMemos = useMemo(() => filterMemosByRole(memos, user), [memos, user]);
  const resolvedRange = useMemo(() => getDateRangeFromFilter(dateFilter), [dateFilter]);

  const filteredMemos = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return roleScopedMemos.filter((m) => {
      if (!isTimestampInRange(m._reportedAtMs, resolvedRange)) return false;
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) return false;
      if (q && !m._searchIndex.includes(q)) return false;
      return true;
    });
  }, [roleScopedMemos, resolvedRange, statusFilter, categoryFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredMemos.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, categoryFilter, dateFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedMemos = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredMemos.slice(start, start + PAGE_SIZE);
  }, [filteredMemos, page]);

  const isTech = user.role === 'TEKNISI';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Daftar Memo Perbaikan
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {isTech && user.specialization
              ? `Menampilkan semua memo (maks. 25/hal) · Total ${filteredMemos.length} memo · Bidang Anda: ${user.specialization}`
              : `Menampilkan maks. 25 memo per halaman · Total ${filteredMemos.length} memo`}
          </p>
        </div>

        {canCreateMemo(user) && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Memo</span>
          </button>
        )}
      </div>

      <DateFilterBar value={dateFilter} onChange={onDateFilterChange} compact />

      <div className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari no. memo, nama mesin, lokasi, pelapor, atau teknisi..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-9 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Hapus pencarian"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div>
            <select
              aria-label="Filter status memo"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MemoStatus | 'ALL')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
            >
              <option value="ALL">Semua Status</option>
              {MEMO_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px] ${
              categoryFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Semua Kategori
          </button>
          {MEMO_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px] ${
                categoryFilter === cat
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 h-20 animate-pulse bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : pagedMemos.length === 0 ? (
          <div className="p-10 text-center">
            <Wrench className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto mb-2.5" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Tidak ada memo yang cocok dengan filter
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Coba ubah kata kunci pencarian, status, atau rentang tanggal.
            </p>
            {canCreateMemo(user) && (
              <button
                type="button"
                onClick={onOpenCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Memo Baru</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 whitespace-nowrap">No. Memo</th>
                    <th className="py-3 px-4">Nama Mesin</th>
                    <th className="py-3 px-4 whitespace-nowrap">Kategori</th>
                    <th className="py-3 px-4 whitespace-nowrap">Pelapor</th>
                    <th className="py-3 px-4 whitespace-nowrap">Teknisi</th>
                    <th className="py-3 px-4 whitespace-nowrap">Tanggal Lapor</th>
                    <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {pagedMemos.map((memo) => (
                    <tr
                      key={memo.id}
                      onClick={() => onSelectMemo(memo)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {memo.memoNumber || memo.id.slice(0, 8)}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {memo.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {memo.location || '—'}
                          {(memo.beforeImageUri || memo.afterImageUri) && (
                            <span className="inline-flex items-center gap-1 ml-2 text-blue-700 dark:text-blue-400 font-medium">
                              · <Camera className="w-3 h-3 inline" /> Foto
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {memo.category}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {memo.reporterName}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {memo.technicianName || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                        {formatDateIndo(memo.reportedAt, true)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusLabel status={memo.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {pagedMemos.map((memo) => (
                <button
                  key={memo.id}
                  type="button"
                  onClick={() => onSelectMemo(memo)}
                  className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 transition-colors block"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      {memo.memoNumber || memo.id.slice(0, 8)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatDateIndo(memo.reportedAt, true)}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 line-clamp-2">
                    {memo.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{memo.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{memo.location || 'Tanpa lokasi'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Pelapor: {memo.reporterName}</span>
                    {memo.technicianName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Teknisi: {memo.technicianName}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <StatusLabel status={memo.status} />
                    {(memo.beforeImageUri || memo.afterImageUri) && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Lampiran Foto</span>
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                Menampilkan {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filteredMemos.length)} dari {filteredMemos.length} memo
                {' · '}Hal {page}/{totalPages}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 min-h-[40px]"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 min-h-[40px]"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
