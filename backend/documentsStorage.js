// Stores uploaded document files (CNIC, utility bill, SOF form, NTC
// letter). Uses Vercel Blob storage in production (BLOB_READ_WRITE_TOKEN
// env var — added automatically once Blob storage is connected to the
// Vercel project, same idea as the Upstash Redis integration). This is
// needed because, like data/orders.json, files written to Vercel's
// filesystem at request time do not persist across invocations.
//
// Locally, and as a fallback if Blob storage isn't configured, files are
// written to data/uploads/ and served from there.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Saves one uploaded file (a multer file object: { buffer, originalname,
// mimetype }) and returns a reference the staff dashboard can later read
// back via readDocument(). Documents contain sensitive personal info
// (CNIC, utility bills), so the Blob store is private — files are only
// ever fetched server-side (see readDocument) and streamed through our
// own authenticated route, never exposed as a public URL.
async function saveDocument(file, applicationId, fieldName) {
  const ext = path.extname(file.originalname) || '';
  const safeName = `${applicationId}_${fieldName}_${crypto.randomBytes(4).toString('hex')}${ext}`;

  if (useBlob) {
    // Loaded lazily so local dev (without @vercel/blob installed/needed)
    // never touches this path.
    const { put } = require('@vercel/blob');
    const blob = await put(safeName, file.buffer, {
      access: 'private',
      contentType: file.mimetype,
    });
    return blob.pathname;
  }

  ensureUploadsDir();
  const destPath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(destPath, file.buffer);
  return `/uploads/${safeName}`;
}

// Reads back a document saved by saveDocument(). Returns
// { stream, contentType } or null if it can't be found. Used by the
// staff document-download route in server.js — the client never talks
// to Vercel Blob directly.
async function readDocument(ref) {
  if (!ref) return null;

  if (ref.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(ref));
    if (!fs.existsSync(filePath)) return null;
    return { stream: fs.createReadStream(filePath), contentType: 'application/octet-stream' };
  }

  if (!useBlob) return null;

  const { get } = require('@vercel/blob');
  const result = await get(ref, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;

  return {
    stream: Readable.fromWeb(result.stream),
    contentType: (result.blob && result.blob.contentType) || 'application/octet-stream',
  };
}

module.exports = { saveDocument, readDocument };
