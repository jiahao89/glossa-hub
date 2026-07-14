-- db_init_pg.sql
-- GlossaHub PostgreSQL Database Initialization DDL

-- 1. Create member role type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
        CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');
    END IF;
END$$;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- SHA256 of the password
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    dify_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Project Members Table (RBAC)
CREATE TABLE IF NOT EXISTS project_members (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role member_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- 5. Versions Table
CREATE TABLE IF NOT EXISTS versions (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_name TEXT NOT NULL, -- E.g., "3.2", "3.3"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(project_id, version_name)
);

-- 6. Terms Table (Translations in JSONB)
CREATE TABLE IF NOT EXISTS terms (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    version_id VARCHAR(64) NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    kw TEXT NOT NULL,
    context TEXT,
    owner TEXT, -- The developer in charge (e.g. 王赵云)
    zh_cn TEXT NOT NULL,
    translations JSONB NOT NULL DEFAULT '{}'::jsonb, -- E.g. {"EN（英文）": "Speed", "FR（法）": "Vitesse"}
    translations_meta JSONB NOT NULL DEFAULT '{}'::jsonb, -- 翻译来源标记 {"EN（英文）": "ai", "FR（法）": "human"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    locked_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'DRAFT',
    reject_reason TEXT,
    UNIQUE(version_id, kw)
);

-- 6b. Snapshots Table
CREATE TABLE IF NOT EXISTS term_snapshots (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    term_id VARCHAR(64) NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    version_id VARCHAR(64) NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    kw TEXT NOT NULL,
    zh_cn TEXT,
    translations JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Change Logs Table
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    kw TEXT,
    chinese TEXT,
    action TEXT NOT NULL,
    details TEXT,
    version_name TEXT,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Languages Dictionary Table
CREATE TABLE IF NOT EXISTS languages (
    id TEXT PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lang_code TEXT NOT NULL,
    lang_name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, lang_code)
);

-- 9. Auto update terms.updated_at trigger
CREATE OR REPLACE FUNCTION update_terms_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_terms_timestamp ON terms;
CREATE TRIGGER tr_update_terms_timestamp
BEFORE UPDATE ON terms
FOR EACH ROW
EXECUTE FUNCTION update_terms_timestamp();

-- 9. Pre-populate default users (Colleagues: 王赵云 & 史东升等 8 位管理员 + 2 个普通用户 + 2 个只读用户)
-- Default password: magene123 -> SHA256: 3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe
-- User password: user123 -> SHA256: c30c5e7b233a7be1d82136ab6230b425ef8df468e6b12a32dfc5bbf893e96191
-- Viewer password: viewer123 -> SHA256: 65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894
INSERT INTO users (id, username, password_hash, name, role)
VALUES 
('user-wangzhaoyun', 'wangzhaoyun', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '王赵云', 'admin'),
('user-shidongsheng', 'shidongsheng', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '史东升', 'admin'),
('user-liuchenlu', 'liuchenlu', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '刘晨璐', 'admin'),
('user-liuyuanyuan', 'liuyuanyuan', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '刘圆圆', 'admin'),
('user-bizihao', 'bizihao', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '毕梓豪', 'admin'),
('user-shengyongbang', 'shengyongbang', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '盛永邦', 'admin'),
('user-lanyiwei', 'lanyiwei', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '兰一玮', 'admin'),
('user-jiahao', 'jiahao', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '贾浩', 'admin'),
('user-user1', 'user1', 'c30c5e7b233a7be1d82136ab6230b425ef8df468e6b12a32dfc5bbf893e96191', 'User One', 'user'),
('user-user2', 'user2', 'c30c5e7b233a7be1d82136ab6230b425ef8df468e6b12a32dfc5bbf893e96191', 'User Two', 'user'),
('user-viewer1', 'viewer1', '65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894', 'Viewer One', 'user'),
('user-viewer2', 'viewer2', '65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894', 'Viewer Two', 'user')
ON CONFLICT (username) DO NOTHING;

-- 10. Pre-populate default project
INSERT INTO projects (id, name, description)
VALUES ('proj-default', '迈金智能骑行码表', 'Magene 码表固件词条多人协同翻译项目')
ON CONFLICT (name) DO NOTHING;

-- 11. Pre-populate project member relationships
INSERT INTO project_members (id, project_id, user_id, role)
VALUES 
('mem-1', 'proj-default', 'user-wangzhaoyun', 'owner'),
('mem-2', 'proj-default', 'user-shidongsheng', 'owner'),
('mem-liuchenlu', 'proj-default', 'user-liuchenlu', 'owner'),
('mem-liuyuanyuan', 'proj-default', 'user-liuyuanyuan', 'owner'),
('mem-bizihao', 'proj-default', 'user-bizihao', 'owner'),
('mem-shengyongbang', 'proj-default', 'user-shengyongbang', 'owner'),
('mem-lanyiwei', 'proj-default', 'user-lanyiwei', 'owner'),
('mem-jiahao', 'proj-default', 'user-jiahao', 'owner'),
('mem-user1', 'proj-default', 'user-user1', 'editor'),
('mem-user2', 'proj-default', 'user-user2', 'editor'),
('mem-viewer1', 'proj-default', 'user-viewer1', 'viewer'),
('mem-viewer2', 'proj-default', 'user-viewer2', 'viewer')
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 12. Pre-populate default languages list
INSERT INTO languages (id, project_id, lang_code, lang_name, display_order)
VALUES
('lang-en', 'proj-default', 'EN', 'EN（英文）', 0),
('lang-fr', 'proj-default', 'FR', 'FR（法）', 1),
('lang-de', 'proj-default', 'DE', 'DE（德）', 2),
('lang-es', 'proj-default', 'ES', 'ES（西班牙）', 3),
('lang-it', 'proj-default', 'IT', 'IT（意大利）', 4),
('lang-pt', 'proj-default', 'PT', 'PT（葡萄牙）', 5),
('lang-ko', 'proj-default', 'KO', 'KO（韩）', 6),
('lang-jp', 'proj-default', 'JP', 'JP（日）', 7),
('lang-ru', 'proj-default', 'RU', 'RU（俄罗斯）', 8),
('lang-pl', 'proj-default', 'PL', 'PL（波兰）', 9),
('lang-tc', 'proj-default', 'TC', 'TC（繁）', 10),
('lang-da', 'proj-default', 'DA', 'DA（丹麦）', 11),
('lang-cz', 'proj-default', 'CZ', 'CZ(捷克)', 12),
('lang-se', 'proj-default', 'SE', '瑞典', 13),
('lang-no', 'proj-default', 'NO', '挪威', 14),
('lang-nl', 'proj-default', 'NL', '荷兰', 15)
ON CONFLICT (project_id, lang_code) DO NOTHING;

-- 13. Glossary Tables
CREATE TABLE IF NOT EXISTS glossary_tables (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    headers TEXT DEFAULT '["中文专业术语","英文翻译对应","说明 / 定义"]'
);

-- 14. Glossary Terms
CREATE TABLE IF NOT EXISTS glossary_terms (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    table_id VARCHAR(64) NOT NULL REFERENCES glossary_tables(id) ON DELETE CASCADE,
    cn_term TEXT,
    en_term TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fields TEXT DEFAULT '{}'
);

-- 14b. AI Usage Logs (P1-2: AI 用量追踪)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    project_id VARCHAR(64) NOT NULL,
    term_kw TEXT,
    zh_cn TEXT,
    target_languages TEXT,
    total_tokens INTEGER DEFAULT 0,
    elapsed_time REAL DEFAULT 0,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_pg_versions_project_id ON versions(project_id);
CREATE INDEX IF NOT EXISTS idx_pg_terms_version_id ON terms(version_id);
CREATE INDEX IF NOT EXISTS idx_pg_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_languages_project_id ON languages(project_id);
CREATE INDEX IF NOT EXISTS idx_pg_glossary_terms_table_id ON glossary_terms(table_id);

-- 16. Recycle Bin Table
CREATE TABLE IF NOT EXISTS recycle_bin (
    id VARCHAR(64) PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'version' | 'glossary_table' | 'language'
    entity_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    deleted_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_recycle_bin_expires_at ON recycle_bin(expires_at);

