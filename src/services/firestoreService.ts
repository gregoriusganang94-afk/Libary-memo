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
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { detectTimestampFormat, parseFirestoreDate } from '../lib/dateUtils';
import { db, handleFirestoreError, OperationType, withTransientRetry } from '../lib/firebase';
import type {
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

export async function fetchRepairMemosFromServer(
  activeUserId?: string
): Promise<{ memos: RepairMemo[]; fromCache: boolean }> {
  try {
    const snap = await withTransientRetry(
      () => getDocsFromServer(collection(db, MEMOS_COLLECTION)),
      1,
      700
    );
    return { memos: mapMemoSnapshot(snap), fromCache: false };
  } catch (error) {
    try {
      const cacheSnap = await getDocs(collection(db, MEMOS_COLLECTION));
      return { memos: mapMemoSnapshot(cacheSnap), fromCache: true };
    } catch {
      handleFirestoreError(error, OperationType.LIST, MEMOS_COLLECTION, activeUserId);
    }
  }
}

export function subscribeRepairMemos(
  onData: (memos: RepairMemo[], fromCache: boolean) => void,
  onError: (err: Error) => void,
  activeUserId?: string
): Unsubscribe {
  return onSnapshot(
    collection(db, MEMOS_COLLECTION),
    { includeMetadataChanges: true },
    (snapshot) => {
      onData(mapMemoSnapshot(snapshot), snapshot.metadata.fromCache);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, MEMOS_COLLECTION, activeUserId);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
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
