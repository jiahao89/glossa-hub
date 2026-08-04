// GlossaHub Vercel Serverless Entry — Reverse Proxy to Render Backend
//
// Vercel only serves static assets. /api/* requests are forwarded to the
// real backend at RENDER_BACKEND_URL (env var) so the heavy Express app,
// DB drivers, and JWT_SECRET stay on Render (one source of truth).
//
// Why proxy instead of running the full Express app on Vercel:
//   1. SQLite native module isn't available on Vercel serverless
//   2. JWT_SECRET + DATABASE_URL must only live on Render (security boundary)
//   3. Express cold-starts are slow (~2.5s) — proxy is <200ms
//
// Falls back to a static error if RENDER_BACKEND_URL is missing.

const TARGET = process.env.RENDER_BACKEND_URL || 'https://glossa-hub.onrender.com';

export default async function handler(req, res) {
  if (!TARGET) {
    res.status(503).json({ error: '后端服务地址未配置 (RENDER_BACKEND_URL)' });
    return;
  }

  // Reconstruct target URL
  const targetUrl = TARGET.replace(/\/$/, '') + req.url;

  // Headers: forward everything except host (target has its own)
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length']; // node-fetch will set it

  // Buffer the request body (Vercel gives us a stream)
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // Don't follow redirects (let client see auth redirects)
      redirect: 'manual',
    });

    // Copy response headers
    upstream.headers.forEach((value, key) => {
      // Skip headers that Vercel/Express manages itself
      if (['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    res.status(upstream.status);

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error('[vercel-proxy] upstream error:', err.message);
    res.status(502).json({ error: '后端服务暂时不可用', detail: err.message });
  }
}