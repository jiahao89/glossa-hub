const http = require('http');
const crypto = require('crypto');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {}, timeout: 60000,
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

  // 登录
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'wangzhaoyun', password: 'magene123' })
  });
  const token = JSON.parse(loginRes.body).token;
  const auth = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  // 找源版本和目标版本
  const tablesRes = await fetch(`${BASE}/api/tables`, auth);
  const tables = JSON.parse(tablesRes.body);
  const source = tables.find(t => t.name.includes('C706'));
  const targets = tables.filter(t => t.id !== source.id);

  console.log(`源: ${source.name} (${source.id})`);
  console.log(`目标:`);
  targets.forEach(t => console.log(`  - ${t.name} (${t.id})`));

  // 读源数据
  console.log('\n[1/3] 读取源数据...');
  const srcRes = await fetch(`${BASE}/api/tables/${source.id}/records`, auth);
  const srcRecords = JSON.parse(srcRes.body);
  console.log(`  → ${srcRecords.length} 条`);

  // 同步到每个目标版本
  for (const target of targets) {
    console.log(`\n[2/3] 同步到 ${target.name}...`);

    // 生成新 recordId 避免主键冲突
    const newRecords = srcRecords.map(rec => ({
      recordId: crypto.randomUUID(),
      fields: rec.fields,
      createdAt: rec.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    // 分批同步（每批 200 条，与后端 chunkSize 一致）
    const chunkSize = 200;
    let totalSynced = 0;
    for (let i = 0; i < newRecords.length; i += chunkSize) {
      const chunk = newRecords.slice(i, i + chunkSize);
      const syncRes = await fetch(`${BASE}/api/sync-table`, {
        method: 'POST', headers: auth.headers,
        body: JSON.stringify({
          tableId: target.id,
          tableName: target.name,
          records: chunk
        })
      });
      if (syncRes.status !== 200) {
        console.error(`  ✗ 批次 ${i/chunkSize + 1} 失败: ${syncRes.status} ${syncRes.body}`);
        process.exit(1);
      }
      totalSynced += chunk.length;
      process.stdout.write(`\r  进度: ${totalSynced}/${newRecords.length}`);
    }
    console.log('');
  }

  // 验证
  console.log('\n[3/3] 验证结果:');
  for (const t of tables) {
    const recRes = await fetch(`${BASE}/api/tables/${t.id}/records`, auth);
    const recs = JSON.parse(recRes.body);
    console.log(`  ${t.name}: ${recs.length} 条`);
  }

  // Dashboard
  const dashRes = await fetch(`${BASE}/api/dashboard/stats`, auth);
  const dash = JSON.parse(dashRes.body);
  console.log(`\nDashboard 总计: ${dash.termCount} 条 / ${dash.versionCount} 个版本 / 覆盖率 ${dash.coverage}%`);
}

main().catch(e => { console.error('同步出错:', e); process.exit(1); });
