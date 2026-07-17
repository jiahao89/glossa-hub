// GlossaHub Automated Presentation Tour Script (Combined Slideshow & Walkthrough)
// Automatically controls both public/产品介绍.html and the main dashboard SPA

(async function() {
  if (window.demoRunning) return;
  window.demoRunning = true;

  const urlParams = new URLSearchParams(window.location.search);
  const testSpeed = urlParams.has('test_speed');

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, testSpeed ? 50 : ms));
  }

  const isSlideshow = decodeURIComponent(window.location.pathname).includes('产品介绍.html');

  // Clear existing credentials on first launch of the walkthrough to ensure login is shown
  if (!isSlideshow && window.location.pathname === '/' && localStorage.getItem('token') && !sessionStorage.getItem('demo_reset_done')) {
    sessionStorage.setItem('demo_reset_done', '1');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
    return;
  }

  // Inject styles for subtitles and fake cursor
  const style = document.createElement('style');
  style.innerHTML = `
    #demo-subtitles {
      position: fixed;
      bottom: 55px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 12, 18, 0.96);
      color: #ffffff;
      padding: 18px 36px;
      border-radius: 14px;
      font-size: 21px;
      font-weight: 500;
      z-index: 10000000;
      font-family: 'Outfit', system-ui, -apple-system, sans-serif;
      text-align: center;
      max-width: 80%;
      border: 1px solid rgba(0, 240, 255, 0.35);
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.65), 0 0 24px rgba(0, 240, 255, 0.15);
      backdrop-filter: blur(14px);
      line-height: 1.6;
      transition: opacity 0.4s, transform 0.4s;
      letter-spacing: 0.6px;
    }
    #fake-cursor {
      position: fixed;
      width: 22px;
      height: 22px;
      background: rgba(0, 240, 255, 0.5);
      border: 2px solid #ffffff;
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000001;
      transform: translate(-11px, -11px);
      transition: top 0.9s cubic-bezier(0.25, 0.8, 0.25, 1), left 0.9s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.25s, transform 0.25s;
      box-shadow: 0 0 12px rgba(0, 240, 255, 0.85);
    }
    #fake-cursor.click {
      background-color: rgba(255, 0, 110, 0.95);
      transform: translate(-11px, -11px) scale(0.65);
      box-shadow: 0 0 18px rgba(255, 0, 110, 1);
    }
    .demo-highlight {
      outline: 3px solid rgba(0, 240, 255, 0.85) !important;
      outline-offset: 4px;
      box-shadow: 0 0 25px rgba(0, 240, 255, 0.5) !important;
      transition: outline 0.3s, box-shadow 0.3s;
    }
  `;
  document.head.appendChild(style);

  // Subtitle container
  const subtitleDiv = document.createElement('div');
  subtitleDiv.id = 'demo-subtitles';
  subtitleDiv.innerText = '正在初始化 GlossaHub 演示系统...';
  document.body.appendChild(subtitleDiv);

  // Cursor element
  const cursorDiv = document.createElement('div');
  cursorDiv.id = 'fake-cursor';
  cursorDiv.style.top = '100px';
  cursorDiv.style.left = '100px';
  document.body.appendChild(cursorDiv);

  window.confirm = () => {
    console.log('[DEMO MOCK] Auto-approving native confirm dialog');
    return true;
  };

  async function waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  async function moveCursorTo(el, offset = {x: 10, y: 10}) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    cursorDiv.style.top = `${rect.top + offset.y}px`;
    cursorDiv.style.left = `${rect.left + offset.x}px`;
    await sleep(1000);
  }

  async function clickEl(el, offset = {x: 10, y: 10}) {
    if (!el) return;
    await moveCursorTo(el, offset);
    cursorDiv.classList.add('click');
    await sleep(200);
    el.click();
    el.focus();
    el.dispatchEvent(new Event('click', { bubbles: true }));
    cursorDiv.classList.remove('click');
    await sleep(600);
  }

  async function circleCursorAround(el, radius = 25, duration = 2000) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const steps = 25;
    const stepTime = duration / steps;
    
    // Smooth transition into the circle start
    cursorDiv.style.left = `${centerX + radius}px`;
    cursorDiv.style.top = `${centerY}px`;
    await sleep(500);

    const origTransition = cursorDiv.style.transition;
    cursorDiv.style.transition = 'none';
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      cursorDiv.style.left = `${x}px`;
      cursorDiv.style.top = `${y}px`;
      await sleep(stepTime);
    }
    cursorDiv.style.transition = origTransition;
    await sleep(200);
  }

  async function scrollTableContainer(el, scrollLeftTarget, duration = 1800) {
    if (!el) return;
    const start = el.scrollLeft;
    const change = scrollLeftTarget - start;
    const startTime = performance.now();
    
    return new Promise(resolve => {
      function animateScroll(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress * (2 - progress); // easeOutQuad
        el.scrollLeft = start + change * ease;
        if (progress < 1) {
          requestAnimationFrame(animateScroll);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(animateScroll);
    });
  }

  async function typeValue(input, value) {
    if (!input) return;
    await clickEl(input);
    
    const prototype = Object.getPrototypeOf(input);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value');
    
    // Clear value first using native setter
    if (prototypeValueSetter && prototypeValueSetter.set) {
      prototypeValueSetter.set.call(input, '');
    } else {
      input.value = '';
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);

    let currentValue = '';
    for (let char of value) {
      currentValue += char;
      if (prototypeValueSetter && prototypeValueSetter.set) {
        prototypeValueSetter.set.call(input, currentValue);
      } else {
        input.value = currentValue;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(Math.random() * 40 + 40); // realistic human typing delay
    }
    await sleep(400);
  }

  function showSubtitle(text) {
    subtitleDiv.style.opacity = 0;
    subtitleDiv.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => {
      subtitleDiv.innerText = text;
      subtitleDiv.style.opacity = 1;
      subtitleDiv.style.transform = 'translateX(-50%) translateY(0)';
    }, 450);
  }

  // --- PART 1: Slideshow Presentation (10 slides * 18s = 180s = 3 minutes) ---
  if (isSlideshow) {
    const slideshowSteps = [
      {
        subtitle: "迈金出海词条协同与版本管理平台 GlossaHub 技术方案汇报。本项目聚焦解决多语种协同与版本精准控制。",
        duration: 18000,
        action: async () => {
          cursorDiv.style.top = '150px';
          cursorDiv.style.left = '200px';
          await sleep(5000);
        }
      },
      {
        subtitle: "迈金多语种固件与 App 覆盖 16+ 语种。传统电子表格管理存在冲突难解决、无差分审计（Diff）、人工录入易错等痛点。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const firstCard = document.querySelector('.pain-card');
          if (firstCard) {
            await circleCursorAround(firstCard, 35, 2000);
          }
          await sleep(3000);
        }
      },
      {
        subtitle: "自研协同中枢 GlossaHub。提供多语对照网格、AI 翻译引擎及跨版本差异比对，实现版本控制闭环。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const centerNode = document.querySelector('.solution-center');
          if (centerNode) {
            await circleCursorAround(centerNode, 45, 2000);
          }
          await sleep(3000);
        }
      },
      {
        subtitle: "核心功能：行级锁定、AI 智能翻译、来源全量追溯、版本差分、Git 式快照回退，满足版本高精度控制需求。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const featureCard = document.querySelector('.info-card');
          if (featureCard) {
            await moveCursorTo(featureCard, {x: 50, y: 50});
          }
          await sleep(5000);
        }
      },
      {
        subtitle: "集成 AI 翻译流水线。录入中文源词后，自动通过 Dify 代理进行多语种预翻译，显著缩短多语交付周期。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const steps = document.querySelectorAll('.flow-step');
          if (steps && steps[1]) {
            await circleCursorAround(steps[1], 40, 2000);
          }
          await sleep(4000);
        }
      },
      {
        subtitle: "词条编辑自动匹配关联版本的已有译文，高亮差异，支持一键继承，防止多语种冲突。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const diffCard = document.querySelector('.diff-demo');
          if (diffCard) {
            await moveCursorTo(diffCard, {x: 30, y: 10});
          }
          await sleep(5000);
        }
      },
      {
        subtitle: "配备就绪进度矩阵。从翻译覆盖率和审核覆盖率双维度精细化监控，并天级跟踪大模型 Token 消耗。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const chartMock = document.querySelector('.dashboard-mock');
          if (chartMock) {
            await circleCursorAround(chartMock, 60, 2000);
          }
          await sleep(4000);
        }
      },
      {
        subtitle: "四步协同发版流程：开发录入草稿 (DRAFT) ➔ AI 预翻译 (PENDING) ➔ 译员审核 (APPROVED) ➔ 锁定发布 (PUBLISHED) 。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const workflowStep = document.querySelector('.flow-step');
          if (workflowStep) {
            await moveCursorTo(workflowStep, {x: 50, y: 30});
          }
          await sleep(5000);
        }
      },
      {
        subtitle: "技术实现：自研 React SPA 表格，基于 Node.js 代理，实现乐观锁防冲突，确保数据一致性与高可用。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(1200);
          const archNodes = document.querySelectorAll('.arch-node');
          if (archNodes && archNodes[1]) {
            await circleCursorAround(archNodes[1], 40, 2000);
          }
          await sleep(4000);
        }
      },
      {
        subtitle: "下面进入系统控制台，正式演示词条翻译、版本比对、词汇库及快照回退等实际操作。",
        duration: 18000,
        action: async () => {
          window.changeSlide(1);
          await sleep(5000);
        }
      }
    ];

    // Play Slideshow
    for (let i = 0; i < slideshowSteps.length; i++) {
      const step = slideshowSteps[i];
      console.log(`[SLIDESHOW LOG] Step ${i + 1}/${slideshowSteps.length}: ${step.subtitle.substring(0, 30)}...`);
      showSubtitle(step.subtitle);
      await step.action();
      await sleep(step.duration - 1500);
    }

    // Go to walkthrough dashboard
    window.location.href = testSpeed ? '/?demo=true&test_speed=true' : '/?demo=true';
    return;
  }

  // --- PART 2: Walkthrough (18 steps * 11-15s = approx. 3.5 minutes) ---
  const walkthroughSteps = [
    {
      subtitle: "欢迎进入控制台。使用系统管理员 `jiahao` 账户进行角色登录鉴权。",
      duration: 10000,
      action: async () => {
        const usernameInput = await waitForElement('input[placeholder="请输入用户名"]');
        if (usernameInput) {
          await typeValue(usernameInput, 'jiahao');
        }
      }
    },
    {
      subtitle: "输入安全密码。密码采用 bcrypt 强哈希存储，保障协同账户凭证安全。",
      duration: 10000,
      action: async () => {
        const passwordInput = await waitForElement('input[type="password"]');
        if (passwordInput) {
          await typeValue(passwordInput, 'magene123');
        }
      }
    },
    {
      subtitle: "提交登录请求。后端执行 JWT 鉴权校验并向客户端返回 Access Token。",
      duration: 8000,
      action: async () => {
        const loginBtn = await waitForElement('button[type="submit"]');
        if (loginBtn) {
          await clickEl(loginBtn);
        }
      }
    },
    {
      subtitle: "登录成功。进入仪表盘看板，展示版本数、词条数、翻译完成率等核心指标卡片。",
      duration: 9000,
      action: async () => {
        await sleep(1500); // Wait for dashboard to load
        const stats = await waitForElement('.stats-bento') || await waitForElement('.dashboard-container');
        if (stats) {
          stats.classList.add('demo-highlight');
          await circleCursorAround(stats, 80, 2000);
          stats.classList.remove('demo-highlight');
        }
      }
    },
    {
      subtitle: "大盘下方为各版本就绪率进度。监控不同硬件固件版本的全覆盖就绪比例。",
      duration: 9000,
      action: async () => {
        const progressCard = document.querySelector('.panel-card');
        if (progressCard) {
          progressCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          progressCard.classList.add('demo-highlight');
          await circleCursorAround(progressCard, 60, 2000);
          progressCard.classList.remove('demo-highlight');
        }
      }
    },
    {
      subtitle: "底部集成了多语种就绪进度矩阵，精细化展示各目标语言的翻译及审核覆盖率。",
      duration: 9000,
      action: async () => {
        const langCard = Array.from(document.querySelectorAll('.panel-card')).find(el => el.innerText && el.innerText.includes('按语种覆盖率'));
        if (langCard) {
          langCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          langCard.classList.add('demo-highlight');
          
          // Toggle "审核覆盖率" tab
          const reviewTabBtn = Array.from(langCard.querySelectorAll('button')).find(btn => btn.innerText && btn.innerText.includes('审核'));
          if (reviewTabBtn) {
            await clickEl(reviewTabBtn);
          }
          await sleep(2000);
          langCard.classList.remove('demo-highlight');
        }
      }
    },
    {
      subtitle: "进入【词条管理】模块。这是平台最核心的多语对照大表格工作区。",
      duration: 8000,
      action: async () => {
        const translateTabBtn = document.querySelector('button[title="词条管理"]');
        if (translateTabBtn) {
          await clickEl(translateTabBtn);
        }
      }
    },
    {
      subtitle: "表格左侧固定显示键名 and 中文，右侧横向滚动展示全部 16 种目标语言译文。",
      duration: 9000,
      action: async () => {
        await sleep(1500);
        const mainTable = document.querySelector('table');
        const scrollContainerEl = document.querySelector('.overflow-x-auto') || (mainTable ? mainTable.parentElement : null);
        if (scrollContainerEl) {
          scrollContainerEl.classList.add('demo-highlight');
          await sleep(1000);
          // Smoothly scroll to the right to see languages
          await scrollTableContainer(scrollContainerEl, 400, 1500);
          await sleep(1000);
          // Scroll back
          await scrollTableContainer(scrollContainerEl, 0, 1200);
          scrollContainerEl.classList.remove('demo-highlight');
        }
      }
    },
    {
      subtitle: "双击网格首行，触发编辑弹窗。背景附带高斯模糊并锁定 Body 滚动。",
      duration: 9000,
      action: async () => {
        const firstRow = document.querySelector('tbody tr');
        if (firstRow) {
          await moveCursorTo(firstRow, {x: 180, y: 15});
          // Double click simulation
          cursorDiv.classList.add('click');
          await sleep(80);
          cursorDiv.classList.remove('click');
          await sleep(80);
          cursorDiv.classList.add('click');
          await sleep(80);
          cursorDiv.classList.remove('click');
          firstRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          await sleep(2000);
        }
      }
    },
    {
      subtitle: "每个文本框上方展示翻译来源标记：ai 表示大模型预生成，tm 表示匹配自翻译记忆库。",
      duration: 8000,
      action: async () => {
        const badgesInfo = document.querySelector('.meta-badges') || document.querySelector('[role="dialog"] label');
        if (badgesInfo) {
          await circleCursorAround(badgesInfo, 20, 2000);
        }
        await sleep(2000);
      }
    },
    {
      subtitle: "点击“AI 智能翻译”。系统通过后端网关安全代理调用 Dify 工作流进行翻译。",
      duration: 9000,
      action: async () => {
        const aiTranslateBtn = document.querySelector('button[title="调用 Dify 进行 AI 自动预翻译"]') || Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('AI 智能翻译'));
        if (aiTranslateBtn) {
          await moveCursorTo(aiTranslateBtn, {x: 45, y: 12});
          await sleep(3000);
        }
      }
    },
    {
      subtitle: "关闭编辑弹窗。下一步我们将演示跨版本差异对比能力。",
      duration: 7000,
      action: async () => {
        const closeBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText === '取消' || el.innerText === '关闭');
        if (closeBtn) {
          await clickEl(closeBtn);
        }
      }
    },
    {
      subtitle: "进入【词条变更对比】模块，支持多版本之间的双向标准化差分审计。",
      duration: 8000,
      action: async () => {
        const compareTabBtn = document.querySelector('button[title="词条变更对比"]');
        if (compareTabBtn) {
          await clickEl(compareTabBtn);
        }
      }
    },
    {
      subtitle: "选择目标版本后点击对比，系统排除引号/空格等假差异，高亮输出新增与删除记录。",
      duration: 8000,
      action: async () => {
        await sleep(1500);
        const compareBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('对比') || el.innerText.includes('Compare'));
        if (compareBtn) {
          compareBtn.classList.add('demo-highlight');
          await circleCursorAround(compareBtn, 30, 2000);
          compareBtn.classList.remove('demo-highlight');
        }
      }
    },
    {
      subtitle: "进入【专业词汇库】。支持多列 CSV 导入，在编辑时会实时匹配，防止译词冲突。",
      duration: 8000,
      action: async () => {
        const glossaryTabBtn = document.querySelector('button[title="专业词汇库"]');
        if (glossaryTabBtn) {
          await clickEl(glossaryTabBtn);
        }
      }
    },
    {
      subtitle: "进入【数据表管理】。在此快速进行版本表一键克隆，实现版本升级时的无损迁移。",
      duration: 8000,
      action: async () => {
        const versionsTabBtn = document.querySelector('button[title="数据表管理"]');
        if (versionsTabBtn) {
          await clickEl(versionsTabBtn);
        }
      }
    },
    {
      subtitle: "进入【修改日志】模块。平台记录每一次协同修改，并提供 Git 式版本回退。",
      duration: 8000,
      action: async () => {
        const logsTabBtn = document.querySelector('button[title="词条修改日志"]');
        if (logsTabBtn) {
          await clickEl(logsTabBtn);
        }
      }
    },
    {
      subtitle: "点击回退，系统弹出历史快照列表，选择对应版本一键回退，操作前自动备份快照。",
      duration: 16000,
      action: async () => {
        await sleep(1500);
        const rollbackBtn = await waitForElement('button[title="回退到此词条的历史版本"]');
        if (rollbackBtn) {
          await clickEl(rollbackBtn);
          await sleep(2000);
          
          // Find the rollback confirm button in the snapshot modal
          const snapBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && (el.innerText.includes('回退到此版本') || el.innerText.includes('回退中')));
          if (snapBtn) {
            await clickEl(snapBtn);
            await sleep(3500); // Wait for the mock confirmation and rollback to complete
          }
          
          // Close the modal
          const closeBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText === '取消' || el.innerText === '关闭');
          if (closeBtn) {
            await clickEl(closeBtn);
          }
        }
      }
    },
    {
      subtitle: "GlossaHub 极大提升了迈金的全球化交付效率。演示完毕，谢谢大家！",
      duration: 8000,
      action: async () => {
        cursorDiv.style.display = 'none';
        showSubtitle("演示完毕，感谢各位评审专家的观看！");
        window.demoFinished = true;
      }
    }
  ];

  // Play Part 2 (only if not on the slideshow page)
  if (!isSlideshow) {
    for (let i = 0; i < walkthroughSteps.length; i++) {
      const step = walkthroughSteps[i];
      console.log(`[WALKTHROUGH LOG] Step ${i + 1}/${walkthroughSteps.length}: ${step.subtitle.substring(0, 30)}...`);
      showSubtitle(step.subtitle);
      await step.action();
      await sleep(step.duration - 1500);
    }
  }

})();
