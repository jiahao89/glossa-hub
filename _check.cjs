const http = require('http');
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {}, timeout: 30000,
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
async function main() {
  const BASE = 'http://localhost:3001';
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'wangzhaoyun', password: 'magene123' })
  });
  const token = JSON.parse(loginRes.body).token;
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const tablesRes = await fetch(`${BASE}/api/tables`, auth);
  const tables = JSON.parse(tablesRes.body);
  console.log('=== 当前所有版本 ===');
  for (const t of tables) {
    const recRes = await fetch(`${BASE}/api/tables/${t.id}/records`, auth);
    const recs = JSON.parse(recRes.body);
    console.log(`  ${t.name} | id=${t.id} | ${recs.length} 条`);
  }
}
main();
