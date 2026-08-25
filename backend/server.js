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

// --- Testing-phase access gate --------------------------------------------
// Until PTCL formally approves this site, keep it closed to random visitors.
// Set SITE_ACCESS_PASSWORD in Vercel to turn this on; leave it unset (e.g.
// once PTCL approves the launch) and the site opens up with no code change.
const SITE_ACCESS_USER = process.env.SITE_ACCESS_USER || 'ptcl';
const SITE_ACCESS_PASSWORD = process.env.SITE_ACCESS_PASSWORD;
if (SITE_ACCESS_PASSWORD) {
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separatorIndex = decoded.indexOf(':');
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      if (user === SITE_ACCESS_USER && pass === SITE_ACCESS_PASSWORD) {
        return next();
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="PakConnect Broadband - Testing"');
    return res.status(401).send('This site is in private testing. Please enter the access credentials.');
  });
}

const PORT = process.env.PORT || 3000;
const FRONTEND
