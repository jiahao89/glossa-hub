# GlossaHub - 专业词条协同与翻译管理平台

> **版本**: v1.1 | **更新日期**: 2025-07-09

GlossaHub 是一个为跨国硬件固件开发、多语言应用及行业专业名词打造的**独立化词条协同与翻译管理平台**。平台基于 **Vite + React (Frontend)** 与 **Express + SQLite/PostgreSQL (Backend)** 开发，支持全自主私有化部署。

---

## 🚀 核心功能模块

### 1. 📊 仪表盘看板 (Dashboard)
* **全局 KPI 统计**：动态统计当前版本大表数、中文词条总键数、全覆盖翻译词条数，实时计算全语种翻译完成率。
* **翻译/审核覆盖率双视图**：Tab 切换查看"翻译覆盖率"与"审核覆盖率"，按语种柱状图展示，红（<30%）、黄（30%~80%）、绿（>=80%）三色状态指示。
* **AI 用量与 Token 监控大盘**：3 张 AI Telemetry 卡片，监控今日消耗 Token、调用次数与本周累计，集成近 7 天折线趋势图。
* **语种翻译就绪矩阵**：横向柱状图排布展示 16 种目标语种的就绪比例。
* **变更记录**：东八区时间展示团队成员对词条的最新修改轨迹。

### 2. 🔤 词条协同管理 (Translation Manager)
* **多语种翻译网格**：直观的多语种大表编辑界面，支持行编辑、双击修改单元格、高亮标记变动未保存状态。
* **翻译来源追踪**：AI 翻译的值左上角显示 Bot 机器人图标（移至 cell 最左侧，不挤占文本空间），人工输入无图标。
* **后端代理 AI 智能预翻译**：集成 Dify 翻译工作流接口，调用时自动统计 Token 和耗时，API Key 由后端安全代理。
* **智能过滤与排序**：支持"只显示未翻译完词条"快速补漏，提供"修改优先"、"创建优先"及"默认排序"等多种视图。
* **乐观锁并发控制**：编辑保存时携带 `updated_at` 时间戳，服务端 WHERE 条件校验，冲突返回 409。

### 3. 🔍 词条变更对比 (Comparison)
* **双表差异审计**：源表与目标版本表两两对齐，自动标定新增 (ADD)、删除 (DEL)、修改 (MOD)。
* **假差异字符消除**：自动忽略 Unicode 省略号、弯引号、零宽空格等格式引发的不可见假差异。

### 4. 📚 专业词汇库 (Glossary Dynamic Engine)
* **动态自适应多列 CSV 引擎**：支持解析、保存与还原任意列数和列名的 CSV 大表。
* **无损 CSV 导出**：自动遵循当前表的列头顺序与数据内容，实现高保真无损导出。

### 5. 🗃️ 数据表与语种管理 (Table & Languages Manager)
* **表名重命名与克隆**：支持弹窗修改表名，以及后台一键数据克隆对齐。
* **自定义语种字典**：支持创建和编辑目标语种列表，管理其在主网格中的显示顺序与中英文列名称。
* **跨页数据表联动**：Dashboard "查看详情"自动选中对应数据表。

### 6. 🕒 协作修改日志 & 历史回退 (Audit Logs & Rollbacks)
* **全量永久存储**：数据库日志持久化存储，详尽记录每一位操作人的修改动作、变更详情及所针对的版本。
* **Git 式历史回退**：日志页面每条记录支持"回退"按钮，弹出该词条的历史快照列表，选择版本一键回退。回退前自动保存"后悔药"快照，可二次撤销。
* **Diff 对比视图**：双列 Git 风格对比，红色标记旧值，绿色标记新值。

### 7. 🔒 安全加固
* **RBAC 项目级与系统级权限**：14 条项目作用域路由全部挂载 `requireProjectMember` 中间件，非项目成员返回 403。系统 `admin` 在所有项目中自动穿透获得 `owner` 权限，并拥有专属“用户管理”功能（CRUD 系统用户）。
* **敏感操作管理员校验**：sync-cleanup、debug-status 等危险端点仅管理员可调用。
* **密码安全**：bcrypt 加盐慢哈希，管理员密码支持环境变量 `INITIAL_ADMIN_PASSWORD` 配置。
* **JWT 强制校验**：全路由严格 JWT 校验，登录接口频率限制防暴力破解。
* **CORS 白名单**：后端限制特定源的跨域请求。

