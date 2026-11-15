const PBKDF2_PREFIX = 'pbkdf2';
const DEFAULT_ITERATIONS = 12000;
const KEY_BITS = 256;

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function derivePbkdf2Hex(
  password: string,
  saltBytes: Uint8Array,
  iterations: number
): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const saltBuffer = new Uint8Array(saltBytes).buffer;
    const derivedBits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      KEY_BITS
    );
    return bytesToHex(new Uint8Array(derivedBits));
  }

  throw new Error('Web Crypto API tidak tersedia pada peramban ini.');
}

/**
 * Menghasilkan hash password format: pbkdf2$12000$<hex_salt>$<hex_hash>
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const hexSalt = bytesToHex(salt);
  const hexHash = await derivePbkdf2Hex(plainPassword, salt, DEFAULT_ITERATIONS);
  return `${PBKDF2_PREFIX}$${DEFAULT_ITERATIONS}$${hexSalt}$${hexHash}`;
}

export interface PasswordVerifyResult {
  valid: boolean;
  needsMigration: boolean;
}

/**
 * Memverifikasi password terhadap hash pbkdf2$12000$<hex_salt>$<hex_hash>
 * atau password teks biasa (legacy) untuk migrasi otomatis saat login.
 */
export async function verifyPassword(
  plainPassword: string,
  storedPassword: string
): Promise<PasswordVerifyResult> {
  if (!storedPassword) {
    return { valid: false, needsMigration: false };
  }

  if (storedPassword.startsWith(`${PBKDF2_PREFIX}$`)) {
    const parts = storedPassword.split('$');
    if (parts.length !== 4) {
      return { valid: false, needsMigration: false };
    }
    const iterations = Number.parseInt(parts[1], 10);
    const hexSalt = parts[2];
    const expectedHexHash = parts[3].toLowerCase();

    if (!Number.isFinite(iterations) || iterations <= 0 || !hexSalt || !expectedHexHash) {
      return { valid: false, needsMigration: false };
    }

    const saltBytes = hexToBytes(hexSalt);
    const derivedHex = await derivePbkdf2Hex(plainPassword, saltBytes, iterations);
    return {
      valid: constantTimeEqual(derivedHex.toLowerCase(), expectedHexHash),
      needsMigration: false,
    };
  }

  // Legacy plaintext fallback -> otomatis dimigrasi jika cocok
  return {
    valid: constantTimeEqual(plainPassword, storedPassword),
    needsMigration: true,
  };
}
