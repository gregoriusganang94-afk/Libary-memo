import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  computeCutoffMsForMonthsAgo,
  getCurrentMonthInputValue,
  getDefaultDataLoadScope,
} from '../lib/cleanupPolicy';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { detectTimestampFormat, parseFirestoreDate } from '../lib/dateUtils';
import { db, handleFirestoreError, OperationType, withTransientRetry } from '../lib/firebase';
import type {
  DataLoadScope,
  DataLoadScopeMode,
  GlobalLoadScopeState,
  MemoCategory,
  MemoStatus,
  RepairMemo,
  SessionUser,
  TimestampLike,
  UserAccount,
  UserRole,
} from '../types';

const USERS_COLLECTION = 'users';
const MEMOS_COLLECTION = 'repair_memos';
const SETTINGS_COLLECTION = 'app_settings';
const GLOBAL_SCOPE_DOC_ID = 'server_load_scope';
const GLOBAL_SCOPE_CACHE_KEY = 'pura_memo_global_scope_v1';

function normalizeSpecialization(raw: unknown): MemoCategory | '' {
  const clean = String(raw ?? '').trim().toLowerCase();
  if (clean === 'listrik') return 'Listrik';
  if (clean === 'mekanik') return 'Mekanik';
  if (clean === 'workshop') return 'Workshop';
  return '';
}

function normalizeCategory(raw: unknown): MemoCategory {
  const clean = String(raw ?? '').trim().toLowerCase();
  if (clean === 'listrik') return 'Listrik';
  if (clean === 'workshop') return 'Workshop';
  if (clean === 'mekanik') return 'Mekanik';
  return 'Mekanik';
}

function normalizeStatus(raw: unknown): MemoStatus {
  const clean = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (clean === 'menunggu pengerjaan' || clean === 'menunggu' || clean === 'pending') {
    return 'Menunggu Pengerjaan';
  }
  if (clean === 'dalam pengerjaan' || clean === 'dikerjakan' || clean === 'in progress') {
    return 'Dalam Pengerjaan';
  }
  if (clean === 'menunggu sparepart' || clean === 'menunggu suku cadang' || clean === 'sparepart') {
    return 'Menunggu Sparepart';
  }
  if (clean === 'selesai' || clean === 'done' || clean === 'completed') {
    return 'Selesai';
  }
  if (clean === 'tervalidasi spv' || clean === 'tervalidasi' || clean === 'validated') {
    return 'Tervalidasi SPV';
  }
  if (clean === 'dibatalkan' || clean === 'batal' || clean === 'cancelled' || clean === 'canceled') {
    return 'Dibatalkan';
  }
  return 'Menunggu Pengerjaan';
}

function normalizeUserDoc(docId: string, data: Record<string, unknown>): UserAccount {
  const roleRaw = String(data.role ?? 'TAMU').trim().toUpperCase();
  const validRoles: UserRole[] = ['ADMIN', 'SUPERVISOR', 'TEKNISI', 'PRODUKSI', 'TAMU'];
  const role: UserRole = validRoles.includes(roleRaw as UserRole)
    ? (roleRaw as UserRole)
    : 'TAMU';

  const specialization = normalizeSpecialization(data.specialization);

  return {
    _docId: docId,
    userId: String(data.userId || docId),
    username: String(data.username ?? '').trim(),
    fullName: String(data.fullName ?? data.username ?? '').trim(),
    role,
    specialization,
    password: String(data.password ?? ''),
  };
}

