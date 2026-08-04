// GlossaHub Vercel Serverless Entry (ESM wrapper around CJS app)
// Vercel requires the entry file to be named index.js / index.mjs / index.ts.
// The actual Express app is CommonJS (server.cjs exports the express handler).
// This wrapper bridges ESM default-export semantics to the CJS module.exports.

import app from '../server.cjs';

export default function handler(req, res) {
  // server.cjs does `module.exports = app` (CJS). When imported from ESM,
  // Node exposes the entire `module.exports` object as the default import,
  // which IS the express handler function. So `app` is directly callable.
  return app(req, res);
}