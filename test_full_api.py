"""
GlossaHub v1.5 全量 API 集成测试 (单次登录)
覆盖: 认证/Dashboard/版本CRUD/sync-table/锁定/语种/词汇库/日志/回收站/调试状态
      /用户管理+RBAC/AI翻译TM Bypass+Prompt Injection/模糊匹配/健康检查/clean-empty/sync
"""
import json, urllib.request, urllib.error, time, uuid, sqlite3

BASE = "http://localhost:3001"
PID = "proj-default"
DB_PATH = "/Users/jacko/Projects/glossa-hub/glossahub.db"

def api(method, path, token=None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read()
        return resp.getcode(), (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, (json.loads(raw) if raw and raw.strip() else {})
        except Exception:
            return e.code, {"_raw": raw[:300]}
    except Exception as e:
        return 0, {"_err": str(e)[:200]}

def get_records(d):
    """从 GET records 响应中提取 records 数组"""
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        return d.get("records", [])
    return []

print("=" * 70)
print("GlossaHub v1.5 全量 API 集成测试")
print("=" * 70)

results = []
def check(name, passed, detail=""):
    ok = "✅" if passed else "❌"
    results.append(ok)
    print(f"  {name}: {ok} {detail}")

# ===== Login =====
c, d = api("POST", "/api/auth/login", data={"username": "wangzhaoyun", "password": "magene123"})
if c != 200 or "token" not in d:
    print(f"登录失败 HTTP {c}: {d}")
    exit(1)
token = d["token"]
print(f"登录: {d['user']['username']} ✅\n")

# ===== 1. 健康检查 =====
print("--- 1. 健康检查 ---")
c, d = api("GET", "/api/health")
check("健康检查", c == 200, f"HTTP {c}")

# ===== 2. Dashboard =====
print("\n--- 2. Dashboard ---")
c, d = api("GET", "/api/dashboard/stats", token)
check("Dashboard统计", c == 200, f"HTTP {c}")

# ===== 3. 版本列表 + CRUD =====
print("\n--- 3. 版本列表 + CRUD ---")
c, d = api("GET", "/api/tables", token)
check("版本列表", c == 200, f"HTTP {c}")

unique = uuid.uuid4().hex[:8]
c, d = api("POST", f"/api/projects/{PID}/versions", token, data={"versionName": f"回归测试-{unique}"})
check("创建版本", c == 201, f"HTTP {c}")
test_ver_id = d.get("id", "") if c == 201 else ""

if test_ver_id:
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    check("空版本 GET records", c == 200, f"count={len(recs)}")

# ===== 4. Sync-table + 模糊匹配 =====
print("\n--- 4. Sync-table + 模糊匹配 ---")
r1 = r2 = r3 = None
if test_ver_id:
    # 标准字段
    r1 = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id, "tableName": f"回归测试-{unique}",
        "records": [{"recordId": r1, "fields": {
            "KW": "REG_001", "CN（中文）": "标准", "EN（英文）": "Standard", "FR（法）": "Standard FR"
        }}]
    })
    check("标准字段 sync-table", c == 200, f"HTTP {c}")

    # 模糊字段
    r2 = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id, "tableName": f"回归测试-{unique}",
        "records": [{"recordId": r2, "fields": {
            "kw": "REG_002", "中文": "模糊", "页面": "设置页", "负责人": "张三",
            "英文": "Fuzzy", "法语": "Flou", "德语": "Verschwommen"
        }}]
    })
    check("模糊字段 sync-table", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    rec = next((r for r in recs if r.get("recordId") == r2), None)
    check("模糊字段 KW(kw)", rec is not None and rec.get("fields", {}).get("KW") == "REG_002",
          f"KW={rec.get('fields', {}).get('KW') if rec else 'NOT FOUND'}")
    check("模糊字段 中文(中文)", rec is not None and rec.get("fields", {}).get("CN（中文）") == "模糊",
          f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")
    check("模糊字段 页面(页面)", rec is not None and rec.get("fields", {}).get("所在页面") == "设置页",
          f"页面={rec.get('fields', {}).get('所在页面') if rec else 'NOT FOUND'}")
    check("模糊字段 EN(英文)", rec is not None and rec.get("fields", {}).get("EN（英文）") == "Fuzzy",
          f"EN={rec.get('fields', {}).get('EN（英文）') if rec else 'NOT FOUND'}")
    check("模糊字段 FR(法语)", rec is not None and rec.get("fields", {}).get("FR（法）") == "Flou",
          f"FR={rec.get('fields', {}).get('FR（法）') if rec else 'NOT FOUND'}")
    check("模糊字段 DE(德语)", rec is not None and rec.get("fields", {}).get("DE（德）") == "Verschwommen",
          f"DE={rec.get('fields', {}).get('DE（德）') if rec else 'NOT FOUND'}")

    # Legacy 变体
    r3 = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id, "tableName": f"回归测试-{unique}",
        "records": [{"recordId": r3, "fields": {
            "Key": "REG_003", "Source": "变体", "context": "详情页",
            "EN": "Variant", "FR": "Variante", "JP": "バリアント"
        }}]
    })
    check("变体字段 sync-table", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    rec = next((r for r in recs if r.get("recordId") == r3), None)
    check("变体字段 KW(Key)", rec is not None and rec.get("fields", {}).get("KW") == "REG_003",
          f"KW={rec.get('fields', {}).get('KW') if rec else 'NOT FOUND'}")
    check("变体字段 中文(Source)", rec is not None and rec.get("fields", {}).get("CN（中文）") == "变体",
          f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")
    check("变体字段 页面(context)", rec is not None and rec.get("fields", {}).get("所在页面") == "详情页",
          f"页面={rec.get('fields', {}).get('所在页面') if rec else 'NOT FOUND'}")
    check("变体字段 EN(EN)", rec is not None and rec.get("fields", {}).get("EN（英文）") == "Variant",
          f"EN={rec.get('fields', {}).get('EN（英文）') if rec else 'NOT FOUND'}")
    check("变体字段 FR(FR)", rec is not None and rec.get("fields", {}).get("FR（法）") == "Variante",
          f"FR={rec.get('fields', {}).get('FR（法）') if rec else 'NOT FOUND'}")
    check("变体字段 JP(JP)", rec is not None and rec.get("fields", {}).get("JP（日）") == "バリアント",
          f"JP={rec.get('fields', {}).get('JP（日）') if rec else 'NOT FOUND'}")

    # Upsert
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id, "tableName": f"回归测试-{unique}",
        "records": [{"recordId": r1, "fields": {"KW": "REG_001", "CN（中文）": "已更新", "EN（英文）": "Updated"}}]
    })
    check("Upsert sync-table", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    rec = next((r for r in recs if r.get("recordId") == r1), None)
    check("Upsert 中文已更新", rec is not None and rec.get("fields", {}).get("CN（中文）") == "已更新",
          f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")

    # 安全守卫
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id, "tableName": f"回归测试-{unique}", "records": []
    })
    check("空数组安全拦截", c in (400, 500), f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    check("数据未被清空", c == 200 and len(recs) > 0, f"count={len(recs)}")

# ===== 5. 词条锁定 =====
print("\n--- 5. 词条锁定 ---")
if test_ver_id and r1:
    c, d = api("PUT", f"/api/terms/{r1}/lock", token, data={"locked": True})
    check("锁定词条", c == 200, f"HTTP {c}")
    c, d = api("PUT", f"/api/terms/{r1}/lock", token, data={"locked": False})
    check("解锁词条", c == 200, f"HTTP {c}")

# ===== 6. Clean-empty 端点 =====
print("\n--- 6. Clean-empty 端点 ---")
if test_ver_id:
    empty_rid = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id, "tableName": f"回归测试-{unique}",
        "records": [{"recordId": empty_rid, "fields": {"KW": "", "CN（中文）": ""}}]
    })
    check("添加空词条", c == 200, f"HTTP {c}")

    c, d = api("DELETE", f"/api/tables/{test_ver_id}/clean-empty", token)
    check("清理空词条", c == 200, f"HTTP {c} {d.get('error', '')[:60] if isinstance(d, dict) else ''}")

    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    check("空词条已清除", c == 200 and all(r.get("recordId") != empty_rid for r in recs), f"count={len(recs)}")

