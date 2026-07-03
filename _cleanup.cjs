/**
 * 清理所有 E2E 测试残留的临时版本和词条
 */
const http = require('http');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: opts.method || 'GET', headers: opts.headers || {}, timeout: 30000,
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
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'wangzhaoyun', password: 'magene123' })
  });
  const token = JSON.parse(login.body).token;
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const tablesRes = await fetch(`${BASE}/api/tables`, auth);
  const tables = JSON.parse(tablesRes.body);
  const polluted = tables.filter(t => t.name?.includes('E2E') || t.name?.includes('TMP'));

  console.log(`发现 ${polluted.length} 个测试残留版本`);
  for (const t of polluted) {
    const delRes = await fetch(`${BASE}/api/projects/proj-default/versions/${t.id}`, {
      method: 'DELETE', headers: auth.headers
    });
    console.log(`  删除 ${t.name} (${t.id}): ${delRes.status}`);
  }

  // 验证
  const finalRes = await fetch(`${BASE}/api/tables`, auth);
  const finalTables = JSON.parse(finalRes.body);
  console.log(`\n清理后剩余 ${finalTables.length} 个版本:`);
  finalTables.forEach(t => console.log(`  - ${t.name}`));

  const dashRes = await fetch(`${BASE}/api/dashboard/stats`, auth);
  const dash = JSON.parse(dashRes.body);
  console.log(`\nDashboard: ${dash.termCount}条 / ${dash.versionCount}个版本`);
}
main();
