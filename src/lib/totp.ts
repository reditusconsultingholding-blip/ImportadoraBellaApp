import "server-only";
import { createHmac } from "crypto";

// TOTP (RFC 6238) — el mismo algoritmo de Google Authenticator: seis dígitos
// que cambian cada 30 segundos, derivados de un secreto fijo más la hora.
// No hay que guardar el código en ningún lado: el servidor lo recalcula igual
// que la pantalla que lo muestra.
//
// Aquí se usa para el código que hay que tipear al crear un usuario. Antes ese
// código era un número fijo escrito en el código fuente: cualquiera que viera
// el repositorio lo conocía, y no se podía cambiar sin un deploy.

const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

function getSecret() {
  const raw = process.env.USER_CREATION_TOTP_SECRET;
  if (!raw?.trim()) return null;
  return base32Decode(raw);
}

export function totpConfigured() {
  return getSecret() !== null;
}

/** El código vigente ahora mismo, para mostrarlo en Mi perfil. */
export function currentTotpCode(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return hotp(secret, Math.floor(Date.now() / 1000 / STEP_SECONDS));
}

/** Segundos que faltan para que el código cambie. */
export function secondsUntilNextCode() {
  return STEP_SECONDS - (Math.floor(Date.now() / 1000) % STEP_SECONDS);
}

/**
 * Acepta también el paso anterior y el siguiente (±30s): si el reloj del
 * teléfono de quien dicta el código está algo desfasado, igual entra.
 */
export function verifyTotpCode(code: string) {
  const secret = getSecret();
  if (!secret) return false;
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  return [0, -1, 1].some((delta) => hotp(secret, counter + delta) === clean);
}

/** Instante exacto en que vence el código vigente, en ISO. */
export function nextCodeExpiresAt() {
  return new Date(Date.now() + secondsUntilNextCode() * 1000).toISOString();
}
