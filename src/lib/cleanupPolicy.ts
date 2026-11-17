import type {
  AutoCleanupPolicy,
  DataLoadScope,
  DateFilterState,
  FetchRange,
} from '../types';
import { getDateRangeFromFilter } from './dateUtils';

const CLEANUP_POLICY_KEY_PREFIX = 'pura_memo_admin_cleanup_v1_';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getCurrentMonthInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getDefaultDataLoadScope(): DataLoadScope {
  return {
    mode: '1m',
    monthValue: getCurrentMonthInputValue(),
  };
}

const MONTHS_FULL_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export interface ResolvedLoadScopeRange {
  startMs: number | null;
  endMs: number | null;
  label: string;
}

export function resolveLoadScopeRange(scope: DataLoadScope): ResolvedLoadScopeRange {
  const now = new Date();

  if (scope.mode === '1m') {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
      0,
      0,
      0,
      0
    );
    return {
      startMs: start.getTime(),
      endMs: null,
      label: '1 Bulan Terakhir + Memo Aktif',
    };
  }

  if (scope.mode === '3m') {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 3,
      now.getDate(),
      0,
      0,
      0,
      0
    );
    return {
      startMs: start.getTime(),
      endMs: null,
      label: '3 Bulan Terakhir + Memo Aktif',
    };
  }

  if (scope.mode === '6m') {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 6,
      now.getDate(),
      0,
      0,
      0,
      0
    );
    return {
      startMs: start.getTime(),
      endMs: null,
      label: '6 Bulan Terakhir + Memo Aktif',
    };
  }

  if (scope.mode === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(scope.monthValue || '');
    const year = match ? Number(match[1]) : now.getFullYear();
    const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    const monthName = MONTHS_FULL_ID[start.getMonth()] ?? '';
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Bulan ${monthName} ${start.getFullYear()} + Aktif`,
    };
  }

  return {
    startMs: null,
    endMs: null,
    label: 'Semua Data (Arsip Penuh)',
  };
}

export function isRangeCoveredByLoadedRange(
  target: { startMs: number | null; endMs: number | null },
  loaded: { startMs: number | null; endMs: number | null }
): boolean {
  if (loaded.startMs === null) return true;
  if (target.startMs === null) return false;
  const startOk = target.startMs >= loaded.startMs;
  const endOk =
    loaded.endMs === null ||
    (target.endMs !== null && target.endMs <= loaded.endMs);
  return startOk && endOk;
}

export function resolveEffectiveFetchRange(
  adminScope: DataLoadScope,
  dateFilter: DateFilterState
): FetchRange {
  const adminRange = resolveLoadScopeRange(adminScope);

  if (adminRange.startMs === null || dateFilter.preset === 'all') {
    return {
      startMs: adminRange.startMs,
      endMs: adminRange.endMs,
      label: adminRange.label,
      isDateSearchOverride: false,
    };
  }

  const filterRange = getDateRangeFromFilter(dateFilter);
  if (filterRange.startMs === null) {
    return {
      startMs: adminRange.startMs,
      endMs: adminRange.endMs,
      label: adminRange.label,
      isDateSearchOverride: false,
    };
  }

  if (isRangeCoveredByLoadedRange(filterRange, adminRange)) {
    return {
      startMs: adminRange.startMs,
      endMs: adminRange.endMs,
      label: adminRange.label,
      isDateSearchOverride: false,
    };
  }

  return {
    startMs: filterRange.startMs,
    endMs: filterRange.endMs,
    label: filterRange.label,
    isDateSearchOverride: true,
  };
}

export function getDefaultCleanupPolicy(): AutoCleanupPolicy {
  return {
    enabled: false,
    retentionMonths: 6,
    onlyFinalized: true,
    lastRunAtMs: null,
    lastDeletedCount: 0,
  };
}

export function loadAdminCleanupPolicy(userId: string): AutoCleanupPolicy {
  const defaults = getDefaultCleanupPolicy();
  if (!userId) return defaults;
  try {
    const raw = localStorage.getItem(`${CLEANUP_POLICY_KEY_PREFIX}${userId}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AutoCleanupPolicy>;
    const retentionMonths =
      typeof parsed.retentionMonths === 'number' &&
      Number.isFinite(parsed.retentionMonths) &&
      parsed.retentionMonths >= 1 &&
      parsed.retentionMonths <= 36
        ? Math.round(parsed.retentionMonths)
        : defaults.retentionMonths;
    return {
      enabled: Boolean(parsed.enabled),
      retentionMonths,
      onlyFinalized:
        typeof parsed.onlyFinalized === 'boolean'
          ? parsed.onlyFinalized
          : defaults.onlyFinalized,
      lastRunAtMs:
        typeof parsed.lastRunAtMs === 'number' && Number.isFinite(parsed.lastRunAtMs)
          ? parsed.lastRunAtMs
          : null,
      lastDeletedCount:
        typeof parsed.lastDeletedCount === 'number' &&
        Number.isFinite(parsed.lastDeletedCount)
          ? parsed.lastDeletedCount
          : 0,
    };
  } catch {
    return defaults;
  }
}

export function saveAdminCleanupPolicy(
  userId: string,
  policy: AutoCleanupPolicy
): void {
  if (!userId) return;
  try {
    localStorage.setItem(
      `${CLEANUP_POLICY_KEY_PREFIX}${userId}`,
      JSON.stringify(policy)
    );
  } catch {
    // ignore storage quota errors
  }
}

export function shouldRunScheduledCleanup(policy: AutoCleanupPolicy): boolean {
  if (!policy.enabled) return false;
  if (!policy.lastRunAtMs) return true;
  return Date.now() - policy.lastRunAtMs >= ONE_DAY_MS;
}

export function computeCutoffMsForMonthsAgo(monthsAgo: number): number {
  const safeMonths = Math.max(1, Math.min(36, Math.round(monthsAgo)));
  const now = new Date();
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() - safeMonths,
    now.getDate(),
    0,
    0,
    0,
    0
  );
  return cutoff.getTime();
}

export function formatBytesIndo(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
}
