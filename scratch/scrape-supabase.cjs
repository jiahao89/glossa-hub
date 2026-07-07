const { chromium } = require('playwright');

const candidates = [
  'jiahao_jia@126.com',
  'jiahao89@126.com',
  'jaho_jia@126.com'
];

async function run() {
  console.log("🚀 启动浏览器...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  for (const email of candidates) {
    console.log(`👉 尝试使用邮箱登录: ${email}...`);
    try {
      await page.goto('https://supabase.com/dashboard/sign-in', { timeout: 60000 });
      await page.waitForSelector('input[type="email"]');
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', 'Jackojia1@');
      
      const submitBtn = await page.$('button[type="submit"]') || await page.$('button:has-text("Sign In")');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      
      await page.waitForTimeout(10000); // 等待10秒
      
      // 拍照保存
      const scPath = `/Users/jacko/.gemini/antigravity-ide/brain/4995d787-cc33-4a51-b922-977e67d4bd47/login-${email.replace('@', '-')}.png`;
      await page.screenshot({ path: scPath });
      console.log(`📸 已保存登录状态截图: ${scPath}`);
    } catch (e) {
      console.log(`❌ 尝试 ${email} 时出错:`, e.message);
    }
  }
  
  await browser.close();
}

run().catch(err => {
  console.error("❌ 运行时出错:", err.message);
});