function normalizeMemoDoc(docId: string, data: Record<string, unknown>): RepairMemo {
  const category = normalizeCategory(data.category);
  const status = normalizeStatus(data.status);

  const reportedAt = data.reportedAt as TimestampLike;
  const completedAt = data.completedAt as TimestampLike;
  const reportedDate = parseFirestoreDate(reportedAt);
  const completedDate = parseFirestoreDate(completedAt);

  const memoNumber = String(data.memoNumber ?? '');
  const title = String(data.title ?? '');
  const description = String(data.description ?? '');
  const location = String(data.location ?? '');
  const reporterName = String(data.reporterName ?? '');
  const technicianName = String(data.technicianName ?? '');

  const searchIndex = [
    memoNumber,
    title,
    location,
    reporterName,
    technicianName,
    category,
    status,
    description,
  ]
    .join(' ')
    .toLowerCase();

  return {
    _docId: docId,
    id: String(data.id || docId),
    memoNumber,
    title,
    category,
    description,
    location,
    reporterName,
    reporterUserId: String(data.reporterUserId ?? ''),
    technicianName,
    status,
    targetCompletionDate: String(data.targetCompletionDate ?? ''),
    notes: String(data.notes ?? ''),
    actionLogsJson:
      typeof data.actionLogsJson === 'string'
        ? data.actionLogsJson
        : data.actionLogsJson
        ? JSON.stringify(data.actionLogsJson)
        : '[]',
    partsListJson:
      typeof data.partsListJson === 'string'
        ? data.partsListJson
        : data.partsListJson
        ? JSON.stringify(data.partsListJson)
        : '[]',
    beforeImageUri: String(data.beforeImageUri ?? ''),
    afterImageUri: String(data.afterImageUri ?? ''),
    validatedBy: String(data.validatedBy ?? ''),
    validationNotes: String(data.validationNotes ?? ''),
    completedAt: completedAt ?? null,
    reportedAt: reportedAt ?? Date.now(),
    _reportedAtMs: reportedDate ? reportedDate.getTime() : 0,
    _completedAtMs: completedDate ? completedDate.getTime() : null,
    _searchIndex: searchIndex,
    _rawReportedAtType: detectTimestampFormat(reportedAt),
  };
}

function mapMemoSnapshot(snapshot: QuerySnapshot): RepairMemo[] {
  const list = snapshot.docs.map((d) =>
    normalizeMemoDoc(d.id, d.data() as Record<string, unknown>)
  );
  list.sort((a, b) => b._reportedAtMs - a._reportedAtMs);
  return list;
}

