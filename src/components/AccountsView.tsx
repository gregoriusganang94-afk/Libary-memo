import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Clock,
  Edit3,
  Plus,
  Search,
  Shield,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { formatDateIndo } from '../lib/dateUtils';
import { MEMO_CATEGORIES } from '../lib/memoUtils';
import {
  clearLoginLogs,
  createUserAccount,
  deleteUserAccount,
  subscribeLoginLogs,
  subscribeUsers,
  updateUserAccount,
} from '../services/firestoreService';
import type {
  LoginLogEntry,
  MemoCategory,
  SessionUser,
  UserAccount,
  UserRole,
} from '../types';

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'ADMIN', label: 'ADMIN', desc: 'Akses penuh & Kelola Akun' },
  { value: 'SUPERVISOR', label: 'SUPERVISOR', desc: 'Pantau semua memo, validasi akhir & revisi' },
  { value: 'TEKNISI', label: 'TEKNISI', desc: 'Tangani memo sesuai bidang keahlian' },
  { value: 'PRODUKSI', label: 'PRODUKSI', desc: 'Buat memo & hapus memo sendiri' },
  { value: 'TAMU', label: 'TAMU', desc: 'Hanya lihat (read-only) Dashboard & Memo' },
];

interface AccountsViewProps {
  currentUser: SessionUser;
  onOpenCleanupSettings?: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  currentUser,
  onOpenCleanupSettings,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLogEntry[]>([]);
  const [logsRestricted, setLogsRestricted] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'accounts' | 'logins'>('accounts');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('TEKNISI');
  const [specialization, setSpecialization] = useState<MemoCategory>('Listrik');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      },
      currentUser.userId
    );
    const unsubLogs = subscribeLoginLogs(
      (logs) => {
        setLoginLogs(logs);
        setLogsRestricted(false);
      },
      () => {
        setLogsRestricted(true);
      }
    );
    return () => {
      unsub();
      unsubLogs();
    };
  }, [currentUser.userId]);

  const todayStartMs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }, [users, loginLogs]);

  const usersWithRecentLogin = useMemo(() => {
    return users
      .filter((u) => typeof u.lastLoginAt === 'number' && u.lastLoginAt > 0)
      .sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0));
  }, [users]);

  const todayLoginAccountCount = useMemo(() => {
    const unique = new Set<string>();
    for (const u of usersWithRecentLogin) {
      if ((u.lastLoginAt ?? 0) >= todayStartMs) unique.add(u.userId);
    }
    for (const log of loginLogs) {
      if (log.loginAt >= todayStartMs) unique.add(log.userId || log.username);
    }
    return unique.size;
  }, [usersWithRecentLogin, loginLogs, todayStartMs]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.specialization.toLowerCase().includes(q)
    );
  }, [users, search]);

  const filteredLoginLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base: LoginLogEntry[] =
      loginLogs.length > 0
        ? loginLogs
        : usersWithRecentLogin.map((u) => ({
            id: `user-${u._docId}`,
            userId: u.userId,
            username: u.username,
            fullName: u.fullName,
            role: u.role,
            loginAt: u.lastLoginAt ?? 0,
            device: u.lastLoginDevice || 'Web',
          }));
    if (!q) return base;
    return base.filter(
      (log) =>
        log.username.toLowerCase().includes(q) ||
        log.fullName.toLowerCase().includes(q) ||
        log.role.toLowerCase().includes(q) ||
        log.device.toLowerCase().includes(q)
    );
  }, [loginLogs, usersWithRecentLogin, search]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setPassword('');
    setRole('TEKNISI');
    setSpecialization('Listrik');
    setFormError(null);
  };

  const openEditModal = (u: UserAccount) => {
    setModalMode('edit');
    setEditingUser(u);
    setUsername(u.username);
    setFullName(u.fullName);
    setPassword('');
    setRole(u.role);
    setSpecialization(u.specialization || 'Listrik');
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!username.trim() || !fullName.trim()) {
      setFormError('Username dan nama lengkap wajib diisi.');
      return;
    }
    if (modalMode === 'create' && !password) {
      setFormError('Password wajib diisi untuk akun baru.');
      return;
    }
    if (role === 'TEKNISI' && !specialization) {
      setFormError('Bidang keahlian (Listrik, Mekanik, atau Workshop) wajib dipilih untuk TEKNISI.');
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createUserAccount(
          {
            username,
            fullName,
            password,
            role,
            specialization: role === 'TEKNISI' ? specialization : '',
          },
          currentUser.userId
        );
      } else if (modalMode === 'edit' && editingUser) {
        await updateUserAccount(
          editingUser._docId,
          {
            username,
            fullName,
            role,
            specialization: role === 'TEKNISI' ? specialization : '',
            newPassword: password || undefined,
          },
          currentUser.userId
        );
      }
      setModalMode(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan akun.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await deleteUserAccount(userId, currentUser.userId);
      setConfirmDeleteId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus akun.');
    }
  };

  const handleClearLogs = async () => {
    if (loginLogs.length === 0) return;
    setClearingLogs(true);
    try {
      await clearLoginLogs(loginLogs.map((l) => l.id));
      setConfirmClearLogs(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membersihkan riwayat login.');
    } finally {
      setClearingLogs(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Kelola Akun Pengguna
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Password dienkripsi PBKDF2-HMAC-SHA256 (12.000 iterasi) sebelum disimpan.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0 min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah Akun</span>
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
              activeTab === 'accounts'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Daftar Akun ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logins')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
              activeTab === 'logins'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              Aktivitas Login ({todayLoginAccountCount} hari ini)
            </span>
          </button>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'accounts'
                ? 'Cari username, nama lengkap, peran, atau bidang teknisi...'
                : 'Cari nama, username, peran, atau perangkat login...'
            }
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 min-h-[44px]"
          />
        </div>
      </div>

      {activeTab === 'accounts' ? (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Memuat daftar akun...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Tidak ada akun ditemukan
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const isSelf = u.userId === currentUser.userId;
                const isHashed = u.password.startsWith('pbkdf2$');
                const loggedInToday = Boolean(u.lastLoginAt && u.lastLoginAt >= todayStartMs);
                return (
                  <div
                    key={u.userId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {u.fullName}
                        </span>
                        {isSelf && (
                          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                            (Akun Anda)
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-mono text-slate-800 dark:text-slate-200">@{u.username}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{u.role}</span>
                        {u.role === 'TEKNISI' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-blue-700 dark:text-blue-400 font-semibold">
                              Bidang {u.specialization || 'Belum diatur'}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className={isHashed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                          {isHashed ? 'PBKDF2' : 'Migrasi saat login'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock
                          className={`w-3.5 h-3.5 shrink-0 ${
                            loggedInToday
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        {u.lastLoginAt ? (
                          <span
                            className={
                              loggedInToday
                                ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                : ''
                            }
                          >
                            Login terakhir: {formatDateIndo(u.lastLoginAt, true)}
                            {u.lastLoginDevice ? ` · ${u.lastLoginDevice}` : ''}
                          </span>
                        ) : (
                          <span>Belum tercatat login web</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[40px]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Ubah</span>
                      </button>

                      {!isSelf && (
                        confirmDeleteId === u._docId ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDelete(u._docId)}
                              className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 min-h-[40px]"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[40px]"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(u._docId)}
                            aria-label={`Hapus akun ${u.username}`}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 min-w-[40px] min-h-[40px]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Riwayat Login Web App (Khusus Admin)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {todayLoginAccountCount} akun login hari ini · Menampilkan maks. 40 aktivitas masuk terbaru
              </p>
            </div>

            {loginLogs.length > 0 && (
              confirmClearLogs ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={clearingLogs}
                    onClick={handleClearLogs}
                    className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60 min-h-[36px]"
                  >
                    {clearingLogs ? 'Menghapus...' : 'Ya, Bersihkan Log'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearLogs(false)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[36px]"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearLogs(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shrink-0 min-h-[36px]"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Bersihkan Riwayat</span>
                </button>
              )
            )}
          </div>

          {logsRestricted && (
            <div className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
              Menampilkan ringkasan login terakhir dari data akun (koleksi log rinci belum diizinkan di Firestore Rules).
            </div>
          )}

          {filteredLoginLogs.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Belum ada aktivitas login yang tercatat
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Setiap akun yang masuk ke web app (termasuk akun tamu) akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLoginLogs.map((log) => {
                const isToday = log.loginAt >= todayStartMs;
                return (
                  <div
                    key={log.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {log.fullName}
                        </span>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          @{log.username}
                        </span>
                        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                          {log.role}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <span>{log.device}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      <span
                        className={
                          isToday
                            ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                            : ''
                        }
                      >
                        {formatDateIndo(log.loginAt, true)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {onOpenCleanupSettings && (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Pembersihan Otomatis Arsip Memo
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Atur batas umur bulan untuk hapus otomatis memo lama di menu Laporan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenCleanupSettings}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Archive className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
            <span>Buka Pembersihan Arsip</span>
          </button>
        </div>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[84dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {modalMode === 'create' ? 'Tambah Akun Pengguna' : 'Ubah Akun Pengguna'}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                aria-label="Tutup modal akun"
                className="p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="account-modal-form"
              onSubmit={handleSave}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: budi_mekanik"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Peran (Role) *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>

              {role === 'TEKNISI' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bidang Teknisi (Wajib) *
                  </label>
                  <select
                    required
                    value={specialization}
                    onChange={(e) =>
                      setSpecialization(e.target.value as MemoCategory)
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
                  >
                    {MEMO_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {modalMode === 'create'
                    ? 'Password *'
                    : 'Password Baru (kosongkan jika tidak diubah)'}
                </label>
                <input
                  type="password"
                  required={modalMode === 'create'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    modalMode === 'create' ? 'Minimal 4 karakter' : 'Biarkan kosong jika tetap'
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[42px]"
                />
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs font-medium text-rose-800 dark:text-rose-200">
                  {formError}
                </div>
              )}
            </form>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 min-h-[42px]"
              >
                Batal
              </button>
              <button
                type="submit"
                form="account-modal-form"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 min-h-[42px]"
              >
                <Plus className="w-4 h-4" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Akun'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
