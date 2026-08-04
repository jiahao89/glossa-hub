import app from '../server.cjs';

export default function handler(req, res) {
  const expressApp = typeof app === 'function' ? app : (app.default || app);
  return expressApp(req, res);
}
