import React, { useState } from 'react';
import { Camera, Lock, X } from 'lucide-react';
import {
  compressImageToDataUrl,
  generateMemoNumber,
  MEMO_CATEGORIES,
  MEMO_LOCATIONS,
  serializeActionLogs,
} from '../lib/memoUtils';
import { createRepairMemo } from '../services/firestoreService';
import type { MemoCategory, RepairMemo, SessionUser } from '../types';

interface CreateMemoModalProps {
  user: SessionUser;
  existingMemos: RepairMemo[];
  onClose: () => void;
  onCreated: () => void;
}

export const CreateMemoModal: React.FC<CreateMemoModalProps> = ({
  user,
  existingMemos,
  onClose,
  onCreated,
}) => {
  const isProduksi = user.role === 'PRODUKSI';
  const defaultType = existingMemos[0]?._rawReportedAtType ?? 'number';

  const [memoNumber, setMemoNumber] = useState(() => generateMemoNumber(existingMemos));
  const [machineName, setMachineName] = useState('');
  const [category, setCategory] = useState<MemoCategory>('Mekanik');
  const [location, setLocation] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [reporterName, setReporterName] = useState(user.fullName);
  const [description, setDescription] = useState('');
  const [beforeImageUri, setBeforeImageUri] = useState('');
  const [compressingImg, setCompressingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingImg(true);
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setBeforeImageUri(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses foto.');
    } finally {
      setCompressingImg(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineName.trim() || !location.trim() || !operatorName.trim() || !description.trim()) {
      setErrorMsg('Nama mesin, lokasi, nama operator, dan deskripsi wajib diisi.');
      return;
    }

    const effectiveReporter = isProduksi
      ? user.fullName
      : reporterName.trim() || user.fullName;

    const cleanOperator = operatorName.trim();
    const formattedDescription = `${description.trim()}\n\nOperator: ${cleanOperator}`;

    setSaving(true);
    setErrorMsg(null);
    try {
      const initialLogs = serializeActionLogs([
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: effectiveReporter,
          role: user.role,
          action: 'Memo Dibuat',
          note: `Laporan baru kategori ${category} di ${location} (Operator: ${cleanOperator}) dibuat oleh ${effectiveReporter}.`,
        },
      ]);

      await createRepairMemo(
        {
          memoNumber: memoNumber.trim() || generateMemoNumber(existingMemos),
          title: machineName.trim(),
          category,
          description: formattedDescription,
          location,
          reporterName: effectiveReporter,
          reporterUserId: user.userId,
          targetCompletionDate: '',
          beforeImageUri: category === 'Workshop' ? beforeImageUri : '',
          actionLogsJson: initialLogs,
        },
        defaultType,
        user.userId
      );
      onCreated();
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan memo ke Firestore.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
      <div className="w-full sm:max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[86dvh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Buat Memo Perbaikan Baru
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pura Group Unit Offset
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="create-memo-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nomor Memo
              </label>
              <input
                type="text"
                value={memoNumber}
                onChange={(e) => setMemoNumber(e.target.value)}
                readOnly={isProduksi}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kategori Perbaikan
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoCategory)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
              >
                {MEMO_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Mesin *
            </label>
            <input
              type="text"
              required
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder="Contoh: Mesin Offset SM-74 / Mesin Foil 02"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Lokasi *
              </label>
              <select
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
              >
                <option value="">Pilih lokasi...</option>
                {MEMO_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Operator *
              </label>
              <input
                type="text"
                required
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Contoh: Agus Setiawan"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span>Nama Pelapor</span>
              {isProduksi && (
                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-normal">
                  <Lock className="w-3 h-3" />
                  Terkunci ke akun Anda
                </span>
              )}
            </label>
            <input
              type="text"
              value={isProduksi ? user.fullName : reporterName}
              onChange={(e) => {
                if (!isProduksi) setReporterName(e.target.value);
              }}
              readOnly={isProduksi}
              className={`w-full rounded-lg border px-3 py-2 text-sm min-h-[42px] focus:outline-none ${
                isProduksi
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-700'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Deskripsi Keluhan / Kerusakan *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Jelaskan gejala kerusakan, kondisi mesin, dan urgensi perbaikan..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          {category === 'Workshop' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Foto Sebelum Perbaikan (Khusus Workshop)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Opsional saat melapor — dikompresi ringan agar cepat dibuka di Android & web.
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer min-h-[40px] shrink-0">
                  <Camera className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>{compressingImg ? 'Memproses...' : 'Ambil / Pilih'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
              {beforeImageUri && (
                <div className="relative">
                  <img
                    src={beforeImageUri}
                    alt="Preview sebelum perbaikan"
                    className="w-full max-h-48 object-contain rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setBeforeImageUri('')}
                    className="mt-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:underline"
                  >
                    Hapus foto
                  </button>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200"
            >
              {errorMsg}
            </div>
          )}

        </form>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
          >
            Batal
          </button>
          <button
            type="submit"
            form="create-memo-form"
            disabled={saving || compressingImg}
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 min-h-[44px]"
          >
            {saving ? 'Menyimpan...' : 'Simpan Memo'}
          </button>
        </div>
      </div>
    </div>
  );
};
