# GlossaHub - 迈金词条智能翻译与版本管理平台 技术方案 (Technical Design)

## 1. 系统架构与技术选型

### 1.1 核心架构设计：独立 Web App + Supabase (BaaS)
为了实现企业内部多用户的高效协同并提供平滑的版本差分对比，项目转型为独立的单页面 Web 应用 (SPA)。系统彻底剥离原飞书/Lark Bitable 的 SDK 绑定。

```
+-----------------------------------------------------------------------------------+
|                           GlossaHub 前端 Web 应用 (React 19 + Vite 8)              |
+-----------------------------------------------------------------------------------+
|       | 身份验证 (Auth)         | 数据交互 (Database)        | 翻译调用 (HTTP API)     |
+-------+-------------------------+---------------------------+-------------------------+
        |                                     |                           |
        v (JWT Authentication)                v (@supabase/supabase-js)   v (Workflow Run)
+---------------------------------+   +---------------------------+   +-----------------+
|   Supabase Auth                 |   |   Supabase Database       |   |  Dify Workflow  |
|   (登录/登出/邀请码注册)          |   |   (PostgreSQL 强类型存储)  |   |  (AI 批量翻译)   |
+---------------------------------+   +---------------------------+   +-----------------+
                                      | 启用 RLS (行级安全策略)     |
                                      | 基于 JSONB 语种映射字段     |
                                      +---------------------------+
```

*   **架构升级优势**：
    1.  **脱离飞书生态依赖**：不需要宿主容器的 JSON-RPC 桥接通道，可在各类 PC 浏览器直接打开，降低维护复杂度。
    2.  **极简的协同实现**：利用 Supabase 自带的 Auth/RLS 机制直接保障安全性，不需要单独建设复杂的后端鉴权体系；数据库直连极大提升了加载性能。
    3.  **JSONB 强适配超宽网格**：采用 PostgreSQL JSONB 字段存储多语种，与多维表格扩展语种列特性一致，同时支持自由扩展新语言而无需变更数据库表结构。

---

## 2. 数据库设计 (Database Schema)

### 2.1 实体关系 DDL 定义
设计包含项目、项目成员权限、版本、词条四个核心表的实体关系：

```sql
-- 1. 定义项目成员角色枚举
CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');

-- 2. 项目表
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    dify_config JSONB DEFAULT '{}'::jsonb, -- 包含 { base_url, api_key }，由项目共享
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. 项目成员关联表 (实现 RBAC)
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role member_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- 4. 固件版本表
CREATE TABLE versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_name TEXT NOT NULL, -- 例如 "3.2", "3.3"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(project_id, version_name)
);

-- 5. 核心词条数据表
CREATE TABLE terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    kw TEXT NOT NULL, -- 词条唯一 Key (如 KW_SPEED)
    context TEXT, -- 词条所在界面 (上下文)
    owner TEXT, -- 负责人 (开发人员)
    zh_cn TEXT NOT NULL, -- 中文源词
    translations JSONB NOT NULL DEFAULT '{}'::jsonb, -- 存储 19 种翻译，如 {"英文": "Speed", "法语": "Vitesse"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(version_id, kw)
);

-- 6. 自动更新 terms 表 updated_at 字段的触发器
CREATE OR REPLACE FUNCTION update_terms_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_terms_timestamp
BEFORE UPDATE ON terms
FOR EACH ROW
EXECUTE FUNCTION update_terms_timestamp();
```

---

## 3. 安全策略与防越权 (RLS Policies)

基于 PostgreSQL 的 RLS 机制，确保非法请求无法穿透到数据层：

### 3.1 项目级别访问隔离
仅允许属于该项目的成员对项目进行读写：
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "项目成员可读项目" ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = id AND project_members.user_id = auth.uid()
        )
    );

CREATE POLICY "所有者可更新项目" ON projects
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = id AND project_members.user_id = auth.uid() AND project_members.role = 'owner'
        )
    );
```

### 3.2 词条读写 RLS 控制
```sql
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;

-- 允许所有项目成员读取所属版本的词条
CREATE POLICY "项目成员可读词条" ON terms
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM versions
            JOIN project_members ON project_members.project_id = versions.project_id
            WHERE versions.id = version_id AND project_members.user_id = auth.uid()
        )
    );

-- 仅允许拥有 editor 或 owner 角色的成员增删改词条
CREATE POLICY "编辑及所有者可修改词条" ON terms
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM versions
            JOIN project_members ON project_members.project_id = versions.project_id
            WHERE versions.id = version_id 
              AND project_members.user_id = auth.uid() 
              AND project_members.role IN ('owner', 'editor')
        )
    );
