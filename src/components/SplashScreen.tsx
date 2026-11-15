import React from 'react';

export const PURA_LOGO_URL = '/assets/aistudio/pura-group-logo-hq_51f097d8.png';

interface SplashScreenProps {
  message?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  message = 'Memuat data pemeliharaan mesin...',
}) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 transition-colors">
      <div className="flex flex-col items-center text-center max-w-xs w-full">
        <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex items-center justify-center">
          <img
            src={PURA_LOGO_URL}
            alt="Logo Pura Group"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="mt-5 text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Memo Perbaikan Mesin
        </h1>
        <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
          Pura Group · Unit Offset
        </p>

        <div className="mt-6 w-48 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-blue-700 dark:bg-blue-500 animate-pulse" />
        </div>
        <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
          {message}
        </p>
      </div>
    </div>
  );
};
