# GlossaHub 产品体验与系统架构优化建议 (v1.5)

本评审针对 GlossaHub 当前版本的系统实现（React 19 + Vite 8 + Express + SQLite/PostgreSQL），从**用户体验 (UX)** 与 **系统/代码架构** 两个层面提出针对性、轻量且具备高可行性的优化建议。

---

## 一、 用户体验 (UX) 优化建议

### 1. AI 批量翻译中的非阻塞保护与操作锁定
* **现状与痛点**：
  * 在“手动批量新增词条”弹窗中执行 AI 翻译时，翻译过程需要串行请求 Dify 接口，通常需要 3~10 秒。
  * 翻译进行时，虽然有底部的状态描述，但弹窗内的“取消”或“AI 批量翻译”按钮仍可点击，且可以点击弹窗外的磨砂玻璃遮罩关闭弹窗。这会导致尚未完成的异步翻译流被阻断、丢失，或多次重复触发翻译。
* **建议（小改动）**：
  * **锁定操作**：一旦开始翻译，应当将弹窗内的“取消”、“AI 批量翻译”、“保存新增”按钮全部设为 `disabled` 状态。
  * **防误触遮罩**：在 `GlossaModal` 组件上增加 `closeDisabled` (已实现但当前仅对部分操作生效)，翻译中禁止点击弹窗外部遮罩关闭模态框。

### 2. Dify AI 翻译失败的友好错误指引
* **现状与痛点**：
  * 翻译过程中若 Dify 服务超时、额度超限（401/403/500/504），前端常会直接报 HTTP 状态码的原始错误（例如：`Dify 翻译失败: HTTP 500`），这对于普通翻译人员或 PM 而言无法直观理解。
* **建议（小改动）**：
  * **映射错误码**：在 `TranslationTab.jsx` 的翻译错误 catch 分支中，拦截 Dify 的状态码或常见返回体：
    * **401/403** 提示 ➔ `“Dify 引擎认证失效，请确认管理员是否在【引擎设置】中配置了正确的 API 密钥”`。
    * **500/504** 提示 ➔ `“Dify 服务响应超时，可能由于其大模型系统暂不可用或服务过载，请稍后重试”`。
    * **网络异常/连接失败** ➔ `“无法连接到翻译代理网关，请检查当前网络状态或后端服务是否存活”`。

### 3. 双版本差异同步增加“预览确认”
* **现状与痛点**：
  * 在“词条变更对比”中，执行一键同步操作时会直接更改目标数据库中对应的词条，没有给出明确的变更预览。
* **建议（小改动）**：
  * 在同步按钮触发后，弹出二次确认模态框，并在对话框内列出具体的同步摘要，例如：
    * `“即将同步：新增 X 条词条，修改 Y 条词条。请确认是否继续？”`
  * 甚至展示一个简易的受影响词条列表（显示前 5 条 KW 和中文名称），避免操作人由于选错版本引发数据灾难。

### 4. 操作审计日志（Rollback）的回退前警示
* **现状与痛点**：
  * 日志页面的回退按钮虽然提供了极佳的“后悔药”机制（回退前会自动保存当前版本的快照），但对于用户来说，点击“回退”瞬间缺少足够的警示。
* **建议（小改动）**：
  * 用户选择某个快照并确认回退时，增加高亮的警告弹窗信息：
    * `“⚠️ 警告：此回退操作将用选中的历史快照覆盖该词条的所有语言翻译，当前的修改将会被暂时替换！系统已自动生成当前最新状态的备份快照以防数据丢失。”`

---

## 二、 代码与系统架构优化建议（轻量改动）

### 1. 前端 `localStorage` 的鲁棒安全保护
* **现状与隐患**：
  * `App.jsx` 和 `TranslationTab.jsx` 中多处使用了 `localStorage.getItem` 配合 `JSON.parse`。例如：
    ```javascript
    const [modifiedCells, setModifiedCells] = useState(() => {
      const saved = localStorage.getItem('glossahub_modified_cells');
      return saved ? JSON.parse(saved) : {};
    });
    ```
  * 如果用户浏览器的本地存储意外损坏，或存在手动篡改生成的非 JSON 字符串，页面在初始化加载时会直接抛出语法异常，导致全站**白屏崩溃**。
