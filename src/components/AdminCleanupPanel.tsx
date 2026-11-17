import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  Search,
  Trash2,
} from 'lucide-react';
import {
  computeCutoffMsForMonthsAgo,
  formatBytesIndo,
  loadAdminCleanupPolicy,
  saveAdminCleanupPolicy,
} from '../lib/cleanupPolicy';
import { formatDateIndo } from '../lib/dateUtils';
import { exportMemosToCsv } from '../lib/memoUtils';
import {
  deleteMemosInBatches,
  fetchOldMemosForCleanup,
} from '../services/firestoreService';
import type { AutoCleanupPolicy, RepairMemo, SessionUser } from '../types';

interface AdminCleanupPanelProps {
  user: SessionUser;
  onCleanupCompleted: () => void;
}

const RETENTION_OPTIONS = [
  { months: 1, label: 'Lebih dari 1 bulan lalu' },
  { months: 3, label: 'Lebih dari 3 bulan lalu' },
  { months: 6, label: 'Lebih dari 6 bulan lalu' },
  { months: 9, label: 'Lebih dari 9 bulan lalu' },
  { months: 12, label: 'Lebih dari 12 bulan lalu (1 Tahun)' },
  { months: 18, label: 'Lebih dari 18 bulan lalu' },
  { months: 24, label: 'Lebih dari 24 bulan lalu (2 Tahun)' },
];

