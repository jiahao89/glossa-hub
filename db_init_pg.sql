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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(version_id, kw)
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

-- 9. Pre-populate default users (Colleagues: 王赵云 & 史东升)
-- Default password: magene123 -> SHA256: 3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe
INSERT INTO users (id, username, password_hash, name, role)
VALUES 
('user-wangzhaoyun', 'wangzhaoyun', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '王赵云', 'admin'),
('user-shidongsheng', 'shidongsheng', '3245361ff6d0f8895e9f669d03b3f6a1f7d37495e4fa97876545940c81da56fe', '史东升', 'admin')
ON CONFLICT (username) DO NOTHING;

-- 10. Pre-populate default project
INSERT INTO projects (id, name, description)
VALUES ('proj-default', '迈金智能骑行码表', 'Magene 码表固件词条多人协同翻译项目')
ON CONFLICT (name) DO NOTHING;

-- 11. Pre-populate project member relationships
INSERT INTO project_members (id, project_id, user_id, role)
VALUES 
('mem-1', 'proj-default', 'user-wangzhaoyun', 'owner'),
('mem-2', 'proj-default', 'user-shidongsheng', 'owner')
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Glossary Terms
CREATE TABLE IF NOT EXISTS glossary_terms (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    table_id VARCHAR(64) NOT NULL REFERENCES glossary_tables(id) ON DELETE CASCADE,
    cn_term TEXT NOT NULL,
    en_term TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
