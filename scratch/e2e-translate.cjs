const { chromium } = require('playwright');

async function run() {
  console.log("🚀 启动浏览器进行 E2E 翻译诊断...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => {
    console.log(`🖥️ 浏览器控制台 [${msg.type()}]:`, msg.text());
  });
  
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      console.log(`📡 发送 API 请求: [${request.method()}] ${request.url()}`);
    }
  });
  
  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      console.log(`📥 收到 API 响应: [${response.status()}] ${response.url()}`);
      try {
        const text = await response.text();
        console.log(`📄 响应内容: ${text.slice(0, 500)}`);
      } catch (e) {
        console.log(`📄 无法读取响应体: ${e.message}`);
      }
    }
  });
  
  console.log("👉 导航到 Vercel 前端登录页...");
  await page.goto('https://glossa-hub.vercel.app', { timeout: 60000 });
  await page.waitForTimeout(5000);
  
  console.log("👉 自动填充超级账号...");
  await page.fill('input[placeholder*="用户名"]', 'jiahao');
  await page.fill('input[placeholder*="密码"]', 'magene123');
  await page.click('button:has-text("登录")');
  
  console.log("⏳ 等待登录跳转入系统...");
  await page.waitForTimeout(10000);
  
  console.log("👉 切换到词条管理页面...");
  await page.click('a:has-text("词条管理")');
  await page.waitForTimeout(5000);
  
  console.log("👉 尝试触发批量翻译操作以检测接口响应...");
  const batchBtn = await page.$('button:has-text("批量翻译")');
  if (batchBtn) {
    console.log("🎯 点击批量翻译按钮...");
    await batchBtn.click();
    await page.waitForTimeout(5000);
    const startBatchBtn = await page.$('button:has-text("开始 Dify 翻译")') || await page.$('button:has-text("开始")') || await page.$('button:has-text("翻译")');
    if (startBatchBtn) {
      console.log("🎯 点击开始 Dify 翻译...");
      await startBatchBtn.click();
    } else {
      console.log("⚠️ 未在弹窗中发现开始按钮");
    }
  } else {
    console.log("⚠️ 页面上没有批量翻译按钮");
  }
  
  console.log("⏳ 挂起 15 秒捕获网络收发包与日志...");
  await page.waitForTimeout(15000);
  
  const scPath = '/Users/jacko/.gemini/antigravity-ide/brain/4995d787-cc33-4a51-b922-977e67d4bd47/e2e-translate-result.png';
  await page.screenshot({ path: scPath, fullPage: true });
  console.log(`📸 运行结果截图已保存至: ${scPath}`);
  
  await browser.close();
}

run().catch(err => {
  console.error("❌ E2E 测试异常终止:", err.message);
});
