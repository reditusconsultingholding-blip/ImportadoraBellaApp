import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Cifrado en reposo de los tokens de terceros.
//
// POR QUÉ
// Los tokens de Meta, Shopify, Dropi y Notion se guardaban en texto plano en
// la base. Cualquiera con lectura de la base —un respaldo filtrado, un acceso
// de solo lectura, un error en un panel de administración— se llevaba las
// llaves de la tienda y de las cuentas publicitarias. Cifrados, un volcado de
// la base no sirve sin la clave, que vive en otro lado (las variables del
// servidor).
//
// CÓMO
// AES-256-GCM: cifra y además autentica, así que un valor alterado en la base
// no se descifra en silencio a basura, falla. Cada valor lleva su propio IV
// aleatorio. El formato guardado es
//
//   enc:v1:{llave}:{iv}:{tag}:{datos}      (base64url)
//
// LAS DOS LLAVES
// "e" es ENCRYPTION_KEY, una llave dedicada (32 bytes en hex o base64). Es la
// buena: se puede rotar el secreto de sesión —para cerrar todas las sesiones—
// sin perder los tokens.
//
// "s" se deriva de SESSION_SECRET con HKDF y una etiqueta propia. Existe para
// que el cifrado funcione desde el primer deploy, sin esperar a que alguien
// cargue una variable nueva en Railway. Cuando aparece ENCRYPTION_KEY, el
// reloj vuelve a cifrar con "e" lo que estaba con "s" (ver recifrarPendientes).
//
// TEXTO PLANO VIEJO
// Un valor sin el prefijo se devuelve tal cual: son los tokens guardados antes
// de este cambio. El mismo repaso los cifra.

const PREFIJO = "enc:v1:";

function b64(buf: Buffer) {
  return buf.toString("base64url");
}

function llaveDedicada(): Buffer | null {
  const crudo = process.env.ENCRYPTION_KEY?.trim();
  if (!crudo) return null;
  const buf = /^[0-9a-f]{64}$/i.test(crudo) ? Buffer.from(crudo, "hex") : Buffer.from(crudo, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY tiene que tener 32 bytes (64 caracteres hex o 44 en base64).");
  }
  return buf;
}

function llaveDeSesion(): Buffer {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Falta SESSION_SECRET: sin eso no hay con qué cifrar los tokens.");
    }
    // Solo en desarrollo, igual que la sesión.
    return Buffer.from(hkdfSync("sha256", "dev-only-secret-change-me", "jarvis", "cifrado-tokens-v1", 32));
  }
  return Buffer.from(hkdfSync("sha256", secreto, "jarvis", "cifrado-tokens-v1", 32));
}

function llave(id: string): Buffer {
  if (id === "e") {
    const k = llaveDedicada();
    if (!k) throw new Error("Hay tokens cifrados con ENCRYPTION_KEY pero la variable no está configurada.");
    return k;
  }
  if (id === "s") return llaveDeSesion();
  throw new Error(`Llave de cifrado desconocida: ${id}`);
}

/** La llave con la que se cifra lo nuevo: la dedicada si existe. */
function llaveActual(): { id: "e" | "s"; k: Buffer } {
  const e = llaveDedicada();
  return e ? { id: "e", k: e } : { id: "s", k: llaveDeSesion() };
}

export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.startsWith(PREFIJO);
}

export function cifrar(texto: string | null | undefined): string | null | undefined {
  if (texto === null || texto === undefined || texto === "") return texto;
  if (estaCifrado(texto)) return texto;
  const { id, k } = llaveActual();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `${PREFIJO}${id}:${b64(iv)}:${b64(c.getAuthTag())}:${b64(datos)}`;
}

export function descifrar(valor: string | null | undefined): string | null | undefined {
  if (!estaCifrado(valor)) return valor;
  const [id, iv, tag, datos] = (valor as string).slice(PREFIJO.length).split(":");
  const d = createDecipheriv("aes-256-gcm", llave(id), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}

/**
 * Si un valor guardado tendría que volver a cifrarse: está en texto plano, o
 * cifrado con la llave de sesión cuando ya hay una dedicada.
 */
export function necesitaRecifrar(valor: string | null | undefined): boolean {
  if (!valor) return false;
  if (!estaCifrado(valor)) return true;
  return valor.startsWith(`${PREFIJO}s:`) && llaveDedicada() !== null;
}