# ===== 7. 语种列表 =====
print("\n--- 7. 语种列表 ---")
c, d = api("GET", f"/api/projects/{PID}/languages", token)
check("语种列表", c == 200, f"count={len(d) if isinstance(d, list) else 'N/A'}")

# ===== 8. 词汇库 =====
print("\n--- 8. 词汇库 ---")
c, d = api("GET", f"/api/projects/{PID}/glossary-tables", token)
check("词汇库表列表", c == 200, f"HTTP {c}")
if c == 200 and isinstance(d, list) and len(d) > 0:
    gtable_id = d[0].get("id", d[0].get("table_id", ""))
    if gtable_id:
        c2, d2 = api("GET", f"/api/glossary-tables/{gtable_id}/terms", token)
        check("词汇库词条列表", c2 == 200, f"HTTP {c2}")
    else:
        check("词汇库词条列表", False, "无 table_id")
else:
    check("词汇库词条列表", False, f"HTTP {c}")

# ===== 9. 日志 =====
print("\n--- 9. 日志 ---")
c, d = api("GET", "/api/logs?page=1&pageSize=5", token)
check("操作日志", c == 200, f"HTTP {c}")

# ===== 10. 回收站 =====
print("\n--- 10. 回收站 ---")
c, d = api("GET", f"/api/projects/{PID}/recycle-bin", token)
check("回收站列表", c == 200, f"HTTP {c}")