```

---

## 4. 模块技术实现设计 (Supabase API 客户端集成)

### 4.1 初始化客户端
在 `src/lib/supabaseClient.js` 中初始化客户端：
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 4.2 分页拉取词条数据与过滤
在数据网格中，支持大批词条的分页滚动或快速查询：
```javascript
export async function loadVersionTerms({ versionId, page = 1, limit = 50, searchQuery, onlyUntranslated }) {
  const offset = (page - 1) * limit;
  
  let query = supabase
    .from('terms')
    .select('*', { count: 'exact' })
    .eq('version_id', versionId);

  // 1. 搜索词过滤
  if (searchQuery) {
    query = query.or(`kw.ilike.%${searchQuery}%,zh_cn.ilike.%${searchQuery}%`);
  }

  // 2. 仅未翻译词条过滤 (检查 translations 对象中是否含有空串或缺失某些已知字段)
  // 本地在前端进行更细粒度的 JSON 逻辑过滤，或者在 SQL 端利用 JSON 语法过滤：
  if (onlyUntranslated) {
    // 假设以英文或法语等主流语言缺失来判断
    query = query.or('translations->>英文.eq."",translations->>英文.is.null');
  }

  const { data, count, error } = await query
    .order('kw', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { terms: data, totalCount: count };
}
```

### 4.3 批量分片写入 (防止 HTTP 网关溢出)
通过将大数据集划分为 `200` 条每包的分片来防止大对象写入超时：
```javascript
export async function batchWriteTerms(termsList) {
  const chunkSize = 200;
  
  for (let i = 0; i < termsList.length; i += chunkSize) {
    const chunk = termsList.slice(i, i + chunkSize);
    
    // 执行批量 upsert 操作，若 kw 与 version_id 冲突则执行覆盖
    const { error } = await supabase
      .from('terms')
      .upsert(chunk, { onConflict: 'version_id,kw' });
      
    if (error) {
      console.error(`分片 [${i} - ${i + chunkSize}] 写入失败:`, error);
      throw new Error(`云端数据写入失败: ${error.message}`);
    }
  }
}
```

### 4.4 协同防冲突设计 (并发修改乐观锁)
多人协同修改词条时，为防止彼此修改覆盖，采用 `updated_at` 进行冲突检测：
```javascript
export async function updateTermSecure({ termId, oldUpdatedAt, updatePayload, userId }) {
  // 1. 执行有条件更新
  const { data, error } = await supabase
    .from('terms')
    .update({
      ...updatePayload,
      updated_by: userId,
      updated_at: new Date().toISOString() // 会被触发器重置，但也作为前端校验指示
    })
    .eq('id', termId)
    .eq('updated_at', oldUpdatedAt) // 强制匹配读取时的时间戳
    .select();

  if (error) throw error;

  // 2. 判断是否更新成功
  if (data.length === 0) {
    throw new Error('CONCURRENCY_CONFLICT'); // 触发界面层黄色弹窗警告
  }

  return data[0];
}
```

---

## 5. 版本比对 (Version Diff) 算法实现

前端从云端拉取当前选定的相邻两版本的全量词条数据，然后在内存中进行高效差分哈希计算：

```javascript
export function calculateDiff(versionATerms, versionBTerms) {
  // 构建哈希映射，以便以 O(1) 的时间复杂度定位 KW
  const mapA = new Map(versionATerms.map(item => [item.kw, item]));
  const mapB = new Map(versionBTerms.map(item => [item.kw, item]));

  const diffResult = [];

  // 1. 检查 B (新版) 中存在的所有词条 (寻找“新增”与“修改”)
  for (const [kw, itemB] of mapB) {
    const itemA = mapA.get(kw);

    if (!itemA) {
      // A 中没有，说明是新增词条 (Added)
      diffResult.push({
        kw: kw,
        status: 'added',
        newData: itemB,
        oldData: null,
        changes: {}
      });
    } else {
      // 双方都有，比对内容是否发生修改 (包括中文源词以及 JSONB 中的全部多语种)
      const changes = {};
      let isModified = false;

      // 比对中文源词
      if (itemA.zh_cn !== itemB.zh_cn) {
        isModified = true;
        changes['中文'] = { from: itemA.zh_cn, to: itemB.zh_cn };
      }

      // 获取两边 translations 对象的所有键的并集
      const keysA = Object.keys(itemA.translations || {});
      const keysB = Object.keys(itemB.translations || {});
      const allLanguageKeys = Array.from(new Set([...keysA, ...keysB]));

      // 遍历比对每一个翻译键值对
      allLanguageKeys.forEach(lang => {
        const valA = (itemA.translations || {})[lang] || '';
        const valB = (itemB.translations || {})[lang] || '';
        if (valA !== valB) {
          isModified = true;
          changes[lang] = { from: valA, to: valB };
        }
      });

      if (isModified) {
        diffResult.push({
          kw: kw,
          status: 'modified',
          newData: itemB,
          oldData: itemA,
          changes: changes
        });
      } else {
        diffResult.push({
          kw: kw,
          status: 'unchanged',
          newData: itemB,
          oldData: itemA,
          changes: {}
        });
      }
    }
  }

  // 2. 检查 A (旧版) 中存在但 B 中不存在的词条 (寻找“已删除”)
  for (const [kw, itemA] of mapA) {
    if (!mapB.has(kw)) {
      diffResult.push({
        kw: kw,
        status: 'deleted',
        newData: null,
        oldData: itemA,
        changes: {}
      });
    }
  }

  return diffResult;
}
```

---

## 6. 系统环境与跨域配置 (CORS)
由于前端直接在浏览器（如 `http://localhost:5173` 或生产环境域名 `https://glossahub.magene.com`）内向 Dify API 和 Supabase BaaS 终端发起请求：
1.  **Dify 跨域配置**：需要在 Dify 部署服务器的 Nginx 反向代理配置中开启 `CORS` 响应头，以允许来自前端域名的 `OPTIONS`、`POST` 等跨域请求。
2.  **Supabase 域名安全**：在 Supabase 管理控制台中，需将开发域名与生产环境域名加入到 `Allowed Redirect URLs` 中，并在 `Site URL` 中正确配置网站基准地址，保证 JWT 认证安全。