export async function authenticateUser(
  usernameInput: string,
  passwordInput: string
): Promise<SessionUser | null> {
  const trimmedUsername = usernameInput.trim();
  if (!trimmedUsername || !passwordInput) return null;

  try {
    const exactQuery = query(
      collection(db, USERS_COLLECTION),
      where('username', '==', trimmedUsername)
    );

    let snap: QuerySnapshot;
    let serverReachable = true;
    try {
      snap = await withTransientRetry(() => getDocsFromServer(exactQuery), 1, 700);
    } catch {
      serverReachable = false;
      snap = await getDocs(exactQuery);
    }

    let docsToCheck = snap.docs;

    // Fallback case-insensitive scan if exact username match not found
    if (docsToCheck.length === 0) {
      let allSnap: QuerySnapshot;
      try {
        allSnap = await withTransientRetry(
          () => getDocsFromServer(collection(db, USERS_COLLECTION)),
          1,
          700
        );
        serverReachable = true;
      } catch {
        allSnap = await getDocs(collection(db, USERS_COLLECTION));
      }
      if (!serverReachable && allSnap.empty) {
        throw new Error('Tidak dapat terhubung ke server Firestore. Periksa koneksi internet Anda.');
      }
      const targetLower = trimmedUsername.toLowerCase();
      docsToCheck = allSnap.docs.filter((d) => {
        const u = String((d.data() as Record<string, unknown>).username ?? '')
          .trim()
          .toLowerCase();
        return u === targetLower;
      });
    }

    if (docsToCheck.length === 0) {
      return null;
    }

    for (const userDoc of docsToCheck) {
      const account = normalizeUserDoc(
        userDoc.id,
        userDoc.data() as Record<string, unknown>
      );
      const { valid, needsMigration } = await verifyPassword(
        passwordInput,
        account.password
      );
      if (valid) {
        if (needsMigration) {
          try {
            const hashedPassword = await hashPassword(passwordInput);
            await updateDoc(doc(db, USERS_COLLECTION, userDoc.id), {
              password: hashedPassword,
            });
          } catch (migrationErr) {
            console.warn('Migrasi hash password gagal:', migrationErr);
          }
        }
        return {
          _docId: userDoc.id,
          userId: account.userId,
          username: account.username,
          fullName: account.fullName,
          role: account.role,
          specialization: account.specialization,
        };
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, USERS_COLLECTION);
  }
}

export async function refreshSessionUser(
  userId: string
): Promise<SessionUser | null> {
  try {
    const directRef = doc(db, USERS_COLLECTION, userId);
    let directSnap;
    try {
      directSnap = await getDocFromServer(directRef);
    } catch {
      directSnap = await getDoc(directRef);
    }

    if (directSnap.exists()) {
      const acc = normalizeUserDoc(
        directSnap.id,
        directSnap.data() as Record<string, unknown>
      );
      return {
        _docId: directSnap.id,
        userId: acc.userId,
        username: acc.username,
        fullName: acc.fullName,
        role: acc.role,
        specialization: acc.specialization,
      };
    }

    const q = query(
      collection(db, USERS_COLLECTION),
      where('userId', '==', userId)
    );
    let snap: QuerySnapshot;
    try {
      snap = await getDocsFromServer(q);
    } catch {
      snap = await getDocs(q);
    }

    if (snap.empty) return null;
    const acc = normalizeUserDoc(
      snap.docs[0].id,
      snap.docs[0].data() as Record<string, unknown>
    );
    return {
      _docId: snap.docs[0].id,
      userId: acc.userId,
      username: acc.username,
      fullName: acc.fullName,
      role: acc.role,
      specialization: acc.specialization,
    };
  } catch (error) {
    console.warn('Gagal menyinkronkan profil pengguna:', error);
    return null;
  }
}

const ACTIVE_MEMO_STATUSES: MemoStatus[] = [
  'Menunggu Pengerjaan',
  'Dalam Pengerjaan',
  'Menunggu Sparepart',
];

const VALID_SCOPE_MODES: DataLoadScopeMode[] = ['1m', '3m', '6m', 'month', 'all'];

function parseGlobalLoadScopeData(
  raw: Record<string, unknown> | undefined
): GlobalLoadScopeState {
  const defaults = getDefaultDataLoadScope();
  if (!raw) return { scope: defaults };

  const modeRaw = String(raw.mode ?? '').trim() as DataLoadScopeMode;
  const mode: DataLoadScopeMode = VALID_SCOPE_MODES.includes(modeRaw)
    ? modeRaw
    : defaults.mode;

  const monthRaw = String(raw.monthValue ?? '').trim();
  const monthValue = /^\d{4}-\d{2}$/.test(monthRaw)
    ? monthRaw
    : getCurrentMonthInputValue();

  return {
    scope: { mode, monthValue },
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : undefined,
    updatedBy:
      typeof raw.updatedBy === 'string' && raw.updatedBy.trim()
        ? raw.updatedBy.trim()
        : undefined,
  };
}

export function loadCachedGlobalLoadScope(): GlobalLoadScopeState {
  try {
    const raw = localStorage.getItem(GLOBAL_SCOPE_CACHE_KEY);
    if (!raw) return { scope: getDefaultDataLoadScope() };
    return parseGlobalLoadScopeData(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return { scope: getDefaultDataLoadScope() };
  }
}

function saveCachedGlobalLoadScope(state: GlobalLoadScopeState): void {
  try {
    localStorage.setItem(
      GLOBAL_SCOPE_CACHE_KEY,
      JSON.stringify({
        mode: state.scope.mode,
        monthValue: state.scope.monthValue,
        updatedAt: state.updatedAt,
        updatedBy: state.updatedBy,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function subscribeGlobalLoadScope(
  onUpdate: (state: GlobalLoadScopeState, fromServer: boolean) => void,
  onSyncWarning?: (msg: string | null) => void
): Unsubscribe {
  const ref = doc(db, SETTINGS_COLLECTION, GLOBAL_SCOPE_DOC_ID);

  // Also pull directly from server once on mount so stale cache doesn't linger
  getDocFromServer(ref)
    .then((snap) => {
      if (snap.exists()) {
        const parsed = parseGlobalLoadScopeData(
          snap.data() as Record<string, unknown>
        );
        saveCachedGlobalLoadScope(parsed);
        onUpdate(parsed, true);
      }
      onSyncWarning?.(null);
    })
    .catch(() => {
      // Ignore transient offline or missing collection errors on initial read
    });

  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.exists()) {
        const parsed = parseGlobalLoadScopeData(
          snapshot.data() as Record<string, unknown>
        );
        saveCachedGlobalLoadScope(parsed);
        onUpdate(parsed, !snapshot.metadata.fromCache);
      }
      onSyncWarning?.(null);
    },
    (error) => {
      console.warn('Sinkronisasi pengaturan muat server:', error);
      const msg =
        error instanceof Error ? error.message : String(error ?? '');
      if (msg.toLowerCase().includes('permission')) {
        onSyncWarning?.(
          'Koleksi app_settings belum diizinkan oleh aturan Firestore. Menggunakan pengaturan default.'
        );
      }
    }
  );
}

export async function saveGlobalLoadScope(
  scope: DataLoadScope,
  user: SessionUser
): Promise<{ ok: boolean; errorMessage?: string }> {
  const payload = {
    mode: scope.mode,
    monthValue: scope.monthValue || getCurrentMonthInputValue(),
    updatedAt: Date.now(),
    updatedBy: user.fullName,
    updatedById: user.userId,
  };

  saveCachedGlobalLoadScope({
    scope: { mode: payload.mode, monthValue: payload.monthValue },
    updatedAt: payload.updatedAt,
    updatedBy: payload.updatedBy,
  });

  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, GLOBAL_SCOPE_DOC_ID), payload);
    return { ok: true };
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errorMessage: rawMsg.toLowerCase().includes('permission')
        ? 'Pengaturan hanya tersimpan di perangkat ini karena Firestore Rules belum mengizinkan tulis ke koleksi app_settings.'
        : `Gagal menyimpan pengaturan global ke server: ${rawMsg}`,
    };
  }
}

