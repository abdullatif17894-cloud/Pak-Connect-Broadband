// Vercel serverless entry point — hands every request to the Express app
// defined in backend/server.js (same pattern as CafeBot).
module.exports = require('../backend/server');