export const AdminCleanupPanel: React.FC<AdminCleanupPanelProps> = ({
  user,
  onCleanupCompleted,
}) => {
  const [policy, setPolicy] = useState<AutoCleanupPolicy>(() =>
    loadAdminCleanupPolicy(user.userId)
  );
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{
    deleted: number;
    total: number;
  } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const [scanResult, setScanResult] = useState<{
    memos: RepairMemo[];
    cutoffMs: number;
    estimatedBytes: number;
    months: number;
    onlyFinalized: boolean;
  } | null>(null);

  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const updatePolicy = (patch: Partial<AutoCleanupPolicy>) => {
    const next: AutoCleanupPolicy = { ...policy, ...patch };
    setPolicy(next);
    saveAdminCleanupPolicy(user.userId, next);
    setScanResult(null);
    setConfirmDeleteAll(false);
  };

  const handleScanOldMemos = async () => {
    setScanning(true);
    setFeedback(null);
    setConfirmDeleteAll(false);
    try {
      const result = await fetchOldMemosForCleanup(
        policy.retentionMonths,
        policy.onlyFinalized,
        user.userId
      );
      setScanResult({
        ...result,
        months: policy.retentionMonths,
        onlyFinalized: policy.onlyFinalized,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal memindai memo lama di server Firestore.',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleExportScanBackup = () => {
    if (!scanResult || scanResult.memos.length === 0) return;
    const cutoffStr = new Date(scanResult.cutoffMs).toISOString().slice(0, 10);
    exportMemosToCsv(
      scanResult.memos,
      `arsip-memo-sebelum-${cutoffStr}.csv`
    );
  };

  const handleExecuteCleanup = async () => {
    if (!scanResult || scanResult.memos.length === 0) return;
    setDeleting(true);
    setFeedback(null);
    setDeleteProgress({ deleted: 0, total: scanResult.memos.length });
    try {
      const ids = scanResult.memos.map((m) => m._docId);
      const count = await deleteMemosInBatches(ids, user.userId, (done, total) => {
        setDeleteProgress({ deleted: done, total });
      });

      const nextPolicy: AutoCleanupPolicy = {
        ...policy,
        lastRunAtMs: Date.now(),
        lastDeletedCount: count,
      };
      setPolicy(nextPolicy);
      saveAdminCleanupPolicy(user.userId, nextPolicy);

      setScanResult(null);
      setConfirmDeleteAll(false);
      setFeedback({
        type: 'ok',
        text: `${count} memo lama berhasil dihapus permanen dari database (${formatBytesIndo(
          scanResult.estimatedBytes
        )} dibebaskan).`,
      });
      onCleanupCompleted();
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menghapus arsip memo dari database.',
      });
    } finally {
      setDeleting(false);
      setDeleteProgress(null);
    }
  };

  const previewCutoffMs = computeCutoffMsForMonthsAgo(policy.retentionMonths);
  const photoCount = scanResult
    ? scanResult.memos.filter((m) => m.beforeImageUri || m.afterImageUri).length
    : 0;

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0">
          <Archive className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Arsip &amp; Hapus Otomatis Data Lama (Khusus Admin)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Bersihkan data memo beberapa bulan lalu secara massal atau aktifkan pembersihan otomatis saat akun Admin membuka aplikasi.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Batas Umur Memo yang Dihapus
          </label>
          <select
            value={policy.retentionMonths}
            onChange={(e) =>
              updatePolicy({ retentionMonths: Number(e.target.value) || 6 })
            }
            disabled={scanning || deleting}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
          >
            {RETENTION_OPTIONS.map((opt) => (
              <option key={opt.months} value={opt.months}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Batas tanggal lapor: sebelum{' '}
            <strong className="font-mono">{formatDateIndo(previewCutoffMs)}</strong>
          </p>
        </div>

        <div className="space-y-2.5 pt-1 sm:pt-5">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={policy.onlyFinalized}
              onChange={(e) => updatePolicy({ onlyFinalized: e.target.checked })}
              disabled={scanning || deleting}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-700 focus:ring-blue-700"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
              <strong>Hanya memo yang sudah final</strong> (Selesai, Tervalidasi SPV, atau Dibatalkan). Memo aktif tidak ikut terhapus.
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(e) => updatePolicy({ enabled: e.target.checked })}
              disabled={scanning || deleting}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-700 focus:ring-blue-700"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
              <strong>Jalankan otomatis saat Admin membuka aplikasi</strong> (pengecekan maksimal 1x per 24 jam).
            </span>
          </label>
        </div>
      </div>

      {policy.lastRunAtMs && (
        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
          Terakhir dijalankan: {formatDateIndo(policy.lastRunAtMs, true)} ·{' '}
          {policy.lastDeletedCount} memo dihapus
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={handleScanOldMemos}
          disabled={scanning || deleting}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 min-h-[44px]"
        >
          <Search className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          <span>
            {scanning
              ? 'Memeriksa Database...'
              : `Periksa Memo > ${policy.retentionMonths} Bulan Lalu`}
          </span>
        </button>
      </div>

      {scanResult && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-950/70 p-4 space-y-3">
          {scanResult.memos.length === 0 ? (
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Tidak ada memo yang lebih lama dari{' '}
                {formatDateIndo(scanResult.cutoffMs)} sesuai kriteria saat ini.
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>
                    Ditemukan <strong>{scanResult.memos.length} memo</strong>{' '}
                    (sebelum {formatDateIndo(scanResult.cutoffMs)}), termasuk{' '}
                    <strong>{photoCount} memo berfoto</strong>.
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                    Estimasi kapasitas database yang dibebaskan:{' '}
                    <strong>{formatBytesIndo(scanResult.estimatedBytes)}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleExportScanBackup}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[40px]"
                >
                  <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Unduh Cadangan CSV Dulu</span>
                </button>

                {!confirmDeleteAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(true)}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 min-h-[40px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Hapus Sekarang ({scanResult.memos.length} Memo)</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExecuteCleanup}
                      disabled={deleting}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60 min-h-[40px]"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>
                        {deleting && deleteProgress
                          ? `Menghapus ${deleteProgress.deleted}/${deleteProgress.total}...`
                          : `Ya, Hapus Permanen (${scanResult.memos.length} Memo)`}
                      </span>
                    </button>
                    {!deleting && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAll(false)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[40px]"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
};
