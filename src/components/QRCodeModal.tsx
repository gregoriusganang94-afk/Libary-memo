import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Printer, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import type { SessionUser } from '../types';
import { PURA_LOGO_URL } from './SplashScreen';

export const VERCEL_APP_URL = 'https://memo-perbaikan-teknik.vercel.app/';
export const CARA_A_SHARED_URL =
  'https://ais-pre-web7i45256nawaeierctmt-987771901046.asia-southeast1.run.app';

interface QRCodeModalProps {
  user: SessionUser;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ user, onClose }) => {
  const isAdmin = user.role === 'ADMIN';
  const [targetUrl, setTargetUrl] = useState(VERCEL_APP_URL);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const clean = targetUrl.trim() || VERCEL_APP_URL;
    QRCode.toDataURL(clean, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [targetUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl.trim() || VERCEL_APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadPoster = async () => {
    const cleanUrl = targetUrl.trim() || VERCEL_APP_URL;
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1040;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White poster background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle border
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

    // Load logo
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    try {
      const logoImg = await loadImg(PURA_LOGO_URL);
      ctx.drawImage(logoImg, 350, 56, 100, 100);
    } catch {
      // continue without logo if blocked
    }

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('Sistem Menejemen Perbaikan Mesin', 400, 198);

    ctx.fillStyle = '#475569';
    ctx.font = '600 22px sans-serif';
    ctx.fillText('Pura Group · Unit Offset', 400, 232);

    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, cleanUrl, {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    ctx.drawImage(qrCanvas, 140, 265, 520, 520);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Scan QR Code untuk Membuka & Pasang Aplikasi', 400, 835);

    ctx.fillStyle = '#475569';
    ctx.font = '18px sans-serif';
    ctx.fillText('Android: Buka di Chrome → Ketuk Pasang', 400, 875);
    ctx.fillText('iPhone: Buka di Safari → Bagikan → Tambah ke Layar Utama', 400, 905);

    ctx.fillStyle = '#64748B';
    ctx.font = '14px monospace';
    ctx.fillText(cleanUrl, 400, 955);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px monospace';
    ctx.fillText('v1.0.0', 400, 990);

    const link = document.createElement('a');
    link.download = 'qr-memo-perbaikan-pura-offset.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              QR Code Akses Aplikasi
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup QR Code"
            className="p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="flex flex-col items-center text-center bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <img
                src={PURA_LOGO_URL}
                alt="Logo Pura Group"
                className="w-7 h-7 object-contain"
              />
              <span className="text-xs font-bold text-slate-900">
                Sistem Menejemen Perbaikan Mesin · Unit Offset
              </span>
            </div>

            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code Akses Aplikasi"
                className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
              />
            ) : (
              <div className="w-56 h-56 bg-slate-100 animate-pulse rounded-lg" />
            )}

            <p className="mt-2 text-[11px] font-mono text-slate-600 break-all">
              {targetUrl}
            </p>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tautan Tujuan QR Code (Khusus Admin)
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 min-h-[40px]"
              />
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTargetUrl(VERCEL_APP_URL)}
                  className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  Link Vercel (Utama)
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => setTargetUrl(CARA_A_SHARED_URL)}
                  className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:underline"
                >
                  Link AI Studio
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() =>
                    setTargetUrl('https://gen-lang-client-0453579355.web.app')
                  }
                  className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:underline"
                >
                  Firebase Hosting
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[44px]"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Link Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Salin Link</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadPoster}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-blue-700 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-600 min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Poster QR (.png)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px]"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Halaman</span>
          </button>
        </div>
      </div>
    </div>
  );
};
