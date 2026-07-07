# GlossaHub - 专业词条协同与翻译管理平台

GlossaHub（原名协同工作平台）是一个为跨国硬件固件开发、多语言应用及行业专业名词打造的**独立化词条协同与翻译管理平台**。平台基于 **Vite + React (Frontend)** 与 **Express + SQLite/PostgreSQL (Backend)** 开发，现已完全脱离第三方低代码表格环境依赖，支持全自主私有化部署。

---

## 🚀 核心功能模块

### 1. 📊 仪表盘看板 (Dashboard)
* **全局 KPI 统计**：动态统计当前版本大表数、中文词条总键数、全覆盖翻译词条数，实时计算全语种翻译格子覆盖率。
* **AI 用量与 Token 监控大盘**：包含 3 张紫色主题的 AI Telemetry 卡片，精准监控今日消耗 Token、调用次数与本周累计，并集成近 7 天每日 AI 调用消耗 Token 的折线趋势图。
* **语种翻译就绪矩阵**：横向柱状图排布展示 16 种目标语种的就绪比例，具备红（<30%）、黄（30%~80%）、绿（>=80%）三色状态指示，快速直观感知多语言交付就绪态。
* **变更记录**：以东八区时间展示团队成员对词条的最新修改轨迹，如果非今天修改的事件，智能显示 `YYYY-MM-DD HH:mm:ss` 年月日，今天修改的显示时间。

### 2. 🔤 词条协同管理 (Translation Manager)
* **多语种翻译网格**：直观的多语种大表编辑界面。支持行编辑、双击修改单元格，以及高亮标记变动未保存状态。
* **翻译来源追踪徽标 (Bot / Check)**：每次编辑、AI 翻译、TM 引用及批量覆盖动作均会保存来源标记（`ai`/`human`/`tm`）。网格中 AI 翻译的值左上角会呈现 Bot 微标，TM 引入的值会显示 Check 徽标。
* **后端代理 AI 智能预翻译**：集成了 Dify 翻译工作流接口。调用时自动统计 Token 和耗时；由后端进行安全网关代理发送，保障 API Key 安全。
* **智能过滤与排序**：支持“只显示未翻译完词条”快速补漏；提供“修改优先”、“创建优先”及“默认排序”等多种排序视图。

### 3. 🔍 词条变更对比 (Comparison)
* **双表差异科学审计**：源表与目标版本表的两两对齐。自动标定：
  * **新增 (ADD)**：最新版本中额外定义的词条。
  * **删除 (DEL)**：历史版本有而最新版删除的词条。
  * **修改 (MOD)**：翻译值、中英文或所在页面存在变更的词条（高亮对比 old 与 new 差异）。
* **假差异字符消除 (Text Normalization)**：自动忽略 Unicode 省略号、弯引号、零宽空格等格式引发的不可见假差异，确保比对精准度。

### 4. 📚 专业词汇库 (Glossary Dynamic Engine)
* **动态自适应多列 CSV 引擎**：不再受限于固定三列结构。现已支持解析、保存与还原**任意列数和列名**的 CSV 大表（如包含多语种翻译的大词库）。
* **表头与数据自适应渲染**：系统从数据库中拉取大表时，会动态依据导入的 `headers` 构建表格的表头 Th，并智能地按顺序对齐 Td 进行高亮展示。
* **无损 CSV 导出**：自动遵循当前表的列头顺序与数据内容，实现“高保真无损导出”。
* **表内词条数显示**：菜单边常态化渲染词条条目总数。

### 5. 🗃️ 数据表与语种管理 (Table & Languages Manager)
* **表名重命名与克隆**：支持弹窗修改表名，以及在后台进行一键数据克隆对齐（克隆时自动携带并清洗历史翻译快照）。
* **自定义语种字典**：支持创建和编辑支持的目标语种列表，管理其在主网格中的显示顺序与中英文列名称。

### 6. 🕒 无限制协作修改日志 & 快照回退 (Audit Logs & Rollbacks)
* **全量永久存储**：数据库日志持久化存储，详尽记录每一位操作人的修改动作、变更详情及所针对的版本。
* **一键快照回退**：修改翻译前自动捕捉旧快照。Edit Modal 右侧支持一键“撤销恢复历史快照”，回退前自动保存后悔药备份快照防丢失。

