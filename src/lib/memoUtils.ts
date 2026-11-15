import type {
  ActionLogEntry,
  MemoCategory,
  MemoStatus,
  PartEntry,
  RepairMemo,
  SessionUser,
} from '../types';
import { formatDateIndo } from './dateUtils';

export const MEMO_CATEGORIES: MemoCategory[] = ['Listrik', 'Mekanik', 'Workshop'];

export const MEMO_LOCATIONS: string[] = [
  'Potong',
  'Varnish',
  'Laminasi',
  'Transfer',
  'Foil',
  'Cetak',
  'Ponz',
  'Lipat',
  'Cabut',
  'Finishing',
  'Kantor',
];

export const MEMO_STATUSES: MemoStatus[] = [
  'Menunggu Pengerjaan',
  'Dalam Pengerjaan',
  'Menunggu Sparepart',
  'Selesai',
  'Tervalidasi SPV',
  'Dibatalkan',
];

export function parseActionLogs(raw: unknown): ActionLogEntry[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [
        {
          id: 'legacy-log-0',
          timestamp: '',
          actor: 'Sistem',
          action: 'Catatan',
          note: trimmed,
        },
      ];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, idx) => {
    if (typeof item === 'string') {
      return {
        id: `log-${idx}`,
        timestamp: '',
        actor: 'Petugas',
        action: 'Log',
        note: item,
      };
    }
    const obj = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(obj.id ?? `log-${idx}`),
      timestamp: String(
        obj.timestamp ?? obj.date ?? obj.time ?? obj.createdAt ?? ''
      ),
      actor: String(
        obj.actor ??
          obj.actorName ??
          obj.user ??
          obj.technician ??
          obj.author ??
          obj.by ??
          'Petugas'
      ),
      role: obj.role ? String(obj.role) : undefined,
      action: String(obj.action ?? obj.type ?? obj.status ?? 'Tindakan'),
      note: String(
        obj.note ?? obj.description ?? obj.message ?? obj.detail ?? ''
      ),
    };
  });
}

export function serializeActionLogs(logs: ActionLogEntry[]): string {
  return JSON.stringify(logs);
}

export function parsePartsList(raw: unknown): PartEntry[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [
        {
          id: 'legacy-part-0',
          name: trimmed,
          quantity: '1',
          unit: 'pcs',
        },
      ];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, idx) => {
    if (typeof item === 'string') {
      return {
        id: `part-${idx}`,
        name: item,
        quantity: '1',
        unit: 'pcs',
      };
    }
    const obj = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(obj.id ?? `part-${idx}`),
      name: String(obj.name ?? obj.partName ?? obj.item ?? obj.nama ?? ''),
      quantity: String(obj.quantity ?? obj.qty ?? obj.count ?? obj.jumlah ?? '1'),
      unit: String(obj.unit ?? obj.satuan ?? 'pcs'),
      notes: obj.notes || obj.note || obj.keterangan
        ? String(obj.notes ?? obj.note ?? obj.keterangan)
        : undefined,
    };
  });
}

export function serializePartsList(parts: PartEntry[]): string {
  return JSON.stringify(parts);
}

export function isRenderableImageUri(uri?: string | null): boolean {
  if (!uri) return false;
  const trimmed = uri.trim();
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 720,
  quality = 0.62
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak didukung perangkat.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function generateMemoNumber(existingMemos: RepairMemo[]): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `MP-${y}${m}${d}-`;
  let maxSeq = 0;
  for (const memo of existingMemos) {
    if (memo.memoNumber && memo.memoNumber.startsWith(prefix)) {
      const seq = Number.parseInt(memo.memoNumber.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// RBAC Permission Helpers
export function canCreateMemo(user: SessionUser): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'PRODUKSI';
}

export function canDeleteMemo(user: SessionUser, memo: RepairMemo): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'PRODUKSI') {
    return Boolean(memo.reporterUserId && memo.reporterUserId === user.userId);
  }
  return false;
}

export function canWorkMemo(user: SessionUser, memo: RepairMemo): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'TEKNISI') {
    return Boolean(user.specialization && memo.category === user.specialization);
  }
  return false;
}

export function canValidateMemo(user: SessionUser): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR';
}

export function canManageUsers(user: SessionUser): boolean {
  return user.role === 'ADMIN';
}

export function canAccessReports(user: SessionUser): boolean {
  return user.role !== 'PRODUKSI' && user.role !== 'TAMU';
}

export function filterMemosByRole(memos: RepairMemo[], user: SessionUser): RepairMemo[] {
  if (user.role === 'TEKNISI') {
    if (!user.specialization) return [];
    return memos.filter((m) => m.category === user.specialization);
  }
  return memos;
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '').replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportMemosToCsv(memos: RepairMemo[], filename: string): void {
  const headers = [
    'No Memo',
    'Tanggal Lapor',
    'Nama Mesin',
    'Kategori',
    'Lokasi',
    'Status',
    'Pelapor',
    'Teknisi',
    'Tanggal Selesai',
    'Suku Cadang',
    'Catatan Pengerjaan',
    'Divalidasi Oleh',
    'Catatan Validasi',
    'Deskripsi Kerusakan',
  ];

  const rows = memos.map((memo) => {
    const partsSummary = parsePartsList(memo.partsListJson)
      .map((p) => `${p.name} (${p.quantity} ${p.unit})`)
      .join('; ');

    return [
      memo.memoNumber,
      formatDateIndo(memo.reportedAt, true),
      memo.title,
      memo.category,
      memo.location,
      memo.status,
      memo.reporterName,
      memo.technicianName || '—',
      memo.completedAt ? formatDateIndo(memo.completedAt, true) : '—',
      partsSummary || '—',
      memo.notes || '—',
      memo.validatedBy || '—',
      memo.validationNotes || '—',
      memo.description || '—',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // UTF-8 BOM (\uFEFF) ensures clean rendering in Excel & Google Sheets
  const csvContent = `\uFEFF${headers.map(escapeCsvCell).join(',')}\r\n${rows.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
