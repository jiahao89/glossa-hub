# Supabase 云端数据库连接与 Render 部署排障审查报告

为了解决 Render 线上环境始终降级为本地 SQLite 数据库、新创建的管理员账号无法登录以及部署重启后数据丢失的问题，我们进行了一轮深度的本地仿真与云端链路排查。以下是本次故障的详细技术总结。

---

## 1. 故障现象与影响

1.  **无法登录云端**：Render 后端服务启动时，连接 PostgreSQL 失败，自动切换为本地 SQLite 数据库。由于云端新注册的用户（如 `jiahao`）只存在于云端 Supabase，导致这批管理员账号无法成功登录。
2.  **数据非持久化丢失**：由于 Render 的文件系统是临时易失的（Ephemeral），每次重新构建或冷启动重启时，本地 SQLite 的数据都会被擦除重置，造成数据表“离奇丢失”的假象。

---

## 2. 问题深度剖析与根因链

我们通过在本地与线上注入 `pgDebug` 诊断指标、本地并发仿真测试以及使用 Playwright 进行云端看板爬取，排查出了三个层层交织的物理和协议瓶颈：

### 根因一：密码保留字符 `@` 在连接串中被截断
*   **分析发现**：用户的原始数据库密码中含有特殊字符 `@`（形如 `Jackojia1@`）。在 PostgreSQL URI 标准规范中，`@` 是分隔密码与主机名的唯一界定符。
*   **截断表现**：默认的 `pg-connection-string.parse()` 库在解析时发生歧义，误将密码分割成了 `Jackojia1`，剩下的部分错配为主机信息。这导致验证报文发送到 Supabase 后被网关无情拒绝，Supavisor 池化代理会安全起见返回隐蔽的 `tenant/user not found`。

### 根因二：Render 物理网络不支持 IPv6 导致 `ENETUNREACH`
*   **分析发现**：Supabase 默认分配的直连数据库域名 `db.[PROJECT_REF].supabase.co:5432` 仅包含 IPv6 (AAAA) DNS 记录。
*   **网络受阻**：Render 的免费层网络容器仅支持纯 IPv4。在发起直连时，Node 的 DNS 解析出 IPv6 并尝试建连，瞬间撞上 `connect ENETUNREACH`（网络不可达）。

### 根因三：多租户池化 Host 路由分配偏差（核心破局点）
*   **分析发现**：此前在配置中，我们根据项目所在的 `ap-northeast-2`（首尔）区域，误以为其 Pooler 地址是常规的 `aws-0-ap-northeast-2.pooler.supabase.com`。
*   **突破口**：我们使用已配置的 OAuth 凭证，通过 Supabase 官方 Management API 获取了此项目的精确网关元数据：
    ```json
    "db_host": "aws-1-ap-northeast-2.pooler.supabase.com",
    "db_port": 6543,
    "user": "postgres.seypmsanzhhbucnilcgl"
    ```
    证实官方为该项目分配的实际池化入口是 **`aws-1-`** 分支，而非 `aws-0-`！所以之前即使密码正确，在 `aws-0-` 网关上也是报错“租户未找到”。

---

## 3. 代码级修复与防御策略

针对上述问题，我们编写并推送了更具弹性和自适应的容错连接程序（Commit: `ac0b0e7`）：

1.  **贪婪正则防截断解析**：
    在 `server.cjs` 的 `initDatabase` 中，引入了正则贪婪匹配解析：
    ```javascript
    const regexMatch = pgUrl.match(/postgres(?:ql)?:\/\/([^:]+):(.*)@([^:\/]+):([0-9]+)\/([^?]+)/);
    ```
    不管用户输入的是 `%40` 编码还是未编码的双 `@` 分隔符，正则都将以最后一个 `@` 为界，提取出 100% 完整的密码，并利用 `decodeURIComponent` 进行容错解码。
2.  **强制 IPv4 DNS 拦截**：
    直接为 `pg.Pool` 挂载自定义 `lookup` 拦截器，强制底层 TCP 套接字仅使用 IPv4 握手：
    ```javascript
    pgConfig.lookup = (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    };
    ```
3.  **网关自动重定向映射**：
    新增智能路由转换，如果检测到用户配置了直连地址（IPv6 限制）或者误填了 `aws-0-` 路由，代码在内存中会自动将其规整为正确的官方池化域名与端口：
    ```javascript
    if (pgConfig.host === 'aws-0-ap-northeast-2.pooler.supabase.com') {
      pgConfig.host = 'aws-1-ap-northeast-2.pooler.supabase.com';
      pgConfig.port = '6543';
    }
    ```

---

## 4. 排障经验教训与规范建议

*   **敏感凭证 URL 编码**：在将带有 `@`, `:`, `/` 的密码写入数据库连接串时，最佳实践是先对其进行 URL 编码（`@` 转换为 `%40`）。
*   **优先核对云端网关元数据**：当数据库网关报出 `tenant not found` 时，不要盲目重复尝试，应优先通过官方 API 或者控制台 Connect 弹窗核实网关分配的主机名（如 `aws-0-` 与 `aws-1-` 的区别）。
*   **警惕云平台的物理网络局限**：在 Render、Vercel 等不支持 IPv6 的静态容器部署持久化数据库时，必须优先使用包含 IPv4 的池化连接（Pooler），并注意在 Node 层强制 IPv4 DNS 偏好，以防出现 `ENETUNREACH`。