### 7. 🎨 统一的 GlossaModal 组件设计
* **WAI-ARIA 可访问性**：全站 16 个弹窗统一重构，具备完美焦点捕获、ESC 键快捷关闭、遮罩层磨砂模糊点击关闭，以及展开期间防止 Body 穿透滚动的锁定拦截（Body Scroll Lock）。

---

## 🔒 生产级安全加固规范

为了达到企业独立化部署的安全要求，项目完成了全方位的安全加固：
1. **密码安全升级**：用户密码存储全面从 SHA256 升级为工业级 **`bcrypt`** 加盐慢哈希，彻底杜绝彩虹表撞库。
2. **严防鉴权漏洞**：彻底移除了无 Token 状态下自动登录为超级管理员的后门逻辑，实行全路由严格 JWT 强制校验。
3. **接口防暴限流**：登录接口引入了基于内存/Redis 频率限制的 `rateLimit`，严防暴力破解。
4. **CORS 白名单隔离**：后端限制特定源的跨域请求，不开放随意通配。
5. **统一异常屏蔽**：接口屏蔽内部报错堆栈（SQL Error 等），统一转换返回友好的通用错误响应，严防内部信息泄露。

---

## 🛠️ 项目目录结构

```bash
├── server.cjs                 # Express 后端主入口（含 SQLite/PostgreSQL 连接、JWT 校验与安全限流）
├── glossahub.db               # 本地 SQLite 缓存数据库（启动后自动创建）
├── src
│   ├── App.jsx                # 前端单页主控（模块路由分发与日志抽屉层）
│   ├── index.css              # 紧凑、沉浸式暗黑/多维网格主题样式
│   ├── components
│   │   ├── DashboardTab.jsx   # 仪表盘看板（进度与变更审计）
│   │   ├── TranslationTab.jsx # 词条大网格（增删改、AI 代理翻译）
│   │   ├── ComparisonTab.jsx  # 版本差异对比
│   │   ├── GlossaryTab.jsx    # 专业词汇库（动态列导入导出）
│   │   ├── VersionsTab.jsx    # 数据表管理（重命名与操作）
│   │   ├── LanguagesTab.jsx   # 语种字典配置
│   │   └── LogsTab.jsx        # 审计日志流
│   └── utils
│       ├── api.js             # 统一 apiFetch 封装（含 401 自动跳转登录）
│       └── csvHelper.js       # RFC-4180 标准 CSV 解析与导出类
└── scripts
    ├── check_db.cjs           # 数据库状态检查脚本
    └── clone_versions_data.cjs # 动态数据表克隆对齐脚本
```

---

## 🚀 部署与启动

### 1. 运行环境配置
在项目根目录创建 `.env` 文件（开发环境），配置您的参数：
```env
PORT=3001
JWT_SECRET=magene_secret_token_jwt
# Dify API Key 不通过环境变量配置，请在应用内"设置"页面填写
# 可选: DB_PATH=/path/to/database.db
# 可选前端连接后端API的Base URL，用于生产部署分流:
VITE_API_BASE_URL=http://localhost:3001
```

### 2. 依赖安装与启动
```bash
# 安装项目依赖
npm install

# 生产级后端独立启动
npm start

# 本地联调开发启动（前端端口 5173，后端端口 3001，已配置 Vite Proxy 代理）
npm run dev:all
```
登录开发环境默认超级管理员：
* **用户名**：`wangzhaoyun`
* **密 码**：`magene123`

---

## ☁️ 云端快速部署适配
为了适配企业生产级多端部署，项目已完成对 **Supabase Database (Postgres) + Render (Backend Node API) + Vercel (Frontend Static SPA)** 的三端部署集成适配。
详细的部署和初始化操作，请查阅独立的云端部署指导书：
👉 **[DEPLOYMENT.md](file:///Users/jacko/Desktop/Projects/glossa-hub/DEPLOYMENT.md)**。

vercel:https://glossa-hub.vercel.app
render service id:srv-d966d8u7r5hc73fs1nvg
render:https://glossa-hub.onrender.com

User list:
* **wangzhaoyun**, **magene123**
* **shidongsheng**, **magene123**
* **liuchenlu**, **magene123**
* **liuyuanyuan**, **magene123**
* **bizihao**, **magene123**
* **shengyongbang**, **magene123**
* **lanyiwei**, **magene123**
* **jiahao**, **magene123**

db密码：feTD7qUN5rIZGPrv