export interface MemoQueryRange {
  startMs: number | null;
  endMs: number | null;
}

function buildScopedMemoQueries(
  range: MemoQueryRange,
  includeActiveMemos = true
): Query[] {
  const memosRef = collection(db, MEMOS_COLLECTION);

  if (range.startMs === null) {
    return [memosRef];
  }

  const { startMs, endMs } = range;
  const startTs = Timestamp.fromMillis(startMs);
  const startIso = new Date(startMs).toISOString();

  const queries: Query[] = [];
  if (includeActiveMemos) {
    queries.push(query(memosRef, where('status', 'in', ACTIVE_MEMO_STATUSES)));
  }

  queries.push(
    endMs !== null
      ? query(
          memosRef,
          where('reportedAt', '>=', startMs),
          where('reportedAt', '<=', endMs)
        )
      : query(memosRef, where('reportedAt', '>=', startMs)),
    endMs !== null
      ? query(
          memosRef,
          where('reportedAt', '>=', startTs),
          where('reportedAt', '<=', Timestamp.fromMillis(endMs))
        )
      : query(memosRef, where('reportedAt', '>=', startTs)),
    endMs !== null
      ? query(
          memosRef,
          where('reportedAt', '>=', startIso),
          where('reportedAt', '<=', new Date(endMs).toISOString())
        )
      : query(memosRef, where('reportedAt', '>=', startIso))
  );

  return queries;
}

function mergeMemoMaps(buckets: Map<string, RepairMemo>[]): RepairMemo[] {
  const merged = new Map<string, RepairMemo>();
  for (const bucket of buckets) {
    for (const [id, memo] of bucket.entries()) {
      merged.set(id, memo);
    }
  }
  const list = Array.from(merged.values());
  list.sort((a, b) => b._reportedAtMs - a._reportedAtMs);
  return list;
}

export async function fetchRepairMemosFromServer(
  range: MemoQueryRange,
  activeUserId?: string,
  includeActiveMemos = true
): Promise<{ memos: RepairMemo[]; fromCache: boolean }> {
  const queries = buildScopedMemoQueries(range, includeActiveMemos);
  try {
    const snapshots = await withTransientRetry(
      () => Promise.all(queries.map((q) => getDocsFromServer(q))),
      1,
      700
    );
    const merged = new Map<string, RepairMemo>();
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        merged.set(
          d.id,
          normalizeMemoDoc(d.id, d.data() as Record<string, unknown>)
        );
      }
    }
    const list = Array.from(merged.values());
    list.sort((a, b) => b._reportedAtMs - a._reportedAtMs);
    return { memos: list, fromCache: false };
  } catch (error) {
    try {
      const cacheSnaps = await Promise.all(queries.map((q) => getDocs(q)));
      const merged = new Map<string, RepairMemo>();
      for (const snap of cacheSnaps) {
        for (const d of snap.docs) {
          merged.set(
            d.id,
            normalizeMemoDoc(d.id, d.data() as Record<string, unknown>)
          );
        }
      }
      const list = Array.from(merged.values());
      list.sort((a, b) => b._reportedAtMs - a._reportedAtMs);
      return { memos: list, fromCache: true };
    } catch {
      handleFirestoreError(error, OperationType.LIST, MEMOS_COLLECTION, activeUserId);
    }
  }
}

