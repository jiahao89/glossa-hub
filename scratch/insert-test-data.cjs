const pg = require('pg');
const crypto = require('crypto');

async function run() {
  const dbUrl = 'postgresql://postgres.seypmsanzhhbucnilcgl:feTD7qUN5rIZGPrv@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';
  
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log("📡 连通 Supabase PostgreSQL 成功，开始插入跨版本参考验证数据...");

  const ver1 = '7ba2f063-4418-48bf-bcb3-820d8725a3cc'; // C706码表多语言文案2.1
  const ver2 = 'efbb6a86-1aab-42c5-b26b-6d873e35b0ea'; // C706 码表测试版 v1.0
  const ver3 = '091b64ae-8a90-4e6d-a235-fc092a252f76'; // C706 国际版 Preview

  // 清理可能已存在的相同验证数据以防主键/唯一约束报错
  await client.query("DELETE FROM terms WHERE kw IN ('KW_VALIDATE_CROSS_REF_1', 'KW_VALIDATE_CROSS_REF_2')");
  console.log("🧹 已清理已有的同名测试词条");

  // 1. 插入 KW_VALIDATE_CROSS_REF_1
  await client.query(
    `INSERT INTO terms (id, version_id, kw, zh_cn, translations, created_at, updated_at, is_locked) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)`,
    [crypto.randomUUID(), ver1, 'KW_VALIDATE_CROSS_REF_1', '电池电量极低，请尽快充电', JSON.stringify({"EN（英文）": "Battery critically low, please charge soon.", "FR（法）": "Batterie critique, veuillez charger."})]
  );
  await client.query(
    `INSERT INTO terms (id, version_id, kw, zh_cn, translations, created_at, updated_at, is_locked) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)`,
    [crypto.randomUUID(), ver2, 'KW_VALIDATE_CROSS_REF_1', '电池电量极低', JSON.stringify({"EN（英文）": "Battery critically low", "FR（法）": "Batterie faible"})]
  );
  await client.query(
    `INSERT INTO terms (id, version_id, kw, zh_cn, translations, created_at, updated_at, is_locked) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)`,
    [crypto.randomUUID(), ver3, 'KW_VALIDATE_CROSS_REF_1', '电量极低', JSON.stringify({"EN（英文）": "Low Battery", "FR（法）": "Batterie faible"})]
  );

  // 2. 插入 KW_VALIDATE_CROSS_REF_2
  await client.query(
    `INSERT INTO terms (id, version_id, kw, zh_cn, translations, created_at, updated_at, is_locked) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)`,
    [crypto.randomUUID(), ver1, 'KW_VALIDATE_CROSS_REF_2', '传感器未连接，请检查对端设备', JSON.stringify({"EN（英文）": "Sensor disconnected, please check device."})]
  );
  await client.query(
    `INSERT INTO terms (id, version_id, kw, zh_cn, translations, created_at, updated_at, is_locked) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)`,
    [crypto.randomUUID(), ver2, 'KW_VALIDATE_CROSS_REF_2', '传感器未连接', JSON.stringify({"EN（英文）": "Sensor not connected"})]
  );
  await client.query(
    `INSERT INTO terms (id, version_id, kw, zh_cn, translations, created_at, updated_at, is_locked) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)`,
    [crypto.randomUUID(), ver3, 'KW_VALIDATE_CROSS_REF_2', '未连接传感器', JSON.stringify({"EN（英文）": "No sensor connected"})]
  );

  console.log("🎉 所有跨版本验证测试词条均已成功插入！");
  await client.end();
}

run().catch(e => {
  console.error("❌ 插入失败:", e);
});
