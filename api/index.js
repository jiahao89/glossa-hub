import app from '../server.cjs';

export default function handler(req, res) {
  return app(req, res);
}