rb_name = f"回收站测试-{uuid.uuid4().hex[:8]}"
c, d = api("POST", f"/api/projects/{PID}/versions", token, data={"versionName": rb_name})
check("创建回收站版本", c == 201, f"HTTP {c}")
if c == 201:
    rb_id = d["id"]
    c, d = api("DELETE", f"/api/projects/{PID}/versions/{rb_id}", token)
    check("删除版本(进回收站)", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/projects/{PID}/recycle-bin", token)
    found = any(item.get("entity_name") == rb_name for item in (d if isinstance(d, list) else []))
    check("版本已进入回收站", c == 200 and found, f"found={found}")

# ===== 11. 调试状态 + 项目角色 =====
print("\n--- 11. 调试状态 + 项目角色 ---")
c, d = api("GET", "/api/debug-status", token)
check("调试状态", c == 200, f"HTTP {c}")
c, d = api("GET", f"/api/projects/{PID}/role", token)
check("项目角色", c == 200, f"HTTP {c}")

# ===== 12. 认证 =====
print("\n--- 12. 认证 ---")
c, d = api("POST", "/api/auth/login", data={"username": "wangzhaoyun", "password": "wrong"})
check("错误密码拒绝", c == 401, f"HTTP {c}")
c, d = api("GET", "/api/dashboard/stats")
check("无Token拒绝", c == 401, f"HTTP {c}")
c, d = api("GET", "/api/dashboard/stats", "invalid_token")
check("无效Token拒绝", c == 401, f"HTTP {c}")

# ===== 13. 用户管理 + RBAC =====
print("\n--- 13. 用户管理 + RBAC ---")
c, d = api("GET", "/api/admin/users", token)
check("用户列表", c == 200, f"count={len(d) if isinstance(d, list) else 'N/A'}")

test_user = f"testuser_{unique}"
c, d = api("POST", "/api/admin/users", token, data={
    "username": test_user, "password": "test123", "name": "测试用户", "role": "user"
})
check("创建测试用户", c == 201, f"HTTP {c}")
if c == 201:
    new_uid = d.get("user", {}).get("id", d.get("id", ""))
    c, d = api("POST", "/api/auth/login", data={"username": test_user, "password": "test123"})
    check("新用户登录", c == 200, f"HTTP {c}")
    if c == 200:
        non_admin_token = d.get("token", "")
        c, d = api("GET", "/api/admin/users", non_admin_token)
        check("非管理员禁访用户列表", c == 403, f"HTTP {c}")
        c, d = api("POST", "/api/admin/users", non_admin_token, data={
            "username": "hack", "password": "x", "name": "hack", "role": "user"
        })
        check("非管理员禁创建用户", c == 403, f"HTTP {c}")
    if new_uid:
        c, d = api("DELETE", f"/api/admin/users/{new_uid}", token)
        check("删除测试用户", c == 200, f"HTTP {c}")

# ===== 14. AI 翻译 (v2.x 两级拦截漏斗) =====
print("\n--- 14. AI 翻译 (v2.x 两级拦截漏斗) ---")
target_langs = "英文,法语,德语,日语,韩语,俄语,意大利语,葡萄牙语,波兰语,繁体,丹麦语,捷克语,瑞典,挪威,荷兰"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT cn_term, en_term FROM glossary_terms WHERE cn_term IS NOT NULL AND cn_term != '' AND cn_term != 'No Text' AND en_term IS NOT NULL AND en_term != '' LIMIT 1")
row = cur.fetchone()
conn.close()

if row:
    test_cn, test_en = row
    print(f"  词汇库词条: '{test_cn}' -> EN='{test_en}'")
    c, d = api("POST", f"/api/projects/{PID}/ai-translate", token, data={
        "inputs": {"KW": "", "context": "", "text": test_cn, "target_languages": target_langs}
    })
    check("TM Bypass HTTP 200", c == 200, f"HTTP {c}")
    check("TM Bypass _source='tm'", c == 200 and d.get("_source") == "tm", f"_source={d.get('_source', '')}")
    check("TM Bypass EN匹配", c == 200 and d.get("英文") == test_en, f"EN={d.get('英文', '')[:30]}")
    if c == 200 and d.get("_source") == "tm":
        lang_count = sum(1 for k, v in d.items() if k != "_source" and v)
        check("TM Bypass 多语种", lang_count >= 2, f"non_empty={lang_count}")

print("  [Dify API 调用中...]")
c, d = api("POST", f"/api/projects/{PID}/ai-translate", token, data={
    "inputs": {"KW": "", "context": "", "text": "公路骑行是一项流行的运动", "target_languages": target_langs}
})
check("Prompt Injection HTTP 200", c == 200, f"HTTP {c} {d.get('error', '')[:60] if isinstance(d, dict) else ''}")
check("Prompt Injection 非 TM", c == 200 and d.get("_source") != "tm", f"_source={d.get('_source', 'none')}")

c, d = api("POST", f"/api/projects/{PID}/ai-translate", token, data={
    "inputs": {"KW": "", "context": "", "text": "这是一段普通文本无专业词汇", "target_languages": target_langs}
})
check("无匹配 HTTP 200", c == 200, f"HTTP {c} {d.get('error', '')[:60] if isinstance(d, dict) else ''}")
check("无匹配 非 TM", c == 200 and d.get("_source") != "tm", f"_source={d.get('_source', 'none')}")

c, d = api("POST", f"/api/projects/{PID}/ai-translate", token, data={})
check("缺 inputs 400", c == 400, f"HTTP {c}")
c, d = api("POST", f"/api/projects/{PID}/ai-translate", token, data={"inputs": {"text": ""}})
check("空 text 400", c == 400, f"HTTP {c}")

# ===== 15. 批量同步端点 (/api/tables/:tableId/sync) =====
print("\n--- 15. 批量同步端点 (sync) ---")
if test_ver_id:
    sync_rid = str(uuid.uuid4())
    c, d = api("POST", f"/api/tables/{test_ver_id}/sync", token, data={
        "added": [{"recordId": sync_rid, "fields": {"KW": "SYNC_TEST", "CN（中文）": "同步测试"}}],
        "updated": [], "deletedIds": []
    })
    check("sync 新增", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    check("sync 验证", c == 200 and any(r.get("recordId") == sync_rid for r in recs), f"found={any(r.get('recordId') == sync_rid for r in recs)}")

    c, d = api("POST", f"/api/tables/{test_ver_id}/sync", token, data={
        "added": [], "updated": [{"recordId": sync_rid, "fields": {"KW": "SYNC_TEST", "CN（中文）": "已同步更新"}}],
        "deletedIds": []
    })
    check("sync 更新", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    rec = next((r for r in recs if r.get("recordId") == sync_rid), None)
    check("sync 更新验证", rec is not None and rec.get("fields", {}).get("CN（中文）") == "已同步更新",
          f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'N/A'}")

    c, d = api("POST", f"/api/tables/{test_ver_id}/sync", token, data={
        "added": [], "updated": [], "deletedIds": [sync_rid]
    })
    check("sync 删除", c == 200, f"HTTP {c}")
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    recs = get_records(d)
    check("sync 删除验证", c == 200 and all(r.get("recordId") != sync_rid for r in recs), f"deleted={all(r.get('recordId') != sync_rid for r in recs)}")

# ===== 16. Dify 配置 =====
print("\n--- 16. Dify 配置 ---")
c, d = api("GET", f"/api/projects/{PID}/dify", token)
check("Dify 配置读取", c == 200, f"HTTP {c}")

# ===== 17. KW 生成 =====
print("\n--- 17. KW 生成 ---")
c, d = api("POST", f"/api/projects/{PID}/generate-kw", token, data={"text": "公路骑行测试"})
check("KW 生成", c == 200, f"HTTP {c}")

# ===== 清理 =====
print("\n--- 清理 ---")
if test_ver_id:
    api("DELETE", f"/api/projects/{PID}/versions/{test_ver_id}", token)
    print(f"  删除测试版本: {test_ver_id}")
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("DELETE FROM terms WHERE kw LIKE 'REG_%' OR kw LIKE 'SYNC_%' OR kw LIKE '__EMPTY_KW_%'")
print(f"  清理测试词条: {cur.rowcount} 条")
conn.commit()
conn.close()

# ===== 汇总 =====
print("\n" + "=" * 70)
passed = results.count("✅")
failed = results.count("❌")
total = len(results)
print(f"全量 API 集成测试: {passed}/{total} 通过, {failed} 失败")
if failed == 0:
    print("✅ 全部通过！")
else:
    print(f"❌ {failed} 项失败")
print("=" * 70)
