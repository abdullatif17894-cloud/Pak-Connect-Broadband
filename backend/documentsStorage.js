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

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Saves one uploaded file (a multer file object: { buffer, originalname,
// mimetype }) and returns a URL the staff dashboard can open to view it.
async function saveDocument(file, applicationId, fieldName) {
  const ext = path.extname(file.originalname) || '';
  const safeName = `${applicationId}_${fieldName}_${crypto.randomBytes(4).toString('hex')}${ext}`;

  if (useBlob) {
    // Loaded lazily so local dev (without @vercel/blob installed/needed)
    // never touches this path.
    const { put } = require('@vercel/blob');
    const blob = await put(safeName, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return blob.url;
  }

  ensureUploadsDir();
  const destPath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(destPath, file.buffer);
  return `/uploads/${safeName}`;
}

module.exports = { saveDocument };
