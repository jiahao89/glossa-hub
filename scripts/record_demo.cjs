const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 开始本地演示视频录制任务...');

  // Ensure videos directory exists
  const videoDir = path.join(__dirname, '..', 'videos');
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true });
  }

  console.log('🖥️ 正在启动 Chromium 浏览器...');
  const browser = await chromium.launch({
    headless: true // Run headless for clean, silent background recording
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 900 }
    }
  });

  const page = await context.newPage();
  page.on('console', msg => {
    console.log(`[BROWSER LOG] ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.error(`❌ [BROWSER ERROR]: ${err.toString()}`);
  });

  console.log('🌐 正在访问演示地址: http://localhost:5173/产品介绍.html?demo=true');
  
  try {
    await page.goto('http://localhost:5173/产品介绍.html?demo=true', { waitUntil: 'networkidle' });
  } catch (err) {
    console.error('❌ 无法访问本地服务，请确保 Vite 服务已在 http://localhost:5173 启动中！');
    console.error(err);
    await browser.close();
    process.exit(1);
  }

  console.log('🎬 自动演示脚本已启动，正在录制中 (包括 3 分钟幻灯片介绍 + 3 分钟实操演示)...');

  // Poll for window.demoFinished
  let finished = false;
  const startTime = Date.now();
  
  while (!finished) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if demo is finished
    try {
      finished = await page.evaluate(() => window.demoFinished);
    } catch (e) {
      // Ignore evaluation errors during page reloads
    }
    
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    console.log(`⏱️ 已录制: ${m}分${s}秒...`);

    // Timeout safety: 500 seconds (approx 8.3 minutes)
    if (elapsedSec > 500) {
      console.log('⚠️ 录制达到最大安全超时时间，正在强制结束...');
      break;
    }
  }

  console.log('⏳ 演示已完成，等待 5 秒保存最后画面和字幕...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('💾 正在关闭浏览器，保存视频...');
  await context.close();
  await browser.close();

  // Find all page@*.webm files in the videos directory
  const files = fs.readdirSync(videoDir)
    .filter(f => f.startsWith('page@') && f.endsWith('.webm'))
    .map(f => path.join(videoDir, f));

  let videoPath = '';
  if (files.length > 0) {
    // Sort by modification time descending to get the latest one
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    videoPath = files[0];
    console.log(`🔍 找到最新生成的录像文件: ${videoPath}`);
  }

  if (videoPath) {
    console.log(`⏳ 正在等待视频文件写入完成 (检测文件锁)...`);
    let attempts = 0;
    while (attempts < 30) {
      if (fs.existsSync(videoPath)) {
        try {
          const stats1 = fs.statSync(videoPath);
          await new Promise(resolve => setTimeout(resolve, 500));
          const stats2 = fs.statSync(videoPath);
          if (stats1.size > 0 && stats1.size === stats2.size) {
            const fd = fs.openSync(videoPath, 'r+');
            fs.closeSync(fd);
            break;
          }
        } catch (err) {
          // ignore lock check errors
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    const destPath = path.join(videoDir, 'glossahub_demo_v2.webm');
    try {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(videoPath, destPath);
      console.log(`\n✅ 录制成功完成！`);
      console.log(`🎥 视频已保存至: ${destPath}`);
    } catch (renameErr) {
      console.warn(`⚠️ 无法直接重命名视频文件，尝试复制/删除: ${renameErr.message}`);
      try {
        fs.copyFileSync(videoPath, destPath);
        fs.unlinkSync(videoPath);
        console.log(`\n✅ 录制成功完成！`);
        console.log(`🎥 视频已保存至: ${destPath}`);
      } catch (copyErr) {
        console.error(`❌ 视频保存失败: ${copyErr.message}`);
      }
    }

    // Clean up any remaining page@*.webm files
    const remainingFiles = fs.readdirSync(videoDir)
      .filter(f => f.startsWith('page@') && f.endsWith('.webm'))
      .map(f => path.join(videoDir, f));
    for (const rf of remainingFiles) {
      try {
        fs.unlinkSync(rf);
      } catch (e) {}
    }
  } else {
    console.log('\n❌ 录制结束，但未能找到任何录像文件。');
  }
})();