### 8. 📄 产品介绍与操作说明
* **产品介绍页**：10 页翻页演示，适合展示和参赛，侧边栏 logo 隐藏入口。
* **历史版本页**：0.1 版本（飞书多维表格时期）产品介绍，含飞书插件模拟示意图。
* **操作说明**：从用户角度编写的 6 大模块使用指南。

---

## 🛠️ 项目目录结构

```bash
├── server.cjs                 # Express 后端主入口
├── glossahub.db               # 本地 SQLite 数据库（启动后自动创建）
├── src
│   ├── App.jsx                # 前端单页主控（路由分发 + 日志抽屉）
│   ├── index.css              # 暗黑/明亮双主题样式
│   ├── components
│   │   ├── DashboardTab.jsx   # 仪表盘看板（翻译/审核覆盖率 + AI 用量）
│   │   ├── TranslationTab.jsx # 词条大网格（增删改、AI 代理翻译、乐观锁）
│   │   ├── ComparisonTab.jsx  # 版本差异对比
│   │   ├── GlossaryTab.jsx    # 专业词汇库
│   │   ├── VersionsTab.jsx    # 数据表管理
│   │   ├── LanguagesTab.jsx   # 语种字典配置
│   │   ├── LogsTab.jsx        # 审计日志 + 历史回退
│   │   ├── ErrorBoundary.jsx  # 错误边界
│   │   └── GlossaModal.jsx    # 统一弹窗组件（ARIA 可访问性）
│   └── utils
│       ├── api.js             # apiFetch 封装（401 自动跳转）
│       └── csvHelper.js       # RFC-4180 CSV 解析与导出
├── public
│   ├── 产品介绍.html           # 10 页翻页演示
│   ├── 历史版本.html           # 0.1 版本介绍
│   └── 操作说明.html           # 用户操作指南
├── reviews
│   ├── 迭代计划-v1.1.md        # 迭代计划与路线图
│   ├── code-review-v1.0.md    # 代码审查报告
│   └── 全量代码审查-优化建议.md  # 优化建议
└── scripts
    ├── check_db.cjs           # 数据库状态检查
    └── clone_versions_data.cjs # 数据表克隆
```

---

## 🚀 部署与启动

### 1. 运行环境配置
在项目根目录创建 `.env` 文件：
```env
PORT=3001
JWT_SECRET=magene_secret_token_jwt
INITIAL_ADMIN_PASSWORD=your_secure_password  # 强烈建议设置
# 可选: DB_PATH=/path/to/database.db
VITE_API_BASE_URL=http://localhost:3001
```

### 2. 依赖安装与启动
```bash
# 安装依赖
npm install

# 生产启动
npm start

# 开发联调（前端 5173 + 后端 3001）
npm run dev:all
```

登录开发环境默认账户：
* **系统管理员 (Admin/Owner)**：
  * 用户名：`wangzhaoyun` 或 `shidongsheng` 等
  * 密码：`magene123`（或环境变量 `INITIAL_ADMIN_PASSWORD` 配置的值）
* **协作成员 (User/Editor)**：
  * 用户名：`user1`、`user2`
  * 密码：`user123`
* **只读旁听 (User/Viewer)**：
  * 用户名：`viewer1`、`viewer2`
  * 密码：`viewer123`

---

## ☁️ 云端部署

平台已适配 **Supabase (PostgreSQL) + Render (Backend) + Vercel (Frontend)** 三端部署。
详细部署指导：👉 **[DEPLOYMENT.md](DEPLOYMENT.md)**

* **Vercel**: https://glossa-hub.vercel.app
* **Render**: https://glossa-hub.onrender.com

---

## 📋 迭代路线

| 版本 | 状态 | 主要内容 |
|------|------|---------|
| v0.1 | ✅ | 飞书多维表格插件 |
| v0.2 | ✅ | 独立 Web 应用 |
| v0.3 | ✅ | 云端三端部署，RBAC，AI 翻译 |
| v1.0 | ✅ | 数据安全修复，乐观锁，ON CONFLICT |
| **v1.1** | ✅ | **审核覆盖率，历史回退，安全加固，产品介绍** |
| v1.2 | 📋 | 删除操作数据恢复，细粒度 RBAC |
| v1.3 | 📋 | 性能优化，可访问性补全 |

详细迭代计划：👉 **[reviews/迭代计划-v1.1.md](reviews/迭代计划-v1.1.md)**
