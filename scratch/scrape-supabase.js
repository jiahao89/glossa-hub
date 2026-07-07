const { chromium } = require('playwright');

async function run() {
  console.log("🚀 启动浏览器...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log("👉 打开 Supabase 数据库设置页面...");
  await page.goto('https://supabase.com/dashboard/project/seypmsanzhhbucnilcgl/settings/database', { timeout: 60000 });
  
  // 等待页面加载完成（通常会有一些骨架屏）
  console.log("⏳ 等待页面骨架和数据载入...");
  await page.waitForTimeout(10000);
  
  // 获取整个页面的文本内容，用于诊断和分析
  const pageText = await page.innerText('body');
  console.log("\n=================== 页面内容捕获 ===================");
  
  // 查找并打印所有包含 pooler.supabase.com 或者 .supabase.co 的文本
  const lines = pageText.split('\n');
  let found = false;
  for (const line of lines) {
    if (line.includes('pooler.supabase.com') || line.includes('supabase.co') || line.includes('Host') || line.includes('Port') || line.includes('User')) {
      console.log("👉", line.trim());
      found = true;
    }
  }
  
  if (!found) {
    console.log("⚠️ 没有在当前页面直接发现连接串信息。正在尝试直达 Connect 弹窗...");
    await page.goto('https://supabase.com/dashboard/project/seypmsanzhhbucnilcgl?showConnect=true', { timeout: 60000 });
    await page.waitForTimeout(10000);
    const connectText = await page.innerText('body');
    console.log("\n=================== Connect 弹窗内容 ===================");
    console.log(connectText);
  }
  
  console.log("====================================================\n");
  await browser.close();
}

run().catch(err => {
  console.error("❌ 抓取出错:", err.message);
});
