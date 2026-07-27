# Glossa-Hub 全量重构与架构升级设计文档 (v1.5)

本文档整理并归档 Glossa-Hub 项目 Phase 1 ~ Phase 5 全量代码重构、模块化架构拆分、RBAC 权限矩阵测试以及数据库性能调优的完整设计规范与变更细节。

---

## 📐 1. 重构前后架构对比 (Before & After)

### 重构前 (Legacy Monolith v1.0)
- **后端单体**: `server.cjs` 包含 3,907 行巨石代码，混杂了数据库连接、JWT 签发、12+ 业务路由、回收站备份与 Dify AI 转发逻辑。
- **前端巨型组件**: `TranslationTab.jsx` 单文件包含 4,126 行代码，高频单元格打字导致整个 4,000+ 行组件频繁重渲染。
- **测试空白**: 缺少后端 API 与 RBAC 权限矩阵的自动化测试。
- **数据库瓶颈**: SQLite 采用默认 JOURNAL 锁表模式，大批量 Sync 存在 `SQLITE_BUSY` 锁表开销。

### 重构后 (Modular & High-Performance Architecture v1.5)
- **后端模块化 (`server/`)**:
  - `server/config/db.cjs`: SQLite WAL 模式 + Postgres 连接池与统一 SQL 转换层
  - `server/middleware/`: JWT 认证与细粒度 RBAC 权限守卫 (`auth.cjs`)、限流器 (`rateLimiters.cjs`)
  - `server/services/`: Dify AI 中转服务 (`difyService.cjs`) 与回收站服务 (`recycleBin.cjs`)
  - `server/routes/`: 12 个职责单一的子路由（`auth`, `terms`, `sync`, `admin`, `versions`, `languages`, `dify`, `recycleBin` 等）
  - `server/app.cjs`: Express 应用初始化与优雅关机
  - `server.cjs`: 根目录只保留 delegate 代码，100% 保持 API 与部署兼容性
- **前端组件树 (`src/components/translation/`)**:
  - `TranslationToolbar.jsx`: 搜索、状态/语种列筛选器与导出控制
  - `TranslationTable.jsx`: 表格结构、固定表头、分页与空状态
  - `TranslationRow.jsx`: 使用 `React.memo` 包装的行渲染与内联编辑（高频输入打字零卡顿）
  - `BatchTranslateModal.jsx`: 批量 AI 翻译模态框
  - `BatchActionsModal.jsx`: 批量分类、复制、审核弹窗组
  - `HistoryModal.jsx`: 历史快照库与一键还原
  - `TranslationTab.jsx`: 轻量化 Hook 调度容器
- **自动化测试 (`server/__tests__/`)**:
  - 基于 `supertest` 的 API 集成测试（75 项单元与 API 测试 100% 通过）
- **静态代码校验**:
  - 全项目 `oxlint` 0 warnings / 0 errors (71 个文件)

---

## 🛠️ 2. 阶段重构细节 (Phase 1 - Phase 5)

### Phase 1 — 安全加固与 Lint 规范修复
- **动态 CORS 白名单**: 废弃硬编码 `*` 或全局跨域，改用 `process.env.CORS_ORIGINS` 动态白名单匹配及 `*.vercel.app` 域名匹配。
- **Serverless 环境告警**: 增加 Vercel 环境冷启动无 PostgreSQL `DATABASE_URL` 配置时的持久化风险告警。
- **0 Oxlint 警告**: 清理全项目 15 处代码警告，升级 ES2019 可选异常绑定 (`catch {}`)。

### Phase 2 — 后端单体架构模块化拆分
将 3,907 行 `server.cjs` 解耦为以下模块：
- `server/config/db.cjs`: 数据库配置与 SQL 兼容抽象
- `server/middleware/auth.cjs`: `authenticateToken` / `requireProjectMember` / `requireRole`
- `server/middleware/rateLimiters.cjs`: `authLimiter` / `heavyOperationLimiter`
- `server/services/difyService.cjs`: Dify API 转发与 KW 生成
- `server/services/recycleBin.cjs`: 软删除与回收站还原
- `server/routes/*.cjs`: `auth`, `admin`, `terms`, `sync`, `versions`, `languages`, `dashboard`, `recycleBin`, `logs`

### Phase 3 — 后端核心 API 与 RBAC 权限矩阵测试补全
在 `server/__tests__/` 下新增自动化测试：
1. `auth.test.cjs`: 凭据校验、JWT 签发及未授权路由拦截 (401)
2. `rbac.test.cjs`: Admin / User / Viewer 三级权限矩阵校验，阻止 Viewer 修改词条 (403 FORBIDDEN)
3. `terms.test.cjs`: 词条 CRUD、锁定只读防护 (`403 LOCKED`) 与乐观锁时间戳校验 (`409 CONCURRENCY_CONFLICT`)
4. `difyGlossary.test.cjs`: 术语库精确匹配防抖拦截 (`_source: 'tm'`) 与 KW 生成测试

### Phase 4 — 前端 `TranslationTab.jsx` 组件化与渲染性能优化
- 将 4,126 行巨型文件拆分为 `src/components/translation/` 6 个独立子组件。
- 根文件 `TranslationTab.jsx` 保留向下兼容导出。
- `TranslationRow` 采用 `React.memo` 优化，单元格输入打字时避免背景 50+ 行全表重渲染，Vite 编译体积优至 `35.92 kB`。

### Phase 5 — 数据库性能与协同增强
- **SQLite WAL 模式**: 初始化时自动执行 `PRAGMA journal_mode = WAL;`、`PRAGMA synchronous = NORMAL;` 和 `PRAGMA busy_timeout = 5000;`，极大提升并发读写能力。
- **Postgres / SQLite 批量同步分块**: 对 `POST /api/sync-table` 实施 `CHUNK_SIZE = 500` 的参数化分块，并预查询 Existing Metadata 消除 N+1 性能瓶颈。

---

## 📊 3. 验收与质量指标

| 检查项 | 命令 | 检查标准 | 最终结果 |
| :--- | :--- | :--- | :--- |
| **自动化测试** | `npm test` | 单元与 API 测试全通过 | **`11 passed (11) \| 75 passed (75)`** |
| **代码静态检查** | `npx oxlint` | 0 错误 0 警告 | **`0 warnings, 0 errors`** |
| **Vite 生产构建** | `npm run build` | 构建无遗漏或报错 | **`✓ built in 168ms`** |
| **Git 双分支准则** | `git push` | `v1.1` & `main` 双分支推送 | **已同步推送** |

---

*文档整理时间: 2026-07-27*
