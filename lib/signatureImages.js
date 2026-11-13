// lib/signatureImages.js
// A vet's signature and their own stamp (migration 251), printed on the
// prescription PDF. Uploaded already cleaned in the browser
// (lib/inkImage.js): a transparent PNG cropped to the ink.

export const SIGNATURE_KINDS = ['signature', 'stamp'];
export const MAX_PNG_BYTES = 700 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A staff uuid and 'signature' or 'stamp' -> the table key, else null.
export function signatureKey(staffId, kind = 'signature') {
  if (!UUID.test(String(staffId || '')) || !SIGNATURE_KINDS.includes(kind)) return null;
  return `${kind === 'stamp' ? 'stamp' : 'staff'}:${String(staffId).toLowerCase()}`;
}

// A data URL from the upload -> { base64, bytes } or { error }.
export function parsePngDataUrl(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'Send the image as a PNG' };
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
    return { error: 'That is not a PNG image' };
  }
  if (bytes.length > MAX_PNG_BYTES) return { error: 'The image is too large (keep it under 700 KB)' };
  return { base64: m[1], bytes };
}

// PNG width and height from its header.
export function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// The stored image's bytes for one key, or null.
export async function loadSignaturePng(db, key) {
  if (!key) return null;
  const { data } = await db.from('signature_images').select('png').eq('key', key).maybeSingle();
  return data?.png ? Buffer.from(data.png, 'base64') : null;
}

// Fit an image of (w, h) inside a box (bw, bh), keeping its shape.
export function fitInBox(w, h, bw, bh) {
  if (!w || !h) return { width: 0, height: 0 };
  const s = Math.min(bw / w, bh / h);
  return { width: w * s, height: h * s };
}
