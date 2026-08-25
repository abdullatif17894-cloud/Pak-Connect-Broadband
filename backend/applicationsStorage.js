// Reads/writes the applications array — same pattern as CafeBot's
// ordersStorage.js. Uses Upstash Redis when connected (KV_REST_API_URL /
// KV_REST_API_TOKEN env vars, added automatically by the Vercel + Upstash
// integration), which persists reliably across serverless invocations.
// Locally, and as a fallback if Redis isn't configured, applications are
// stored in data/applications.json.

const fs = require('fs');
const path = require('path');

const BUNDLED_PATH = path.join(__dirname, '..', 'data', 'applications.json');
const REDIS_KEY = 'ptclconnect:applications';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

function ensureBundledFile() {
  if (!fs.existsSync(BUNDLED_PATH)) {
    fs.writeFileSync(BUNDLED_PATH, '[]\n', 'utf8');
  }
}

async function readApplications() {
  if (useRedis) {
    const res = await fetch(`${REDIS_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    if (!data.result) return [];
    return JSON.parse(data.result);
  }

  ensureBundledFile();
  const raw = fs.readFileSync(BUNDLED_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeApplications(applications) {
  if (useRedis) {
    await fetch(`${REDIS_URL}/set/${REDIS_KEY}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify(applications),
    });
    return;
  }

  ensureBundledFile();
  fs.writeFileSync(BUNDLED_PATH, JSON.stringify(applications, null, 2) + '\n', 'utf8');
}

module.exports = { readApplications, writeApplications };