export function subscribeRepairMemos(
  range: MemoQueryRange,
  onData: (memos: RepairMemo[], fromCache: boolean) => void,
  onError: (err: Error) => void,
  activeUserId?: string
): Unsubscribe {
  const queries = buildScopedMemoQueries(range, true);
  const buckets: Map<string, RepairMemo>[] = queries.map(() => new Map());
  const cacheFlags: boolean[] = queries.map(() => false);
  const settled: boolean[] = queries.map(() => false);

  const emitMerged = () => {
    const anyFromCache = cacheFlags.some(Boolean);
    onData(mergeMemoMaps(buckets), anyFromCache);
  };

  const unsubs = queries.map((q, idx) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const nextBucket = new Map<string, RepairMemo>();
        for (const d of snapshot.docs) {
          nextBucket.set(
            d.id,
            normalizeMemoDoc(d.id, d.data() as Record<string, unknown>)
          );
        }
        buckets[idx] = nextBucket;
        cacheFlags[idx] = snapshot.metadata.fromCache;
        settled[idx] = true;
        if (settled.every(Boolean) || idx === 0) {
          emitMerged();
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, MEMOS_COLLECTION, activeUserId);
        } catch (wrapped) {
          onError(wrapped as Error);
        }
      }
    )
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

export function formatValueForSchema(
  ms: number,
  targetType: 'number' | 'timestamp' | 'string'
): number | Timestamp | string {
  if (targetType === 'timestamp') {
    return Timestamp.fromMillis(ms);
  }
  if (targetType === 'string') {
    return new Date(ms).toISOString();
  }
  return ms;
}

export interface CreateMemoInput {
  memoNumber: string;
  title: string;
  category: MemoCategory;
  description: string;
  location: string;
  reporterName: string;
  reporterUserId: string;
  targetCompletionDate: string;
  beforeImageUri?: string;
  actionLogsJson: string;
}

export async function createRepairMemo(
  input: CreateMemoInput,
  preferredTimestampType: 'number' | 'timestamp' | 'string',
  activeUserId: string
): Promise<string> {
  const newRef = doc(collection(db, MEMOS_COLLECTION));
  const nowVal = formatValueForSchema(Date.now(), preferredTimestampType);

  const payload = {
    id: newRef.id,
    memoNumber: input.memoNumber.trim(),
    title: input.title.trim(),
    category: input.category,
    description: input.description.trim(),
    location: input.location.trim(),
    reporterName: input.reporterName.trim(),
    reporterUserId: input.reporterUserId,
    technicianName: '',
    status: 'Menunggu Pengerjaan' as MemoStatus,
    targetCompletionDate: input.targetCompletionDate.trim(),
    notes: '',
    actionLogsJson: input.actionLogsJson || '[]',
    partsListJson: '[]',
    beforeImageUri: input.beforeImageUri ?? '',
    afterImageUri: '',
    validatedBy: '',
    validationNotes: '',
    completedAt: null,
    reportedAt: nowVal,
  };

  try {
    await setDoc(newRef, payload);
    return newRef.id;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `${MEMOS_COLLECTION}/${newRef.id}`,
      activeUserId
    );
  }
}

export async function updateRepairMemo(
  memoId: string,
  updates: Partial<{
    title: string;
    category: MemoCategory;
    description: string;
    location: string;
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
    completedAt: number | Timestamp | string | null;
  }>,
  activeUserId: string
): Promise<void> {
  const ref = doc(db, MEMOS_COLLECTION, memoId);
  try {
    await updateDoc(ref, updates as Record<string, unknown>);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${MEMOS_COLLECTION}/${memoId}`,
      activeUserId
    );
  }
}

export async function deleteRepairMemo(
  memoId: string,
  activeUserId: string
): Promise<void> {
  const ref = doc(db, MEMOS_COLLECTION, memoId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${MEMOS_COLLECTION}/${memoId}`,
      activeUserId
    );
  }
}

