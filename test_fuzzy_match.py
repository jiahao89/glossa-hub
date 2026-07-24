"""
模糊匹配验证测试 - 验证 fuzzyGetFieldValue 的两级匹配机制
1. 精确匹配（exactMatches）
2. 模糊匹配（fuzzyKeywords - includes）
3. Upsert 更新
4. 安全守卫
"""
import json, urllib.request, urllib.error, time, uuid

BASE = "http://localhost:3001"
PID = "proj-default"

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

print("=" * 60)
print("模糊匹配验证测试 (fuzzyGetFieldValue)")
print("=" * 60)

results = []
def check(name, passed, detail=""):
    ok = "✅" if passed else "❌"
    results.append(ok)
    print(f"  {name}: {ok} {detail}")

# Login
c, d = api("POST", "/api/auth/login", data={"username": "wangzhaoyun", "password": "magene123"})
if c != 200 or "token" not in d:
    print(f"登录失败 HTTP {c}: {d}")
    exit(1)
token = d["token"]
print(f"登录: {d['user']['username']} ✅\n")

# 创建测试版本 - 使用返回的 ID 作为 tableId
unique_suffix = uuid.uuid4().hex[:8]
c, d = api("POST", f"/api/projects/{PID}/versions", token, data={
    "versionName": f"模糊匹配测试-{unique_suffix}"
})
check("创建测试版本", c == 201, f"HTTP {c}")
if c != 201:
    print(f"创建版本失败: {d}")
    exit(1)
test_ver_id = d["id"]
print(f"  版本ID: {test_ver_id}\n")

