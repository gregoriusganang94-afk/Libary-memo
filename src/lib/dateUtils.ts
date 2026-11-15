import type { DateFilterState, TimestampLike } from '../types';

export function parseFirestoreDate(val: TimestampLike): Date | null {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val <= 0) return null;
    // Handle seconds vs milliseconds gracefully
    const ms = val < 10_000_000_000 ? val * 1000 : val;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // Numeric string
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 10_000_000_000 ? num * 1000 : num;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // Date-only YYYY-MM-DD treated as local midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, day] = trimmed.split('-').map(Number);
      const d = new Date(y, m - 1, day, 0, 0, 0, 0);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      const d = val.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if ('seconds' in val && typeof val.seconds === 'number') {
      const ns = typeof val.nanoseconds === 'number' ? val.nanoseconds : 0;
      const d = new Date(val.seconds * 1000 + Math.floor(ns / 1_000_000));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

export function detectTimestampFormat(
  val: TimestampLike
): 'number' | 'timestamp' | 'string' {
  if (typeof val === 'number') return 'number';
  if (typeof val === 'string') return 'string';
  if (val && typeof val === 'object' && ('seconds' in val || 'toDate' in val)) {
    return 'timestamp';
  }
  return 'number';
}

const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function formatDateIndo(val: TimestampLike, withTime = false): string {
  const d = parseFirestoreDate(val);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_ID[d.getMonth()];
  const year = d.getFullYear();
  if (!withTime) {
    return `${day} ${month} ${year}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

export function toLocalDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ResolvedDateRange {
  startMs: number | null;
  endMs: number | null;
  label: string;
}

export function getDateRangeFromFilter(filter: DateFilterState): ResolvedDateRange {
  const now = new Date();

  if (filter.preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Hari Ini (${formatDateIndo(start)})`,
    };
  }

  if (filter.preset === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
    const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Kemarin (${formatDateIndo(start)})`,
    };
  }

  if (filter.preset === '7days') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: '7 Hari Terakhir',
    };
  }

  if (filter.preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Bulan ${MONTHS_ID[now.getMonth()]} ${now.getFullYear()}`,
    };
  }

  if (filter.preset === 'custom') {
    const startParsed = filter.startDate ? parseFirestoreDate(filter.startDate) : null;
    const endParsed = filter.endDate ? parseFirestoreDate(filter.endDate) : null;

    if (startParsed && endParsed) {
      const [s, e] =
        startParsed.getTime() <= endParsed.getTime()
          ? [startParsed, endParsed]
          : [endParsed, startParsed];
      const start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
      const end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
      const sameDay = toLocalDateInputValue(start) === toLocalDateInputValue(end);
      return {
        startMs: start.getTime(),
        endMs: end.getTime(),
        label: sameDay
          ? `Tanggal ${formatDateIndo(start)}`
          : `${formatDateIndo(start)} – ${formatDateIndo(end)}`,
      };
    }

    if (startParsed) {
      const start = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate(), 0, 0, 0, 0);
      const end = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate(), 23, 59, 59, 999);
      return {
        startMs: start.getTime(),
        endMs: end.getTime(),
        label: `Tanggal ${formatDateIndo(start)}`,
      };
    }

    if (endParsed) {
      const start = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate(), 0, 0, 0, 0);
      const end = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate(), 23, 59, 59, 999);
      return {
        startMs: start.getTime(),
        endMs: end.getTime(),
        label: `Tanggal ${formatDateIndo(start)}`,
      };
    }
  }

  return {
    startMs: null,
    endMs: null,
    label: 'Semua Tanggal',
  };
}

export function isTimestampInRange(ms: number, range: ResolvedDateRange): boolean {
  if (range.startMs !== null && ms < range.startMs) return false;
  if (range.endMs !== null && ms > range.endMs) return false;
  return true;
}