function estimateMemoDocumentBytes(memo: RepairMemo): number {
  return (
    512 +
    memo.title.length +
    memo.description.length +
    memo.notes.length +
    memo.actionLogsJson.length +
    memo.partsListJson.length +
    memo.beforeImageUri.length +
    memo.afterImageUri.length +
    memo.validationNotes.length
  );
}

export async function fetchOldMemosForCleanup(
  retentionMonths: number,
  onlyFinalized: boolean,
  activeUserId: string
): Promise<{
  memos: RepairMemo[];
  cutoffMs: number;
  estimatedBytes: number;
}> {
  const cutoffMs = computeCutoffMsForMonthsAgo(retentionMonths);
  const memosRef = collection(db, MEMOS_COLLECTION);
  const queries: Query[] = [
    query(memosRef, where('reportedAt', '<', cutoffMs)),
    query(memosRef, where('reportedAt', '<', Timestamp.fromMillis(cutoffMs))),
    query(memosRef, where('reportedAt', '<', new Date(cutoffMs).toISOString())),
  ];

  try {
    const snapshots = await withTransientRetry(
      () => Promise.all(queries.map((q) => getDocsFromServer(q))),
      1,
      700
    );

    const uniqueMap = new Map<string, RepairMemo>();
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        const normalized = normalizeMemoDoc(
          d.id,
          d.data() as Record<string, unknown>
        );
        // Guard: skip entries with missing/invalid timestamp, and verify real normalized ms < cutoffMs
        if (normalized._reportedAtMs <= 0 || normalized._reportedAtMs >= cutoffMs) {
          continue;
        }
        if (
          onlyFinalized &&
          normalized.status !== 'Selesai' &&
          normalized.status !== 'Tervalidasi SPV' &&
          normalized.status !== 'Dibatalkan'
        ) {
          continue;
        }
        uniqueMap.set(d.id, normalized);
      }
    }

    const memos = Array.from(uniqueMap.values());
    memos.sort((a, b) => a._reportedAtMs - b._reportedAtMs);

    const estimatedBytes = memos.reduce(
      (sum, m) => sum + estimateMemoDocumentBytes(m),
      0
    );

    return { memos, cutoffMs, estimatedBytes };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, MEMOS_COLLECTION, activeUserId);
  }
}

export async function deleteMemosInBatches(
  memoIds: string[],
  activeUserId: string,
  onProgress?: (deleted: number, total: number) => void
): Promise<number> {
  if (memoIds.length === 0) return 0;
  const CHUNK_SIZE = 400;
  let deleted = 0;

  try {
    for (let i = 0; i < memoIds.length; i += CHUNK_SIZE) {
      const chunk = memoIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, MEMOS_COLLECTION, id));
      }
      await batch.commit();
      deleted += chunk.length;
      onProgress?.(deleted, memoIds.length);
    }
    return deleted;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, MEMOS_COLLECTION, activeUserId);
  }
}

export interface AssignableTechnician {
  userId: string;
  username: string;
  fullName: string;
  specialization: MemoCategory | '';
}

export async function fetchTechnicianAccounts(
  activeUserId?: string
): Promise<AssignableTechnician[]> {
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where('role', '==', 'TEKNISI')
    );
    let snap: QuerySnapshot;
    try {
      snap = await withTransientRetry(() => getDocsFromServer(q), 1, 600);
    } catch {
      snap = await getDocs(q);
    }

    const list: AssignableTechnician[] = snap.docs.map((d) => {
      const acc = normalizeUserDoc(d.id, d.data() as Record<string, unknown>);
      return {
        userId: acc.userId,
        username: acc.username,
        fullName: acc.fullName,
        specialization: acc.specialization,
      };
    });
    list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, USERS_COLLECTION, activeUserId);
  }
}

