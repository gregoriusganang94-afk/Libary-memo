import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardPlus,
  ImageOff,
  Lock,
  PackagePlus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Unlock,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { formatDateIndo } from '../lib/dateUtils';
import {
  canClaimMemo,
  canDeleteMemo,
  canReopenMemo,
  canValidateMemo,
  canWorkMemo,
  compressImageToDataUrl,
  isMemoLockedByStatus,
  isRenderableImageUri,
  parseActionLogs,
  parsePartsList,
  serializeActionLogs,
  serializePartsList,
} from '../lib/memoUtils';
import {
  deleteRepairMemo,
  formatValueForSchema,
  updateRepairMemo,
} from '../services/firestoreService';
import type { ActionLogEntry, PartEntry, RepairMemo, SessionUser } from '../types';
import { StatusLabel } from './StatusLabel';

interface MemoDetailModalProps {
  user: SessionUser;
  memo: RepairMemo;
  onClose: () => void;
}

export const MemoDetailModal: React.FC<MemoDetailModalProps> = ({
  user,
  memo,
  onClose,
}) => {
  const isLocked = isMemoLockedByStatus(memo.status);
  const canClaim = canClaimMemo(user, memo);
  const canWork = canWorkMemo(user, memo);
  const canReopen = canReopenMemo(user, memo);
  const canValidate = canValidateMemo(user);
  const canDelete = canDeleteMemo(user, memo);

  const actionLogs = useMemo(
    () => parseActionLogs(memo.actionLogsJson),
    [memo.actionLogsJson]
  );
  const partsList = useMemo(
    () => parsePartsList(memo.partsListJson),
    [memo.partsListJson]
  );

  const [notesInput, setNotesInput] = useState(memo.notes);
  const [validationNotesInput, setValidationNotesInput] = useState(memo.validationNotes);
  const [newLogNote, setNewLogNote] = useState('');
  const [partName, setPartName] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partUnit, setPartUnit] = useState('pcs');
  const [partNotes, setPartNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'before' | 'after' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setNotesInput(memo.notes);
    setValidationNotesInput(memo.validationNotes);
  }, [memo._docId, memo.notes, memo.validationNotes]);

  const appendLog = (action: string, note: string): string => {
    const entry: ActionLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: user.fullName,
      actorUserId: user.userId,
      role: user.role,
      action,
      note,
    };
    return serializeActionLogs([...actionLogs, entry]);
  };

  const runUpdate = async (
    updates: Parameters<typeof updateRepairMemo>[1],
    successText: string
  ): Promise<boolean> => {
    setSaving(true);
    setFeedback(null);
    try {
      await updateRepairMemo(memo._docId, updates, user.userId);
      setFeedback({ type: 'ok', text: successText });
      return true;
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memperbarui memo.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleClaim = () => {
    runUpdate(
      {
        technicianName: user.fullName,
        status: 'Dalam Pengerjaan',
        actionLogsJson: appendLog(
          'Klaim Pengerjaan',
          `Memo diklaim dan mulai dikerjakan oleh ${user.fullName}.`
        ),
      },
      'Memo berhasil diklaim untuk dikerjakan.'
    );
  };

  const handleSetWaitingParts = () => {
    runUpdate(
      {
        technicianName: memo.technicianName || user.fullName,
        status: 'Menunggu Sparepart',
        notes: notesInput,
        actionLogsJson: appendLog(
          'Menunggu Sparepart',
          notesInput.trim() || 'Status diubah ke Menunggu Sparepart.'
        ),
      },
      'Status diperbarui ke Menunggu Sparepart.'
    );
  };

  const handleResumeWork = () => {
    runUpdate(
      {
        technicianName: memo.technicianName || user.fullName,
        status: 'Dalam Pengerjaan',
        actionLogsJson: appendLog(
          'Lanjut Pengerjaan',
          'Perbaikan dilanjutkan kembali.'
        ),
      },
      'Status kembali ke Dalam Pengerjaan.'
    );
  };

  const handleCompleteWork = async () => {
    const completedVal = formatValueForSchema(Date.now(), memo._rawReportedAtType);
    const ok = await runUpdate(
      {
        technicianName: memo.technicianName || user.fullName,
        status: 'Selesai',
        notes: notesInput,
        completedAt: completedVal,
        actionLogsJson: appendLog(
          'Perbaikan Selesai',
          notesInput.trim() || `Perbaikan diselesaikan oleh ${memo.technicianName || user.fullName}.`
        ),
      },
      'Perbaikan ditandai Selesai. Menunggu validasi Supervisor.'
    );
    if (ok) {
      setShowCompletionPopup(true);
    }
  };

  const handleReopenMemo = () => {
    runUpdate(
      {
        status: 'Dalam Pengerjaan',
        completedAt: null,
        actionLogsJson: appendLog(
          'Memo Dibuka Kembali',
          `Memo dibuka kembali oleh Admin (${user.fullName}) untuk penyesuaian.`
        ),
      },
      'Memo berhasil dibuka kembali. Catatan dan suku cadang kini dapat diedit.'
    );
  };

  const handleValidateSpv = () => {
    runUpdate(
      {
        status: 'Tervalidasi SPV',
        validatedBy: user.fullName,
        validationNotes: validationNotesInput.trim(),
        actionLogsJson: appendLog(
          'Tervalidasi SPV',
          validationNotesInput.trim() || `Divalidasi oleh ${user.fullName}.`
        ),
      },
      'Memo berhasil divalidasi (Tervalidasi SPV).'
    );
  };

  const handleRequestRevision = () => {
    if (!validationNotesInput.trim()) {
      setFeedback({
        type: 'err',
        text: 'Isi catatan revisi terlebih dahulu agar teknisi mengetahui perbaikannya.',
      });
      return;
    }
    runUpdate(
      {
        status: 'Dalam Pengerjaan',
        validatedBy: user.fullName,
        validationNotes: validationNotesInput.trim(),
        actionLogsJson: appendLog(
          'Minta Revisi',
          `Revisi diminta oleh ${user.fullName}: ${validationNotesInput.trim()}`
        ),
      },
      'Permintaan revisi dikirim ke teknisi.'
    );
  };

  const handleCancelMemo = () => {
    runUpdate(
      {
        status: 'Dibatalkan',
        validationNotes: validationNotesInput.trim(),
        actionLogsJson: appendLog(
          'Dibatalkan',
          validationNotesInput.trim() || `Memo dibatalkan oleh ${user.fullName}.`
        ),
      },
      'Memo telah dibatalkan.'
    );
    setConfirmCancel(false);
  };

  const handleSaveNotes = () => {
    runUpdate(
      {
        notes: notesInput.trim(),
      },
      'Catatan pengerjaan disimpan.'
    );
  };

  const handleAddActionLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogNote.trim()) return;
    const nextLogs = appendLog('Log Tindakan', newLogNote.trim());
    setNewLogNote('');
    runUpdate({ actionLogsJson: nextLogs }, 'Log tindakan ditambahkan.');
  };

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) return;
    const newPart: PartEntry = {
      id: `part-${Date.now()}`,
      name: partName.trim(),
      quantity: partQty.trim() || '1',
      unit: partUnit.trim() || 'pcs',
      notes: partNotes.trim() || undefined,
    };
    const nextParts = [...partsList, newPart];
    setPartName('');
    setPartQty('1');
    setPartUnit('pcs');
    setPartNotes('');
    runUpdate(
      { partsListJson: serializePartsList(nextParts) },
      'Suku cadang ditambahkan.'
    );
  };

  const handleRemovePart = (partId: string) => {
    const nextParts = partsList.filter((p) => p.id !== partId);
    runUpdate(
      { partsListJson: serializePartsList(nextParts) },
      'Suku cadang dihapus.'
    );
  };

  const handleImageChange = async (
    field: 'before' | 'after',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingField(field);
    setFeedback(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const updatePayload =
        field === 'before'
          ? { beforeImageUri: dataUrl }
          : { afterImageUri: dataUrl };
      await updateRepairMemo(memo._docId, updatePayload, user.userId);
      setFeedback({
        type: 'ok',
        text: `Foto ${field === 'before' ? 'Sebelum' : 'Sesudah'} berhasil disimpan.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengunggah foto.',
      });
    } finally {
      setUploadingField(null);
    }
  };

  const handleDeleteMemo = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await deleteRepairMemo(memo._docId, user.userId);
      onClose();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus memo.',
      });
      setSaving(false);
    }
  };

  const isWorkshop =
    memo.category === 'Workshop' ||
    Boolean(memo.beforeImageUri) ||
    Boolean(memo.afterImageUri);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[94vh] flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {memo.memoNumber || memo.id}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{memo.category}</span>
              <span aria-hidden="true">·</span>
              <StatusLabel status={memo.status} />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
              {memo.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail memo"
            className="p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
          {feedback && (
            <div
              role="status"
              className={`rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
                feedback.type === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200'
                  : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Lokasi</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                {memo.location || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Pelapor</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                {memo.reporterName || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Tanggal Lapor</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5 block">
                {formatDateIndo(memo.reportedAt, true)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Teknisi Penanggung Jawab</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                {memo.technicianName || 'Belum diklaim'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Tanggal Selesai</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5 block">
                {memo.completedAt ? formatDateIndo(memo.completedAt, true) : '—'}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Deskripsi Kerusakan
            </h3>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              {memo.description || 'Tidak ada deskripsi tambahan.'}
            </p>
          </div>

          {isLocked ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    Form Memo Terkunci ({memo.status})
                  </p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Catatan pengerjaan dan daftar suku cadang tidak dapat diedit saat status sudah{' '}
                    {memo.status}. Hanya akun Admin yang dapat membuka kembali memo ini jika diperlukan.
                  </p>
                </div>
              </div>
              {canReopen && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleReopenMemo}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 disabled:opacity-60 min-h-[42px] shrink-0"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Open Memo Kembali</span>
                </button>
              )}
            </div>
          ) : (canClaim || canWork) ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Tindakan Pengerjaan ({user.role === 'TEKNISI' ? `Teknisi ${user.specialization}` : 'Admin'})
              </h3>
              <div className="flex flex-wrap gap-2">
                {canClaim && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleClaim}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 min-h-[42px]"
                  >
                    <Wrench className="w-4 h-4" />
                    <span>Klaim & Kerjakan</span>
                  </button>
                )}

                {canWork && memo.status === 'Dalam Pengerjaan' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSetWaitingParts}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-orange-800 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/50 disabled:opacity-60 min-h-[42px]"
                  >
                    <span>Menunggu Sparepart</span>
                  </button>
                )}

                {canWork && memo.status === 'Menunggu Sparepart' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleResumeWork}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 min-h-[42px]"
                  >
                    <span>Lanjut Pengerjaan</span>
                  </button>
                )}

                {canWork &&
                  (memo.status === 'Dalam Pengerjaan' ||
                    memo.status === 'Menunggu Sparepart' ||
                    memo.status === 'Menunggu Pengerjaan') && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleCompleteWork}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 min-h-[42px]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Selesaikan Perbaikan</span>
                  </button>
                )}
              </div>
              {canClaim && !canWork && user.role === 'TEKNISI' && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Ketuk <strong>Klaim & Kerjakan</strong> untuk mengambil memo ini dan membuka pengisian form catatan serta suku cadang.
                </p>
              )}
            </div>
          ) : user.role === 'TEKNISI' && memo.technicianName.trim() ? (
            <div className="border border-amber-200 dark:border-amber-900 rounded-xl p-3.5 bg-amber-50 dark:bg-amber-950/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Memo ini sedang ditangani oleh <strong>{memo.technicianName}</strong>. Hanya akun teknisi tersebut dan Admin yang dapat memilih proses pengerjaan maupun mengisi form memo.
              </p>
            </div>
          ) : user.role === 'TEKNISI' && !canClaim && !canWork ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-950 flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
              <p>
                Memo kategori <strong>{memo.category}</strong> hanya dapat diambil dan dikerjakan oleh Teknisi bidang <strong>{memo.category}</strong> (bidang Anda: {user.specialization || 'belum diatur'}).
              </p>
            </div>
          ) : null}

          {isWorkshop && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Dokumentasi Foto Workshop (Sebelum & Sesudah)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-950 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Foto Sebelum
                    </span>
                    {canWork && memo.status !== 'Tervalidasi SPV' && (
                      <label className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 cursor-pointer py-1 px-2">
                        <Camera className="w-3.5 h-3.5" />
                        <span>
                          {uploadingField === 'before' ? 'Mengunggah...' : 'Unggah'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleImageChange('before', e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  {isRenderableImageUri(memo.beforeImageUri) ? (
                    <img
                      src={memo.beforeImageUri}
                      alt="Kondisi sebelum perbaikan"
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-contain rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                    />
                  ) : memo.beforeImageUri ? (
                    <div className="h-44 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-4 text-center">
                      <ImageOff className="w-6 h-6 text-slate-400 mb-1.5" />
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Foto berasal dari penyimpanan lokal Android ({memo.beforeImageUri.slice(0, 20)}...). Unggah ulang dari web jika perlu.
                      </p>
                    </div>
                  ) : (
                    <div className="h-44 rounded-lg bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                      Belum ada foto sebelum
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-950 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Foto Sesudah
                    </span>
                    {canWork && memo.status !== 'Tervalidasi SPV' && (
                      <label className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 cursor-pointer py-1 px-2">
                        <Camera className="w-3.5 h-3.5" />
                        <span>
                          {uploadingField === 'after' ? 'Mengunggah...' : 'Unggah'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleImageChange('after', e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  {isRenderableImageUri(memo.afterImageUri) ? (
                    <img
                      src={memo.afterImageUri}
                      alt="Kondisi sesudah perbaikan"
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-contain rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                    />
                  ) : memo.afterImageUri ? (
                    <div className="h-44 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-4 text-center">
                      <ImageOff className="w-6 h-6 text-slate-400 mb-1.5" />
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Foto berasal dari penyimpanan lokal Android ({memo.afterImageUri.slice(0, 20)}...). Unggah ulang dari web jika perlu.
                      </p>
                    </div>
                  ) : (
                    <div className="h-44 rounded-lg bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                      Belum ada foto sesudah
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Catatan Pengerjaan / Teknisi
            </h3>
            {canWork ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Tulis catatan teknis, hasil pengecekan, atau kendala..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveNotes}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[38px]"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Catatan</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                {memo.notes || 'Belum ada catatan teknisi.'}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Daftar Suku Cadang Digunakan ({partsList.length})
            </h3>
            {partsList.length > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {partsList.map((part) => (
                  <div
                    key={part.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-950 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {part.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        Jumlah: {part.quantity} {part.unit}
                        {part.notes ? ` · ${part.notes}` : ''}
                      </p>
                    </div>
                    {canWork && memo.status !== 'Tervalidasi SPV' && (
                      <button
                        type="button"
                        onClick={() => handleRemovePart(part.id)}
                        aria-label={`Hapus ${part.name}`}
                        className="p-2 text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 min-w-[36px] min-h-[36px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                Belum ada suku cadang tercatat.
              </p>
            )}

            {canWork && memo.status !== 'Tervalidasi SPV' && (
              <form
                onSubmit={handleAddPart}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1"
              >
                <input
                  type="text"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="Nama suku cadang"
                  className="sm:col-span-5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 min-h-[40px]"
                />
                <input
                  type="text"
                  value={partQty}
                  onChange={(e) => setPartQty(e.target.value)}
                  placeholder="Qty"
                  className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 min-h-[40px]"
                />
                <input
                  type="text"
                  value={partUnit}
                  onChange={(e) => setPartUnit(e.target.value)}
                  placeholder="Satuan"
                  className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 min-h-[40px]"
                />
                <button
                  type="submit"
                  disabled={saving || !partName.trim()}
                  className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 disabled:opacity-50 min-h-[40px]"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>Tambah Part</span>
                </button>
              </form>
            )}
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Riwayat Log Tindakan ({actionLogs.length})
            </h3>
            {actionLogs.length > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950 max-h-56 overflow-y-auto">
                {actionLogs.map((log) => (
                  <div key={log.id} className="px-3.5 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {log.action} · {log.actor}
                      </span>
                      <span className="font-mono tabular-nums">
                        {log.timestamp ? formatDateIndo(log.timestamp, true) : ''}
                      </span>
                    </div>
                    {log.note && (
                      <p className="text-slate-700 dark:text-slate-300 mt-1">{log.note}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                Belum ada riwayat log tindakan.
              </p>
            )}

            {canWork && (
              <form onSubmit={handleAddActionLog} className="flex gap-2">
                <input
                  type="text"
                  value={newLogNote}
                  onChange={(e) => setNewLogNote(e.target.value)}
                  placeholder="Tambah entri log tindakan baru..."
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 min-h-[40px]"
                />
                <button
                  type="submit"
                  disabled={saving || !newLogNote.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 min-h-[40px] shrink-0"
                >
                  <ClipboardPlus className="w-3.5 h-3.5" />
                  <span>Tambah Log</span>
                </button>
              </form>
            )}
          </div>

          {(canValidate || memo.validatedBy || memo.validationNotes) && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Validasi Supervisor
                </h3>
                {memo.validatedBy && (
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    Oleh: <strong>{memo.validatedBy}</strong>
                  </span>
                )}
              </div>

              {canValidate ? (
                <>
                  <textarea
                    rows={2}
                    value={validationNotesInput}
                    onChange={(e) => setValidationNotesInput(e.target.value)}
                    placeholder="Catatan validasi akhir atau instruksi revisi dari Supervisor..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <div className="flex flex-wrap gap-2">
                    {memo.status === 'Selesai' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleValidateSpv}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 min-h-[42px]"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Validasi Akhir (Tervalidasi SPV)</span>
                      </button>
                    )}

                    {(memo.status === 'Selesai' || memo.status === 'Tervalidasi SPV') && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleRequestRevision}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 disabled:opacity-60 min-h-[42px]"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Minta Revisi</span>
                      </button>
                    )}

                    {memo.status !== 'Dibatalkan' && memo.status !== 'Tervalidasi SPV' && (
                      !confirmCancel ? (
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[42px]"
                        >
                          <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>Batalkan Memo</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={handleCancelMemo}
                            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 min-h-[40px]"
                          >
                            Ya, Batalkan
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancel(false)}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[40px]"
                          >
                            Batal
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {memo.validationNotes || 'Belum ada catatan validasi.'}
                </p>
              )}
            </div>
          )}

          {canDelete && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:text-rose-800 py-2 px-1"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Memo Ini</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 w-full justify-between bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg p-3">
                  <span className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                    Yakin hapus memo {memo.memoNumber}? Tindakan ini permanen.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[38px]"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeleteMemo}
                      className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 min-h-[38px]"
                    >
                      Ya, Hapus Permanen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showCompletionPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="completion-reminder-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3
                id="completion-reminder-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Perbaikan Selesai
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Pastikan semua alat kerja lengkap dan bersih, terima kasih.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCompletionPopup(false)}
              className="w-full rounded-lg bg-slate-900 dark:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 min-h-[44px]"
            >
              OK, Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
