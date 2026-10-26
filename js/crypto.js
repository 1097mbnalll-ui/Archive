// التشفير: كل شي ينحفظ على GitHub مشفّر بـ AES-256-GCM، والمفاتيح تنفتح بكلمة السر.
// كل هذا يصير داخل المتصفح بأداة التشفير المدمجة فيه (Web Crypto)، وما يطلع أي مفتاح من الجهاز.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const PBKDF2_ITERATIONS = 600000;

export function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const randomId = () => Array.from(randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('');

// يحوّل كلمة السر إلى مفتاح قوي. التكرار الكثير يخلي تخمينها بطيء جدًا.
export async function keyFromPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export async function encrypt(key, bytes) {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return out;
}

export async function decrypt(key, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));
}

export const encryptJson = (key, value) => encrypt(key, encoder.encode(JSON.stringify(value)));
export const decryptJson = async (key, data) => JSON.parse(decoder.decode(await decrypt(key, data)));

export const exportKey = async (key) => new Uint8Array(await crypto.subtle.exportKey('raw', key));
export const importKey = (raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

// يقفل مفتاح البيانات بمفتاح كلمة السر.
export async function wrapKey(passwordKey, dataKey) {
  return toBase64(await encrypt(passwordKey, await exportKey(dataKey)));
}

export async function unwrapKey(passwordKey, wrapped) {
  return importKey(await decrypt(passwordKey, fromBase64(wrapped)));
}