// Users management (Admin)
export function subscribeUsers(
  onData: (users: UserAccount[]) => void,
  onError: (err: Error) => void,
  activeUserId?: string
): Unsubscribe {
  return onSnapshot(
    collection(db, USERS_COLLECTION),
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        normalizeUserDoc(d.id, d.data() as Record<string, unknown>)
      );
      list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, USERS_COLLECTION, activeUserId);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createUserAccount(
  input: {
    username: string;
    fullName: string;
    password: string;
    role: UserRole;
    specialization: MemoCategory | '';
  },
  activeUserId: string
): Promise<void> {
  const cleanUsername = input.username.trim();
  const cleanFullName = input.fullName.trim();

  if (!cleanUsername || !cleanFullName || !input.password) {
    throw new Error('Username, nama lengkap, dan password wajib diisi.');
  }
  if (input.role === 'TEKNISI' && !input.specialization) {
    throw new Error('Bidang keahlian (Listrik, Mekanik, atau Workshop) wajib dipilih untuk peran TEKNISI.');
  }

  try {
    const existingQ = query(
      collection(db, USERS_COLLECTION),
      where('username', '==', cleanUsername)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      throw new Error(`Username "${cleanUsername}" sudah digunakan.`);
    }

    const newRef = doc(collection(db, USERS_COLLECTION));
    const hashedPassword = await hashPassword(input.password);
    const userPayload = {
      userId: newRef.id,
      username: cleanUsername,
      fullName: cleanFullName,
      role: input.role,
      specialization: input.role === 'TEKNISI' ? input.specialization : '',
      password: hashedPassword,
    };

    await setDoc(newRef, userPayload);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Username')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, USERS_COLLECTION, activeUserId);
  }
}

export async function updateUserAccount(
  targetUserId: string,
  input: {
    username: string;
    fullName: string;
    role: UserRole;
    specialization: MemoCategory | '';
    newPassword?: string;
  },
  activeUserId: string
): Promise<void> {
  if (input.role === 'TEKNISI' && !input.specialization) {
    throw new Error('Bidang keahlian (Listrik, Mekanik, atau Workshop) wajib dipilih untuk peran TEKNISI.');
  }

  const ref = doc(db, USERS_COLLECTION, targetUserId);
  const updates: Record<string, unknown> = {
    username: input.username.trim(),
    fullName: input.fullName.trim(),
    role: input.role,
    specialization: input.role === 'TEKNISI' ? input.specialization : '',
  };

  if (input.newPassword && input.newPassword.trim()) {
    updates.password = await hashPassword(input.newPassword.trim());
  }

  try {
    await updateDoc(ref, updates);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${USERS_COLLECTION}/${targetUserId}`,
      activeUserId
    );
  }
}

export async function deleteUserAccount(
  targetUserId: string,
  activeUserId: string
): Promise<void> {
  const ref = doc(db, USERS_COLLECTION, targetUserId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${USERS_COLLECTION}/${targetUserId}`,
      activeUserId
    );
  }
}

export async function changeOwnPassword(
  sessionUser: SessionUser,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (sessionUser.role === 'TAMU') {
    throw new Error('Akun Tamu tidak memiliki akses untuk mengubah password.');
  }

  const trimmedNew = newPassword.trim();
  if (trimmedNew.length < 4) {
    throw new Error('Password baru minimal 4 karakter.');
  }

  const candidateDocId = sessionUser._docId || sessionUser.userId;
  let targetDocId: string | null = null;
  let storedPassword = '';

  try {
    const directRef = doc(db, USERS_COLLECTION, candidateDocId);
    let directSnap;
    try {
      directSnap = await withTransientRetry(() => getDocFromServer(directRef), 1, 700);
    } catch {
      directSnap = await getDoc(directRef);
    }

    if (directSnap.exists()) {
      targetDocId = directSnap.id;
      storedPassword = String((directSnap.data() as Record<string, unknown>).password ?? '');
    } else {
      const q = query(
        collection(db, USERS_COLLECTION),
        where('userId', '==', sessionUser.userId)
      );
      let snap: QuerySnapshot;
      try {
        snap = await withTransientRetry(() => getDocsFromServer(q), 1, 700);
      } catch {
        snap = await getDocs(q);
      }
      if (!snap.empty) {
        targetDocId = snap.docs[0].id;
        storedPassword = String((snap.docs[0].data() as Record<string, unknown>).password ?? '');
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, USERS_COLLECTION, sessionUser.userId);
  }

  if (!targetDocId) {
    throw new Error('Data akun Anda tidak ditemukan di server.');
  }

  const { valid } = await verifyPassword(currentPassword, storedPassword);
  if (!valid) {
    throw new Error('Password lama tidak sesuai.');
  }

  const hashedPassword = await hashPassword(trimmedNew);
  try {
    await updateDoc(doc(db, USERS_COLLECTION, targetDocId), {
      password: hashedPassword,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${USERS_COLLECTION}/${targetDocId}`,
      sessionUser.userId
    );
  }
}
