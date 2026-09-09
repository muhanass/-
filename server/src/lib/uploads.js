import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Saves a "data:image/...;base64,..." string to disk and returns its public URL path.
export function saveBase64Image(dataUrl, subfolder) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Invalid image data');
  const mime = match[1];
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error('Unsupported image type');

  const dir = path.join(UPLOADS_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(match[2], 'base64'));
  return `/uploads/${subfolder}/${filename}`;
}

// Best-effort delete of a previously saved photo when it's replaced or removed.
export function deletePhoto(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOADS_ROOT, publicUrl.replace('/uploads/', ''));
  fs.unlink(filePath, () => {});
}

export { UPLOADS_ROOT };
