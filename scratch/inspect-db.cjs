const pg = require('pg');

async function run() {
  const dbUrl = 'postgresql://postgres.seypmsanzhhbucnilcgl:feTD7qUN5rIZGPrv@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';
  
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  
  const kw = 'KW_USER_CONNECT_STATUS';
  const res = await client.query('SELECT t.id, v.version_name, t.zh_cn, t.translations FROM terms t JOIN versions v ON t.version_id = v.id WHERE t.kw = $1', [kw]);
  
  console.log(`🔍 【${kw} 的当前状态】:`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(e => {
  console.error("❌ 查询失败:", e);
});
