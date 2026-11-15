import React from 'react';
import {
  CheckCircle2,
  Clock,
  PackageOpen,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { MemoStatus } from '../types';

export const StatusLabel: React.FC<{ status: MemoStatus }> = ({ status }) => {
  switch (status) {
    case 'Menunggu Pengerjaan':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Menunggu Pengerjaan</span>
        </span>
      );
    case 'Dalam Pengerjaan':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
          <Wrench className="w-3.5 h-3.5 shrink-0" />
          <span>Dalam Pengerjaan</span>
        </span>
      );
    case 'Menunggu Sparepart':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 dark:text-orange-400 whitespace-nowrap">
          <PackageOpen className="w-3.5 h-3.5 shrink-0" />
          <span>Menunggu Sparepart</span>
        </span>
      );
    case 'Selesai':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Selesai</span>
        </span>
      );
    case 'Tervalidasi SPV':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>Tervalidasi SPV</span>
        </span>
      );
    case 'Dibatalkan':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Dibatalkan</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
          <span>{status}</span>
        </span>
      );
  }
};
