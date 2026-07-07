# GlossaHub 云端部署指南

## 架构总览

```
用户浏览器
    ↓
Vercel (前端静态托管) ── HTTP → Render (Express 后端) ── TCP → Supabase (PostgreSQL)
免费 / CDN 加速            免费层 / 休眠 15min             免费 500MB
```

> **Render 休眠说明**：免费层在 15 分钟无请求后自动休眠，首次请求需等待约 30-50 秒冷启动。开发阶段完全可接受。

---

## 第一步：Supabase 数据库

1. 访问 [supabase.com](https://supabase.com) 注册并创建新项目（免费层 500MB）
2. 进入 **SQL Editor**，粘贴并执行 `db_init_pg.sql` 全部内容
3. 进入 **Project Settings → Database**，找到 **Connection string**，选择 **URI** 格式
4. 复制连接串，格式类似：
   ```
   postgresql://postgres.[项目名]:[密码]@aws-0-[区域].pooler.supabase.com:6543/postgres
   ```
5. 保存此连接串备用（后续配置为 `DATABASE_URL`）

---

## 第二步：Render 后端部署

1. 访问 [render.com](https://render.com) 注册（可用 GitHub 账号）
2. **New → Web Service → 连接 GitHub 仓库**（选择 `glossa-hub` 仓库）
3. 配置：
   - **Name**: `glossahub-api`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.cjs`
   - **Instance Type**: Free
4. 环境变量（**Environment** 标签页）：

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | 第一步复制的 Supabase 连接串 |
   | `JWT_SECRET` | 运行 `openssl rand -hex 32` 生成的随机字符串 |
   | `CORS_ORIGINS` | `https://你的前端域名.vercel.app`（第三步部署后回填） |
   | `NODE_ENV` | `production` |

5. 点击 **Create Web Service**，等待部署完成
6. 记录后端地址，格式类似：`https://glossahub-api.onrender.com`

> 首次部署时 `CORS_ORIGINS` 可先留空或填一个占位值，等前端部署后再更新。

---

## 第三步：Vercel 前端部署

1. 访问 [vercel.com](https://vercel.com) 注册（用 GitHub 账号）
2. **Add New Project → Import** 选择 `glossa-hub` 仓库
3. 配置：
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Root Directory**: `./`（默认）
4. 环境变量（**Settings → Environment Variables**）：

   | Key | Value |
   |-----|-------|
   | `VITE_API_BASE_URL` | `https://glossahub-api.onrender.com`（第二步的后端地址） |

5. 点击 **Deploy**，等待构建完成
6. 记录前端地址，格式类似：`https://glossa-hub.vercel.app`

---

## 第四步：回填 CORS 白名单

1. 回到 Render Dashboard → `glossahub-api` → **Environment**
2. 将 `CORS_ORIGINS` 更新为实际的 Vercel 域名
3. 保存后 Render 会自动重新部署

---

## 数据导入（可选）

如果需要将本地 SQLite 数据迁移到 Supabase PostgreSQL：

1. 启动本地后端并连接 Supabase（设置 `DATABASE_URL` 环境变量）
2. 本地前端登录后，通过 CSV 导出功能导出各表数据
3. 在云端前端导入 CSV

或直接在 Supabase SQL Editor 手动插入数据。

---

## 环境变量速查

### Render（后端）

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | Supabase PG 连接串 | `postgresql://postgres.xxx:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` |
| `JWT_SECRET` | JWT 签名密钥 | `openssl rand -hex 32` 生成的 64 位字符串 |
| `CORS_ORIGINS` | 前端域名白名单 | `https://glossa-hub.vercel.app` |
| `NODE_ENV` | 运行环境 | `production` |

### Vercel（前端）

| 变量 | 说明 | 示例 |
|------|------|------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `https://glossahub-api.onrender.com` |

---

## 费用

| 服务 | 免费额度 | 预估月费用 |
|------|---------|-----------|
| Vercel Hobby | 100GB 带宽 / 无限部署 | ¥0 |
| Render Free | 750 小时/月 / 休眠 15min | ¥0 |
| Supabase Free | 500MB 存储 / 50K MAU | ¥0 |
| **合计** | | **¥0** |

> 当项目正式投入使用后，Render 升级到 Starter（$7/月）可消除休眠，Supabase Pro（$25/月）扩展到 8GB 存储。
