// PakConnect Broadband backend server.
// Serves the frontend, the PTCL package data, the application form's
// document upload + AI CNIC check, and the staff dashboard API.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const multer = require('multer');

const { checkCnicExpiry } = require('./cnicCheck');
const { saveDocument } = require('./documentsStorage');
const { readApplications, writeApplications } = require('./applicationsStorage');
const { notifyNewApplication } = require('./notifications');

const app = express();

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const PACKAGES_PATH = path.join(__dirname, '..', 'data', 'packages.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const STATUS_FLOW = ['NEW', 'UNDER_REVIEW', 'FORWARDED_TO_PTCL', 'INSTALLED'];
const NEXT_STATUS = {
  NEW: 'UNDER_REVIEW',
  UNDER_REVIEW: 'FORWARDED_TO_PTCL',
  FORWARDED_TO_PTCL: 'INSTALLED',
  INSTALLED: null,
};

app.use(express.static(FRONTEND_DIR));
// Local-dev document fallback (documentsStorage.js writes here when Vercel
// Blob isn't configured); harmless no-op route if the folder doesn't exist.
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.json());

// --- Packages ------------------------------------------------------------

app.get('/api/packages', (req, res) => {
  try {
    const packages = JSON.parse(fs.readFileSync(PACKAGES_PATH, 'utf8'));
    return res.status(200).json(packages);
  } catch (err) {
    console.error('Packages load error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Could not load packages.' });
  }
});

// --- CNIC expiry check (fires as soon as the customer picks the file) ---

app.post('/api/check-cnic', upload.single('idDocument'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file received.' });
  }

  try {
    const result = await checkCnicExpiry(req.file);
    return res.status(200).json(result);
  } catch (err) {
    console.error('CNIC check route error:', err && err.message ? err.message : err);
    return res.status(200).json({ success: true, checked: false, expired: false, message: 'Could not auto-check right now.' });
  }
});

// --- Application submission ----------------------------------------------

const DOCUMENT_FIELDS = ['idDocument', 'utilityBill', 'sofForm', 'ntcLetter'];

app.post(
  '/api/apply',
  upload.fields(DOCUMENT_FIELDS.map((name) => ({ name, maxCount: 1 }))),
  async (req, res) => {
    try {
      const { fullName, mobile, email, address, connectionType, packageId } = req.body || {};

      if (!fullName || !mobile || !email || !address || !connectionType || !packageId) {
        return res.status(400).json({ success: false, error: 'Please fill in all required fields.' });
      }

      const files = req.files || {};
      if (!files.idDocument || !files.utilityBill || !files.sofForm) {
        return res.status(400).json({ success: false, error: 'Please upload all required documents.' });
      }

      const applicationId = crypto.randomUUID().slice(0, 8);

      // Re-run the CNIC check server-side too — never trust the client-side
      // pass/fail alone, the same way finalizeOrder re-validates in CafeBot.
      const cnicResult = await checkCnicExpiry(files.idDocument[0]);
      if (cnicResult.success && cnicResult.checked && cnicResult.expired) {
        return res.status(400).json({
          success: false,
          error: 'This CNIC has expired. Please upload a valid, unexpired CNIC and submit again.',
        });
      }

      const documents = {};
      for (const field of DOCUMENT_FIELDS) {
        if (files[field] && files[field][0]) {
          documents[field] = await saveDocument(files[field][0], applicationId, field);
        }
      }

      const application = {
        applicationId,
        status: 'NEW',
        submittedAt: new Date().toISOString(),
        fullName,
        mobile,
        email,
        address,
        connectionType,
        packageId,
        documents,
        cnicCheck: cnicResult,
      };

      const applications = await readApplications();
      applications.push(application);
      await writeApplications(applications);

      // Notifications never block the response — a slow/failed email or
      // WhatsApp send shouldn't make the customer's submission fail.
      notifyNewApplication(application).catch((err) =>
        console.error('Notification error:', err && err.message ? err.message : err)
      );

      return res.status(200).json({ success: true, applicationId });
    } catch (err) {
      console.error('Application submit error:', err && err.message ? err.message : err);
      return res.status(500).json({ success: false, error: 'Something went wrong submitting your application. Please try again.' });
    }
  }
);

// --- Staff dashboard API ---------------------------------------------------

app.get('/api/staff/applications', async (req, res) => {
  try {
    const applications = await readApplications();
    return res.status(200).json({ applications });
  } catch (err) {
    console.error('Applications list error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Could not load applications.' });
  }
});

app.post('/api/staff/applications/:applicationId/status', async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body || {};

  if (!status || !STATUS_FLOW.includes(status)) {
    return res.status(400).json({ error: 'A valid status is required.' });
  }

  try {
    const applications = await readApplications();
    const application = applications.find((a) => a.applicationId === applicationId);
    if (!application) {
      return res.status(400).json({ error: `No application found with id "${applicationId}".` });
    }

    const expectedNext = NEXT_STATUS[application.status];
    if (!expectedNext || expectedNext !== status) {
      return res.status(400).json({
        error: expectedNext
          ? `Application is "${application.status}" and can only move to "${expectedNext}".`
          : `Application is already "${application.status}" and cannot move further.`,
      });
    }

    application.status = status;
    await writeApplications(applications);
    return res.status(200).json({ application });
  } catch (err) {
    console.error('Status update error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Could not update status.' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PakConnect Broadband server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