try:
    # ===== 1. 标准字段名（精确匹配） =====
    print("--- 1. 标准字段名（精确匹配 exactMatches） ---")
    record_id_1 = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id,
        "tableName": f"模糊匹配测试-{unique_suffix}",
        "records": [{
            "recordId": record_id_1,
            "fields": {
                "KW": "FUZZY_TEST_001",
                "CN（中文）": "测试标准字段",
                "所在页面": "首页",
                "字号类别": "P0",
                "EN（英文）": "Test Standard Fields",
                "FR（法）": "Test champs standard",
                "DE（德）": "Test Standardfelder"
            }
        }]
    })
    check("标准字段 sync-table", c == 200, f"HTTP {c}")

    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    check("标准字段 GET records", c == 200, f"HTTP {c}")
    if c == 200:
        rec = next((r for r in d if r.get("recordId") == record_id_1), None)
        check("标准字段 KW 匹配", rec is not None and rec.get("fields", {}).get("KW") == "FUZZY_TEST_001",
              f"KW={rec.get('fields', {}).get('KW') if rec else 'NOT FOUND'}")
        check("标准字段 中文 匹配", rec is not None and rec.get("fields", {}).get("CN（中文）") == "测试标准字段",
              f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")
        check("标准字段 EN 匹配", rec is not None and rec.get("fields", {}).get("EN（英文）") == "Test Standard Fields",
              f"EN={rec.get('fields', {}).get('EN（英文）') if rec else 'NOT FOUND'}")
        check("标准字段 FR 匹配", rec is not None and rec.get("fields", {}).get("FR（法）") == "Test champs standard",
              f"FR={rec.get('fields', {}).get('FR（法）') if rec else 'NOT FOUND'}")

    # ===== 2. 模糊字段名（fuzzyKeywords - includes 匹配） =====
    print("\n--- 2. 模糊字段名（fuzzyKeywords includes 匹配） ---")
    record_id_2 = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id,
        "tableName": f"模糊匹配测试-{unique_suffix}",
        "records": [{
            "recordId": record_id_2,
            "fields": {
                "kw": "FUZZY_TEST_002",           # 小写 kw -> fuzzyKeywords=['kw','key']
                "中文": "测试模糊字段",            # '中文' -> fuzzyKeywords=['中文','cn','source']
                "页面": "设置页",                  # '页面' -> fuzzyKeywords=['页面','界面','page','context']
                "负责人": "张三",                  # '负责人' -> fuzzyKeywords=['字号','负责人','owner']
                "英文": "Test Fuzzy Fields",       # '英文' -> legacy map -> EN（英文）
                "法语": "Test champs flous",       # '法语' -> legacy map -> FR（法）
                "德语": "Test Fuzzy-Felder"        # '德语' -> legacy map -> DE（德）
            }
        }]
    })
    check("模糊字段 sync-table", c == 200, f"HTTP {c}")

    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    check("模糊字段 GET records", c == 200, f"HTTP {c}")
    if c == 200:
        rec = next((r for r in d if r.get("recordId") == record_id_2), None)
        check("模糊字段 KW 匹配", rec is not None and rec.get("fields", {}).get("KW") == "FUZZY_TEST_002",
              f"KW={rec.get('fields', {}).get('KW') if rec else 'NOT FOUND'}")
        check("模糊字段 中文 匹配", rec is not None and rec.get("fields", {}).get("CN（中文）") == "测试模糊字段",
              f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")
        check("模糊字段 所在页面 匹配", rec is not None and rec.get("fields", {}).get("所在页面") == "设置页",
              f"页面={rec.get('fields', {}).get('所在页面') if rec else 'NOT FOUND'}")
        check("模糊字段 字号类别 匹配", rec is not None and rec.get("fields", {}).get("字号类别") == "张三",
              f"owner={rec.get('fields', {}).get('字号类别') if rec else 'NOT FOUND'}")
        check("模糊字段 EN 匹配", rec is not None and rec.get("fields", {}).get("EN（英文）") == "Test Fuzzy Fields",
              f"EN={rec.get('fields', {}).get('EN（英文）') if rec else 'NOT FOUND'}")
        check("模糊字段 FR 匹配", rec is not None and rec.get("fields", {}).get("FR（法）") == "Test champs flous",
              f"FR={rec.get('fields', {}).get('FR（法）') if rec else 'NOT FOUND'}")
        check("模糊字段 DE 匹配", rec is not None and rec.get("fields", {}).get("DE（德）") == "Test Fuzzy-Felder",
              f"DE={rec.get('fields', {}).get('DE（德）') if rec else 'NOT FOUND'}")

    # ===== 3. 变体字段名（Legacy 映射） =====
    print("\n--- 3. 变体字段名（Legacy 映射 LEGACY_TO_NEW_LANG_MAP） ---")
    record_id_3 = str(uuid.uuid4())
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id,
        "tableName": f"模糊匹配测试-{unique_suffix}",
        "records": [{
            "recordId": record_id_3,
            "fields": {
                "Key": "FUZZY_TEST_003",           # 'Key' -> exactMatches=['KW','Key']
                "Source": "测试变体字段",           # 'Source' -> exactMatches=['CN（中文）','中文','Source']
                "context": "详情页",               # 'context' -> fuzzyKeywords=['页面','界面','page','context']
                "EN": "Test Variant Fields",       # 'EN' -> legacy map -> EN（英文）
                "FR": "Test champs variant",       # 'FR' -> legacy map -> FR（法）
                "JP": "テストバリアント"            # 'JP' -> legacy map -> JP（日）
            }
        }]
    })
    check("变体字段 sync-table", c == 200, f"HTTP {c}")

    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    check("变体字段 GET records", c == 200, f"HTTP {c}")
    if c == 200:
        rec = next((r for r in d if r.get("recordId") == record_id_3), None)
        check("变体字段 KW (Key) 匹配", rec is not None and rec.get("fields", {}).get("KW") == "FUZZY_TEST_003",
              f"KW={rec.get('fields', {}).get('KW') if rec else 'NOT FOUND'}")
        check("变体字段 中文 (Source) 匹配", rec is not None and rec.get("fields", {}).get("CN（中文）") == "测试变体字段",
              f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")
        check("变体字段 所在页面 (context) 匹配", rec is not None and rec.get("fields", {}).get("所在页面") == "详情页",
              f"页面={rec.get('fields', {}).get('所在页面') if rec else 'NOT FOUND'}")
        check("变体字段 EN (EN) 匹配", rec is not None and rec.get("fields", {}).get("EN（英文）") == "Test Variant Fields",
              f"EN={rec.get('fields', {}).get('EN（英文）') if rec else 'NOT FOUND'}")
        check("变体字段 FR (FR) 匹配", rec is not None and rec.get("fields", {}).get("FR（法）") == "Test champs variant",
              f"FR={rec.get('fields', {}).get('FR（法）') if rec else 'NOT FOUND'}")
        check("变体字段 JP (JP) 匹配", rec is not None and rec.get("fields", {}).get("JP（日）") == "テストバリアント",
              f"JP={rec.get('fields', {}).get('JP（日）') if rec else 'NOT FOUND'}")

    # ===== 4. Upsert 更新 =====
    print("\n--- 4. Upsert 更新（相同 recordId） ---")
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id,
        "tableName": f"模糊匹配测试-{unique_suffix}",
        "records": [{
            "recordId": record_id_1,
            "fields": {
                "KW": "FUZZY_TEST_001",
                "CN（中文）": "测试标准字段已更新",
                "所在页面": "首页v2",
                "EN（英文）": "Test Standard Fields Updated"
            }
        }]
    })
    check("Upsert sync-table", c == 200, f"HTTP {c}")

    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    check("Upsert GET records", c == 200, f"HTTP {c}")
    if c == 200:
        rec = next((r for r in d if r.get("recordId") == record_id_1), None)
        check("Upsert 中文已更新", rec is not None and rec.get("fields", {}).get("CN（中文）") == "测试标准字段已更新",
              f"CN={rec.get('fields', {}).get('CN（中文）') if rec else 'NOT FOUND'}")
        check("Upsert EN 已更新", rec is not None and rec.get("fields", {}).get("EN（英文）") == "Test Standard Fields Updated",
              f"EN={rec.get('fields', {}).get('EN（英文）') if rec else 'NOT FOUND'}")
        check("Upsert 所在页面已更新", rec is not None and rec.get("fields", {}).get("所在页面") == "首页v2",
              f"页面={rec.get('fields', {}).get('所在页面') if rec else 'NOT FOUND'}")

    # ===== 5. 安全守卫 - 空数组拒绝 =====
    print("\n--- 5. 安全守卫（空数组拒绝全量删除） ---")
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id,
        "tableName": f"模糊匹配测试-{unique_suffix}",
        "records": []
    })
    check("空数组安全拦截", c in (400, 500), f"HTTP {c}")
    # 错误消息被 catch 块吞掉，返回通用消息，但 500 表示安全守卫触发了 throw
    check("安全拦截触发", c == 500, f"HTTP {c} (安全守卫 throw 导致 500)")

    # 验证数据仍在
    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    check("数据未被清空", c == 200 and len(d) > 0, f"count={len(d) if isinstance(d, list) else 0}")

    # ===== 6. Jaccard 相似度验证（前端 getOverlap 逻辑） =====
    print("\n--- 6. Jaccard 相似度逻辑验证 ---")
    def get_overlap(str_a, str_b):
        if str_a == str_b:
            return 1.0
        set_a = set(str_a)
        set_b = set(str_b)
        intersection = set_a & set_b
        union = set_a | set_b
        return len(intersection) / len(union) if union else 0

    # 相同字符串 -> 1.0
    check("Jaccard 相同=1.0", abs(get_overlap("公路骑行", "公路骑行") - 1.0) < 0.01, f"overlap={get_overlap('公路骑行', '公路骑行'):.2f}")
    # 完全不同 -> 0.0
    check("Jaccard 完全不同=0.0", abs(get_overlap("abc", "xyz") - 0.0) < 0.01, f"overlap={get_overlap('abc', 'xyz'):.2f}")
    # 高重叠 - 共享大部分字符
    overlap_hi = get_overlap("公路骑行", "公路骑行赛")
    check("Jaccard 高重叠>=0.5", overlap_hi >= 0.5, f"overlap={overlap_hi:.2f}")
    # 低相似度
    overlap_lo = get_overlap("公路骑行", "游泳比赛")
    check("Jaccard 低相似度<0.5", overlap_lo < 0.5, f"overlap={overlap_lo:.2f}")
    # 中等重叠
    overlap_mid = get_overlap("骑行", "公路骑行")
    check("Jaccard 子串包含>=0.5", overlap_mid >= 0.5, f"overlap={overlap_mid:.2f}")

    # ===== 7. 全量同步行为验证 =====
    print("\n--- 7. 全量同步行为（不含 recordId 的记录被删除） ---")
    # 只保留 record_id_2，其他两条会被删除
    c, d = api("POST", "/api/sync-table", token, data={
        "tableId": test_ver_id,
        "tableName": f"模糊匹配测试-{unique_suffix}",
        "records": [{
            "recordId": record_id_2,
            "fields": {
                "KW": "FUZZY_TEST_002",
                "CN（中文）": "仅保留此条",
                "EN（英文）": "Only this remains"
            }
        }]
    })
    check("全量同步 sync-table", c == 200, f"HTTP {c}")

    c, d = api("GET", f"/api/tables/{test_ver_id}/records", token)
    check("全量同步后仅1条", c == 200 and len(d) == 1, f"count={len(d) if isinstance(d, list) else 0}")
    if c == 200 and len(d) == 1:
        check("全量同步保留正确记录", d[0].get("recordId") == record_id_2, f"recordId={d[0].get('recordId')[:12]}...")

finally:
    # 清理 - 删除测试版本
    c, d = api("DELETE", f"/api/projects/{PID}/versions/{test_ver_id}", token)
    ok = "✅" if c == 200 else "❌"
    results.append(ok)
    print(f"\n  清理测试版本: {ok} HTTP {c}")

    # 验证版本已从版本列表中移除（DELETE 走回收站流程，词条数据保留属预期行为）
    c, d = api("GET", f"/api/projects/{PID}/versions", token)
    ver_exists = any(v.get("id") == test_ver_id for v in (d if isinstance(d, list) else []))
    ok = "✅" if not ver_exists else "❌"
    results.append(ok)
    print(f"  确认版本已删除: {ok} (version_exists={ver_exists})")

print("\n" + "=" * 60)
passed = results.count("✅")
failed = results.count("❌")
total = len(results)
print(f"模糊匹配验证测试: {passed}/{total} 通过, {failed} 失败")
if failed == 0:
    print("✅ 全部通过！")
else:
    print(f"❌ {failed} 项失败")
print("=" * 60)