* **建议（小改动）**：
  * 封装一个安全的 `safeGetLocalStorage` 工具函数，并配合 `try-catch` 进行安全读取：
    ```javascript
    export function safeGetLocalStorage(key, defaultValue) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (err) {
        console.warn(`读取 localStorage [${key}] 失败，使用默认值:`, err);
        return defaultValue;
      }
    }
    ```

### 2. 数据库连接池与 Node 进程的优雅停机（Graceful Shutdown）
* **现状与隐患**：
  * 在 `server.cjs` 后端中，进程一旦强行退出，正在执行的 SQL 事务可能会中断，且 SQLite 文件锁或 PostgreSQL 的空闲连接句柄无法被优雅释放。
* **建议（小改动）**：
  * 在 `server.cjs` 的末尾注册系统退出信号监听器，在退出前主动释放连接资源：
    ```javascript
    const shutdown = async () => {
      console.log('📡 正在安全关闭 GlossaHub 后端服务...');
      // 1. 关闭 Express 服务，拒绝新请求
      if (server) {
        server.close();
      }
      // 2. 关闭 SQLite / PG 数据库连接
      try {
        if (dbType === 'sqlite' && sqliteDb) {
          await new Promise((resolve) => sqliteDb.close(() => resolve()));
          console.log('💾 本地 SQLite 数据库连接已安全关闭。');
        } else if (dbType === 'postgres' && pgPool) {
          await pgPool.end();
          console.log('⚡ PostgreSQL 连接池已安全关闭。');
        }
      } catch (err) {
        console.error('关闭数据库时发生异常:', err);
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    ```

### 3. 前端大表格过滤与搜索的“防抖 (Debounce)”优化
* **现状与隐患**：
  * 在 `TranslationTab.jsx` 中，对搜索框输入是即时更新 `searchQuery` 并重新计算几千条词条的正则匹配。
  * 当表格数据量增加到 1000+ 条以上时，用户在搜索框连续快速键入拼音或字符会导致频繁的重绘计算，浏览器会出现明显的输入延迟与卡顿。
* **建议（小改动）**：
  * 将 `searchQuery` 状态拆分为：`searchTerm`（绑在 input 上的即时值）与 `debouncedSearchQuery`（用于数据过滤）。
  * 引入防抖逻辑，只有当用户停止输入 250ms 后才更新 `debouncedSearchQuery`，从而规避无意义的中间态大量过滤重算。
    ```javascript
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedSearchQuery(searchTerm);
      }, 250);
      return () => clearTimeout(handler);
    }, [searchTerm]);
    ```

### 4. 服务端高危接口的速率限制（Rate Limiting）加固
* **现状与隐患**：
  * 导入大文件 CSV、全量导出 Excel、甚至是同步大表数据接口（`/api/sync-table`）对服务器的 CPU、数据库读写和内存消耗非常大。
  * 虽然系统已引入了限制登录的 `loginLimiter`，但是对于数据同步和导出等重型 API 并没有单独进行保护，若被高并发调用易引发服务假死或拒绝服务（DoS）。
* **建议（小改动）**：
  * 为重型耗能路由独立挂载速率限制中间件：
    ```javascript
    const heavyOperationLimiter = rateLimit({
      windowMs: 5 * 60 * 1000, // 5 分钟
      max: 20,                 // 限制同一 IP 最多只能请求 20 次大表同步/数据导出
      message: { error: '检测到高耗能操作过于频繁，请稍候再试。' }
    });

    app.post('/api/sync-table', authenticateToken, heavyOperationLimiter, ...);
    app.get('/api/tables/:tableId/export-xls', authenticateToken, heavyOperationLimiter, ...);
    ```
