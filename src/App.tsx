import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { AccountsView } from './components/AccountsView';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CreateMemoModal } from './components/CreateMemoModal';
import { DashboardView } from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { MemoDetailModal } from './components/MemoDetailModal';
import { MemoListView } from './components/MemoListView';
import {
  OfflineIndicator,
  PWAInstallButton,
  ThemeToggleButton,
} from './components/PWAControls';
import { QRCodeModal } from './components/QRCodeModal';
import { ReportsView } from './components/ReportsView';
import { PURA_LOGO_URL, SplashScreen } from './components/SplashScreen';
import { useTheme } from './hooks/useTheme';
import { APP_VERSION, APP_YEAR } from './lib/appInfo';
import { testFirestoreConnection } from './lib/firebase';
import {
  canAccessReports,
  canChangeOwnPassword,
  canCreateMemo,
  canManageUsers,
} from './lib/memoUtils';
import {
  fetchRepairMemosFromServer,
  refreshSessionUser,
  subscribeRepairMemos,
} from './services/firestoreService';
import type {
  AppView,
  DateFilterState,
  RepairMemo,
  SessionUser,
} from './types';

const SESSION_STORAGE_KEY = 'pura_memo_session_v1';

function loadStoredSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (parsed && parsed.userId && parsed.username && parsed.role) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(() => loadStoredSession());
  const [booting, setBooting] = useState(true);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [memos, setMemos] = useState<RepairMemo[]>([]);
  const [loadingMemos, setLoadingMemos] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilterState>({
    preset: 'all',
    startDate: '',
    endDate: '',
  });

  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  // Brief branded startup splash screen while checking Firestore connection
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) setBooting(false);
    }, 550);

    testFirestoreConnection();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const syncFromServer = useCallback(async (uid?: string) => {
    setSyncing(true);
    try {
      const { memos: freshMemos, fromCache } = await fetchRepairMemosFromServer(uid);
      setMemos(freshMemos);
      setIsFromCache(fromCache);
      setFirestoreError(null);
    } catch (err) {
      setFirestoreError(
        err instanceof Error ? err.message : 'Gagal menyinkronkan data server.'
      );
    } finally {
      setSyncing(false);
      setLoadingMemos(false);
    }
  }, []);

  // Re-validate stored session against Firestore server when online
  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;
    refreshSessionUser(user.userId).then((fresh) => {
      if (cancelled || !fresh) return;
      setUser((prev) => {
        if (
          prev &&
          prev.userId === fresh.userId &&
          prev.role === fresh.role &&
          prev.specialization === fresh.specialization &&
          prev.fullName === fresh.fullName
        ) {
          return prev;
        }
        return fresh;
      });
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fresh));
      } catch {
        // ignore storage quota errors
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  // Subscribe to repair_memos + force immediate server fetch when account logs in or switches
  useEffect(() => {
    if (!user) {
      setMemos([]);
      setLoadingMemos(false);
      return;
    }

    setLoadingMemos(true);
    setFirestoreError(null);

    // Pull latest server documents immediately so switching accounts never relies solely on stale IndexedDB cache
    syncFromServer(user.userId);

    const unsub = subscribeRepairMemos(
      (list, fromCache) => {
        setMemos(list);
        setIsFromCache(fromCache);
        setLoadingMemos(false);
      },
      (err) => {
        setFirestoreError(err.message);
        setLoadingMemos(false);
      },
      user.userId
    );

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        syncFromServer(user.userId);
      }
    };
    const handleOnline = () => {
      syncFromServer(user.userId);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [user?.userId, syncFromServer]);

  const selectedMemo = useMemo(
    () => memos.find((m) => m._docId === selectedMemoId) ?? null,
    [memos, selectedMemoId]
  );

  const handleLoginSuccess = (loggedInUser: SessionUser) => {
    setMemos([]);
    setLoadingMemos(true);
    setUser(loggedInUser);
    setActiveView('dashboard');
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(loggedInUser));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleLogout = () => {
    setUser(null);
    setMemos([]);
    setSelectedMemoId(null);
    setShowCreateModal(false);
    setShowProfileSheet(false);
    setShowChangePasswordModal(false);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  if (booting) {
    return <SplashScreen message="Menghubungkan ke server Pura Group..." />;
  }

  if (!user) {
    return (
      <>
        <LoginView
          onLoginSuccess={handleLoginSuccess}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <OfflineIndicator />
      </>
    );
  }

  const showAccountsTab = canManageUsers(user);
  const showReportsTab = canAccessReports(user);
  const showCreateAction = canCreateMemo(user);
  const allowChangePassword = canChangeOwnPassword(user);

  const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'memos',
      label: 'Memo',
      icon: <ClipboardList className="w-5 h-5" />,
    },
  ];

  if (showReportsTab) {
    navItems.push({
      id: 'reports',
      label: 'Laporan',
      icon: <BarChart3 className="w-5 h-5" />,
    });
  }

  if (showAccountsTab) {
    navItems.push({
      id: 'accounts',
      label: 'Kelola Akun',
      icon: <Users className="w-5 h-5" />,
    });
  }

  const effectiveView: AppView =
    activeView === 'reports' && !showReportsTab
      ? 'dashboard'
      : activeView === 'accounts' && !showAccountsTab
      ? 'dashboard'
      : activeView;

  const pageTitleMap: Record<AppView, string> = {
    dashboard: 'Dashboard Pemeliharaan',
    memos: 'Daftar Memo Perbaikan',
    reports: 'Laporan & Ekspor CSV',
    accounts: 'Kelola Akun Pengguna',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-colors relative">
      {/* Subtle Pura Group background watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none fixed inset-0 md:left-64 z-0 flex items-center justify-center overflow-hidden"
      >
        <img
          src={PURA_LOGO_URL}
          alt=""
          className="w-80 sm:w-[440px] md:w-[480px] max-w-[82vw] object-contain opacity-[0.45]"
        />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30">
        <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 dark:border-slate-700 p-1 flex items-center justify-center shrink-0">
            <img
              src={PURA_LOGO_URL}
              alt="Logo Pura Group"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
              Sistem Menejemen Perbaikan Mesin
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Unit Offset
            </p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = effectiveView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
                  active
                    ? 'bg-slate-900 dark:bg-blue-700 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/70 dark:bg-slate-950/60">
          <PWAInstallButton />

          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors min-h-[40px]"
          >
            <QrCode className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <span>QR Code Aplikasi</span>
          </button>

          <div className="text-xs pt-0.5">
            <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{user.fullName}</p>
            <p className="text-slate-600 dark:text-slate-400 truncate mt-0.5">
              {user.role}
              {user.role === 'TEKNISI' && user.specialization
                ? ` · ${user.specialization}`
                : ''}
            </p>
          </div>

          {allowChangePassword && (
            <button
              type="button"
              onClick={() => setShowChangePasswordModal(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors min-h-[40px]"
            >
              <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Ganti Password</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors min-h-[40px]"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>

          <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 text-center select-none">
            {APP_VERSION}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen relative z-10">
        <header className="sticky top-0 z-30 h-[56px] md:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="md:hidden w-8 h-8 rounded-lg bg-white border border-slate-200 dark:border-slate-700 p-0.5 flex items-center justify-center shrink-0">
              <img
                src={PURA_LOGO_URL}
                alt="Logo Pura Group"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                Sistem Menejemen Perbaikan Mesin
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                Unit Offset · {pageTitleMap[effectiveView]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => syncFromServer(user.userId)}
              disabled={syncing}
              aria-label="Sinkronkan data terbaru dari server"
              title="Sinkronkan data terbaru"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-w-[38px] min-h-[38px] md:min-h-[40px] px-2 md:px-3 text-xs font-semibold"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {syncing ? 'Sinkron...' : 'Sinkron'}
              </span>
            </button>

            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />

            <div className="md:hidden">
              <PWAInstallButton compact />
            </div>

            {showCreateAction && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 md:px-4 md:py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 min-h-[38px] md:min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xs:inline sm:inline">Buat Memo</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-5 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {isFromCache && !syncing && (
            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
              <span>Menampilkan data cache lokal. Ketuk Sinkron untuk menarik pembaruan server.</span>
              <button
                type="button"
                onClick={() => syncFromServer(user.userId)}
                className="font-bold underline shrink-0"
              >
                Sinkron Sekarang
              </button>
            </div>
          )}

          {firestoreError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-4 py-3 text-xs font-medium text-rose-800 dark:text-rose-200"
            >
              Terjadi kendala sinkronisasi Firestore: {firestoreError}
            </div>
          )}

          {effectiveView === 'dashboard' && (
            <DashboardView
              user={user}
              memos={memos}
              loading={loadingMemos}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
              onSelectMemo={(memo) => setSelectedMemoId(memo._docId)}
              onNavigateToMemos={() => setActiveView('memos')}
            />
          )}

          {effectiveView === 'memos' && (
            <MemoListView
              user={user}
              memos={memos}
              loading={loadingMemos}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
              onSelectMemo={(memo) => setSelectedMemoId(memo._docId)}
              onOpenCreate={() => setShowCreateModal(true)}
            />
          )}

          {effectiveView === 'reports' && showReportsTab && (
            <ReportsView
              user={user}
              memos={memos}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
            />
          )}

          {effectiveView === 'accounts' && showAccountsTab && (
            <AccountsView currentUser={user} />
          )}

          <footer className="mt-8 pt-4 border-t border-slate-200/70 dark:border-slate-800/70 text-[11px] font-mono text-slate-400 dark:text-slate-500 select-none space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span>Sistem Menejemen Perbaikan Mesin · Unit Offset</span>
              <span>{APP_VERSION} · GG</span>
            </div>
            <div className="text-center text-slate-400/80 dark:text-slate-600/90">
              {APP_YEAR}
            </div>
          </footer>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Navigasi utama"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div
          className={`grid ${
            navItems.length + 1 === 5
              ? 'grid-cols-5'
              : navItems.length + 1 === 4
              ? 'grid-cols-4'
              : 'grid-cols-3'
          } h-[58px] items-center`}
        >
          {navItems.map((item) => {
            const active = effectiveView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`flex flex-col items-center justify-center h-full px-1 transition-colors ${
                  active
                    ? 'text-blue-700 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-semibold mt-0.5 truncate max-w-full">
                  {item.id === 'accounts' ? 'Akun' : item.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowProfileSheet(true)}
            className="flex flex-col items-center justify-center h-full px-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5 truncate">
              Profil
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Profile & Install Bottom Sheet */}
      {showProfileSheet && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end bg-slate-950/60">
          <div className="w-full rounded-t-2xl bg-white dark:bg-slate-900 p-5 border-t border-slate-200 dark:border-slate-800 space-y-4 pb-safe">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Profil Akun</h3>
              <button
                type="button"
                onClick={() => setShowProfileSheet(false)}
                aria-label="Tutup profil"
                className="p-2 -mr-2 text-slate-500 dark:text-slate-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 text-sm">
              <p className="font-bold text-slate-900 dark:text-slate-100">{user.fullName}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono">
                @{user.username}
              </p>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mt-1">
                {user.role}
                {user.role === 'TEKNISI' && user.specialization
                  ? ` · Bidang ${user.specialization}`
                  : ''}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <PWAInstallButton />
              {allowChangePassword && (
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileSheet(false);
                    setShowChangePasswordModal(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[44px]"
                >
                  <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Ganti Password</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowProfileSheet(false);
                  setShowQRModal(true);
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[44px]"
              >
                <QrCode className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>QR Code Akses Aplikasi</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-800 min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showQRModal && (
        <QRCodeModal user={user} onClose={() => setShowQRModal(false)} />
      )}

      {showCreateModal && showCreateAction && (
        <CreateMemoModal
          user={user}
          existingMemos={memos}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => setActiveView('memos')}
        />
      )}

      {selectedMemo && (
        <MemoDetailModal
          user={user}
          memo={selectedMemo}
          onClose={() => setSelectedMemoId(null)}
        />
      )}

      {showChangePasswordModal && allowChangePassword && (
        <ChangePasswordModal
          user={user}
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
