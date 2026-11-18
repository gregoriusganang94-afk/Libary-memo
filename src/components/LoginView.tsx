import React, { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import type { ThemeMode } from '../hooks/useTheme';
import { APP_VERSION, APP_YEAR } from '../lib/appInfo';
import { authenticateUser } from '../services/firestoreService';
import type { SessionUser } from '../types';
import { PWAInstallButton, ThemeToggleButton } from './PWAControls';
import { PURA_LOGO_URL } from './SplashScreen';

interface LoginViewProps {
  onLoginSuccess: (user: SessionUser) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  theme,
  onToggleTheme,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Masukkan username dan password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await authenticateUser(username, password);
      if (!user) {
        setErrorMsg('Username atau password tidak sesuai.');
        return;
      }
      onLoginSuccess(user);
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal terhubung ke server Firestore. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between p-4 sm:p-6 transition-colors relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <img
          src={PURA_LOGO_URL}
          alt=""
          className="w-80 sm:w-[440px] md:w-[480px] max-w-[82vw] object-contain opacity-[0.45]"
        />
      </div>

      <div className="flex items-center justify-end max-w-5xl w-full mx-auto gap-2 relative z-10">
        <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
        <PWAInstallButton compact />
      </div>

      <main className="w-full max-w-md mx-auto my-6 relative z-10">
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 dark:border-slate-700 p-2.5 flex items-center justify-center shadow-sm">
              <img
                src={PURA_LOGO_URL}
                alt="Logo Pura Group"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="mt-4 text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Memo Perbaikan Mesin
            </h1>
            <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
              Pura Group · Unit Offset
            </p>
            <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Masuk menggunakan akun yang dibuat oleh Admin Unit Offset.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Contoh: teknisi_listrik"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-3.5 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 min-w-[40px] min-h-[40px] flex items-center justify-center"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 disabled:opacity-60 transition-colors min-h-[46px]"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Memverifikasi...' : 'Masuk ke Aplikasi'}</span>
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Tidak punya akun? Login dengan user{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                tamu
              </span>{' '}
              dan password{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                tamu
              </span>{' '}
              untuk login ke sistem.
            </p>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-slate-500 dark:text-slate-400 max-w-5xl w-full mx-auto leading-tight space-y-1 relative z-10">
        <div>Sistem Menejemen Perbaikan Mesin · Unit Offset</div>
        <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
          © {APP_YEAR} · {APP_VERSION} · by GG
        </div>
      </footer>
    </div>
  );
};
