# GlossaHub - 迈金词条协同与版本管理平台 技术设计文档 (Technical Design)

## 1. 系统架构设计

GlossaHub 已由早期的 BaaS (Supabase) 架构重构为**独立双端轻量级系统架构**：
*   **前端展示层**：基于 Vite 8 与 React 19 构建的高性能单页面应用 (SPA)。利用 `apiFetch` 统一封装与后端接口交互。
*   **后端控制层**：基于 Express 实现的私有化部署服务端。内置 JWT 鉴权校验器、bcrypt 慢哈希加盐密码校验、限流防暴力破解组件及 Dify AI 翻译网关代理。
*   **数据库接入层**：统一数据库接口 `db.query` 与 `db.run`。支持多数据库驱动，默认挂载本地高速 SQLite 引擎（`glossahub.db`），且完全向前兼容独立 PostgreSQL 数据库。

```
+-----------------------------------------------------------------------------------+
|                        GlossaHub 前端 Web 应用 (React + Vite)                      |
+-----------------------------------------------------------------------------------+
|         | 统一鉴权 apiFetch       | 动态表格状态流              | CSV 导出导入逻辑       |
+---------+-------------------------+-----------------------------+-------------------------+
          |                                      |                              |
          v (JWT Authorization)                  v (apiFetch JSON Payload)       v (Blob Download)
+-------------------------------------------------------------------------------------------+
|                          Express 后端网关 (Port 3001)                                     |
+-------------------------------------------------------------------------------------------+
|     * jwtMiddleware (JWT鉴权)     * loginLimiter (并发限流)     * Dify API Proxy (安全网关)  |
+-----------------------------------+-----------------------------+-------------------------+
                                                 |
                                                 v (Unified db wrapper)
+-------------------------------------------------------------------------------------------+
|                             数据库持久化 (SQLite / PostgreSQL)                             |
+-------------------------------------------------------------------------------------------+
|     * indexes (已添加 5 个核心索引) * Dynamic Glossary tables  * logs_v2 (变更审计记录)    |
+-------------------------------------------------------------------------------------------+
```

---

## 2. 数据库设计与优化

### 2.1 动态列存储设计 (Glossary Dynamic Schema)
为了允许在专业词汇库中导入任意列数的 CSV，数据库底层采用了“自适应存储”：
*   **表头元数据 (`glossary_tables.headers`)**：以 JSON 数组字符串存储该表所有的列名顺序，如 `'["所在页面", "字号类别", "KW", "CN"]'`。
*   **数据荷载 (`glossary_terms.fields`)**：以 JSON 对象字符串形式，存储该行记录中每个列头对应的实际单元格值，如 `'{"所在页面": "首页", "KW": "KW_HOME"}'`。
通过该设计，无需在运行时动态修改 SQLite/PostgreSQL 的物理表结构，保证了数据库的极致稳定性和读写效率。

### 2.2 数据库性能优化索引 (Indexes)
为了在大文件导入、大表差分比对、以及高频检索时避免发生全表扫描，系统内置了 5 个核心数据库优化索引，在服务启动时自动加载：
1.  `idx_terms_version_id` ON `terms(version_id)`：加速单张词条表的全部记录加载。
2.  `idx_terms_version_kw` ON `terms(version_id, kw)`：加速单元格防抖更新时的单条检索。
3.  `idx_logs_v2_user_id` ON `logs_v2(user_id)`：加速修改历史日志中按操作人筛选的查询速度。
4.  `idx_glossary_terms_table_id` ON `glossary_terms(table_id)`：加速专业词汇表的动态数据渲染。
5.  `idx_versions_project_id` ON `versions(project_id)`：加速项目表载入大表目录的目录检索。

---

## 3. 安全加固机制

1.  **JWT 强校验拦截器**：
    所有除 `/api/auth/login` 之外的 API 路由，必须挂载 `authenticateToken` 中间件。
2.  **安全异常屏蔽**：
    后端全局捕获内部错误，所有报错日志只输出在后端控制台。返回给前端的统一为错误描述或 HTTP 标准响应，如 `{ error: "服务器内部错误，请稍后重试。" }`，严防 SQL 结构或敏感表名泄露。
3.  **Dify 密钥安全网关**：
    前端不再拥有或传递 `DIFY_API_KEY`，所有的 AI 翻译请求一律由 Express 接收后在服务端附加环境变量 `process.env.DIFY_API_KEY` 发往 Dify API，绝对防止由于前端代码反编译或网络嗅探导致的 API Key 泄露。

---

## 4. 模态弹窗重构架构 (Unified GlossaModal Component)

为了消除零散的模态弹窗对 DOM 和样式的无序侵蚀，系统引入了统一的模态组件 `GlossaModal`：
*   **React 组件定义 (`GlossaModal.jsx`)**：
    接受 `isOpen`、`onClose`、`title`、`maxWidth` (可自适应 480px 至 900px)、以及自定义 `children` 和操作按钮元素。
*   **WAI-ARIA 属性对齐**：
    渲染的容器元素绑定 `role="dialog"`、`aria-modal="true"`，并由 `aria-labelledby` 对齐标题，完全符合 WAI-ARIA 无障碍要求。
*   **高级交互事件控制**：
    *   **ESC 快捷键侦听**：组件挂载时注册键盘事件侦听器，当按下 ESC 时自动触发 `onClose`；
    *   **防滚动穿透 (Body Scroll Lock)**：模态窗打开时，底层 `document.body` 自动被注入 `overflow: hidden` 并去除滚动；关闭时，恢复原始 Body 样式；
    *   **背景高斯模糊统一**：全站模态窗遮罩层统一应用 `backdrop-filter: blur(8px)` 的视觉磨砂玻璃效果。

---

## 5. Dify AI 运行监控与 Token Telemetry

AI 自动翻译在产生生产级效益的同时，需要精确对其使用量和速度进行跟踪：
*   **API 数据截获**：
    在 `POST /api/ai-translate` 端点中，调用 Dify 工作流返回的响应中包含了 `total_tokens` 和运行时间 `elapsed_time`。接口成功响应后，通过后端异步存入 `ai_usage_logs` 数据表。
*   **大盘监控数据流 (`/api/dashboard/ai-usage`)**：
    该 API 会自动汇聚三个维度的用量信息，并返回给仪表盘：
    1.  `todayTokens` / `todayCalls`：今日消耗 Token 与今日调用次数。
    2.  `weekTokens` / `weekCalls`：本周累计 Token 与本周调用次数。
    3.  `trend`：包含最近 7 天的每日消耗明细（用于绘制折线趋势图）。

---

## 6. 数据库表变更自适应机制 (Schema Migration)

系统同时兼容本地 SQLite 和生产级云端 PostgreSQL：
*   **SQLite 平滑自适应 (Startup Migrator)**：
    在 `server.cjs` 启动序列中，会动态对 `terms` 表执行 `ALTER TABLE terms ADD COLUMN ...`。在 SQLite 下通过 `TRY-CATCH` 吞掉已经存在该列时报的 Duplicate 错误，确保服务能在一套代码下幂等安全启动。
*   **PostgreSQL 适配配置 (`db_init_pg.sql`)**：
    提供了 PostgreSQL 专用 DDL 定义。包含 `terms` 字典表在 PostgreSQL 下的 `translations_meta jsonb` 类型和 `ai_usage_logs` 等表，适配 Supabase 云数据库的快速初始化。

