export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'TEKNISI' | 'PRODUKSI' | 'TAMU';

export type MemoCategory = 'Listrik' | 'Mekanik' | 'Workshop';

export type MemoStatus =
  | 'Menunggu Pengerjaan'
  | 'Dalam Pengerjaan'
  | 'Menunggu Sparepart'
  | 'Selesai'
  | 'Tervalidasi SPV'
  | 'Dibatalkan';

export interface UserAccount {
  _docId: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  specialization: MemoCategory | '';
  password: string;
  lastLoginAt?: number | null;
  lastLoginDevice?: string;
}

export interface LoginLogEntry {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  loginAt: number;
  device: string;
}

export interface SessionUser {
  _docId?: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  specialization: MemoCategory | '';
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorUserId?: string;
  targetUserId?: string;
  targetName?: string;
  role?: string;
  action: string;
  note: string;
}

export interface PartEntry {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  notes?: string;
}

export type TimestampLike =
  | number
  | string
  | Date
  | { seconds: number; nanoseconds?: number; toDate?: () => Date }
  | null
  | undefined;

export interface RepairMemo {
  _docId: string;
  id: string;
  memoNumber: string;
  title: string;
  category: MemoCategory;
  description: string;
  location: string;
  reporterName: string;
  reporterUserId: string;
  technicianName: string;
  status: MemoStatus;
  targetCompletionDate: string;
  notes: string;
  actionLogsJson: string;
  partsListJson: string;
  beforeImageUri: string;
  afterImageUri: string;
  validatedBy: string;
  validationNotes: string;
  completedAt: TimestampLike;
  reportedAt: TimestampLike;
  // Normalized client-side helpers for fast sorting & searching
  _reportedAtMs: number;
  _completedAtMs: number | null;
  _searchIndex: string;
  _rawReportedAtType: 'number' | 'timestamp' | 'string';
}

export type DateFilterPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | '7days'
  | 'month'
  | 'custom';

export interface DateFilterState {
  preset: DateFilterPreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type AppView = 'dashboard' | 'memos' | 'reports' | 'accounts';

export type DataLoadScopeMode = '1m' | '3m' | '6m' | 'month' | 'all';

export interface DataLoadScope {
  mode: DataLoadScopeMode;
  monthValue: string; // YYYY-MM
}

export interface GlobalLoadScopeState {
  scope: DataLoadScope;
  updatedAt?: number;
  updatedBy?: string;
}

export interface FetchRange {
  startMs: number | null;
  endMs: number | null;
  label: string;
  isDateSearchOverride?: boolean;
}

export interface AutoCleanupPolicy {
  enabled: boolean;
  retentionMonths: number;
  onlyFinalized: boolean;
  lastRunAtMs: number | null;
  lastDeletedCount: number;
}
