# 浅色模式 UI 审查报告与修复计划

> 审查日期：2025-07-07
> 审查范围：全量组件 CSS 变量 + 内联样式
> 问题总数：17 个（3 Critical / 6 Major / 8 Minor）

## 问题总览

| 严重度 | 数量 | 说明 |
|--------|------|------|
| **Critical** | 3 | 功能性丢失或文字完全不可读 |
| **Major** | 6 | 视觉断裂、阴影过重、颜色不一致 |
| **Minor** | 8 | 硬编码颜色未适配主题，影响一致性 |

---

## Critical 问题（3 个）

### C1: 表格行 hover 完全失效

- **文件**: `src/index.css:567`
- **当前值**: `background-color: rgba(255, 255, 255, 0.04);`
- **问题**: 4% 白色叠在白色背景上完全不可见，用户无法感知鼠标悬停在哪一行
- **修复**:
  ```css
  .data-table tr:hover {
    background-color: var(--bg-hover);
  }
  ```

### C2: 日志 Diff "修改前" 文字不可读

- **文件**: `src/components/LogsTab.jsx:415`
- **当前值**: `color: '#fda4af'`（浅粉色）
- **问题**: 浅粉色文字在近白背景上，对比度仅 1.4:1（WCAG 要求 4.5:1），几乎不可见
- **修复**: 改为 `color: 'var(--red)'`

### C3: GlossaModal simple 变体透明背景

- **文件**: `src/components/GlossaModal.jsx:100-110`
- **当前值**: 无 `backgroundColor` 设置
- **问题**: 暗色遮罩透过透明卡片，深色文字在暗色穿透上完全不可读
- **修复**: 添加 `backgroundColor: 'var(--bg-secondary)'`

---

## Major 问题（6 个）

### M1: 工具栏按钮边框硬编码青色

- **文件**: `src/index.css:362-368`
- **当前值**: `rgba(0,242,255,0.3)` 和 `rgba(0,242,255,0.1)`
- **问题**: 浅色模式 accent 是蓝色 `#2563eb`，但边框仍用暗色模式青色 `#00f2ff`
- **涉及行**: 362, 366, 878-879, 946
- **修复**: 全部替换为 `rgba(var(--accent-rgb), 0.3)` / `rgba(var(--accent-rgb), 0.1)`

### M2: Bento 卡片 hover 阴影过重

- **文件**: `src/index.css:973-974`
- **当前值**: `box-shadow: 0 0 0 1px var(--accent-glow), 0 8px 24px rgba(0, 0, 0, 0.35);`
- **问题**: 35% 黑色阴影在白色背景上极其突兀
- **修复**: 改为 `var(--shadow-lg)`，边框改用 `rgba(var(--accent-rgb), 0.25)`

### M3: 登录页背景始终暗色

- **文件**: `src/index.css:907`
- **当前值**: `background: radial-gradient(circle at center, #1b2030 0%, #0e0e10 100%);`
- **问题**: 浅色模式不切换
- **修复**: 添加 `html.light-mode .login-screen` 浅色渐变规则

### M4: 列筛选下拉框阴影过重

- **文件**: `src/components/TranslationTab.jsx:1846`
- **当前值**: `boxShadow: '0 4px 12px rgba(0,0,0,0.5)'`
- **修复**: 改为 `var(--shadow-lg)`

### M5: "已发布" 徽章硬编码紫色

- **文件**: `src/components/TranslationTab.jsx:2126`
- **当前值**: `backgroundColor: '#8b5cf6'`
- **修复**: 新增 `--purple` / `--purple-bg` CSS 变量并引用

### M6: Toast 阴影过重

- **文件**: `src/components/Toast.jsx:105`
- **当前值**: `boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px var(--border-color)'`
- **修复**: 改为 `var(--shadow-lg), 0 0 0 1px var(--border-color)`

---

## Minor 问题（8 个）

### m1: 翻译进度条硬编码颜色

- **文件**: `src/components/TranslationTab.jsx:2145-2148`
- **当前值**: `#ef4444`, `#f59e0b`, `#3b82f6`, `#10b981`
- **修复**: 改用 `var(--red)`, `var(--yellow)`, `var(--accent)`, `var(--green)`

### m2: AI 翻译图标硬编码紫色

- **文件**: `src/components/TranslationTab.jsx:2188`
- **当前值**: `color: '#a78bfa'`
- **修复**: 改用 `var(--purple)` 或新增变量

### m3: 标签页按钮硬编码白色

- **文件**: `src/components/TranslationTab.jsx:2341, 2348`
- **当前值**: `color: '#fff'`
- **修复**: 改用 `var(--bg-primary)`

### m4: Dashboard AI 卡片图标硬编码颜色

- **文件**: `src/components/DashboardTab.jsx:276, 285, 294`
- **当前值**: `#a78bfa`, `#c084fc`, `#8b5cf6` + 对应 rgba 背景
- **修复**: 改用 CSS 变量

### m5: Dashboard 进度条渐变硬编码

- **文件**: `src/components/DashboardTab.jsx:206, 322-325`
- **当前值**: `#06b6d4`, `#22d3ee`, `#10b981`, `#34d399`, `#ef4444`, `#f87171`, `#f59e0b`, `#fbbf24`
- **修复**: 改用 CSS 变量

### m6: 日志 Diff 面板硬编码 RGBA

- **文件**: `src/components/LogsTab.jsx:411-427`
- **当前值**: 大量 `rgba(239,68,68,...)` 和 `rgba(16,185,129,...)`
- **修复**: 改用 `var(--red-bg)` / `var(--green-bg)` 系列

### m7: ErrorBoundary 回退值为暗色

- **文件**: `src/components/ErrorBoundary.jsx:26-40`
- **当前值**: fallback 值 `#0f1117`, `#e5e7eb`, `#fff`
- **修复**: 回退值不影响正常运行（变量存在时被覆盖），优先级最低

### m8: 标题渐变硬编码白色（未激活）

- **文件**: `src/index.css:193`
- **当前值**: `linear-gradient(135deg, #ffffff 30%, var(--accent) 100%)`
- **问题**: 当前 header 未使用此类（已改用 breadcrumbs），潜在遗留
- **修复**: 低优先级，可选

---

## 修复执行计划

### 第一批：Critical（必须修复）

| # | 文件 | 行号 | 改动 |
|---|------|------|------|
| C1 | index.css | 567 | `rgba(255,255,255,0.04)` → `var(--bg-hover)` |
| C2 | LogsTab.jsx | 415 | `#fda4af` → `var(--red)` |
| C3 | GlossaModal.jsx | 100 | 添加 `backgroundColor: 'var(--bg-secondary)'` |

### 第二批：Major 阴影统一

| # | 文件 | 行号 | 改动 |
|---|------|------|------|
| M2 | index.css | 974 | `rgba(0,0,0,0.35)` → `var(--shadow-lg)` |
| M4 | TranslationTab.jsx | 1846 | `rgba(0,0,0,0.5)` → `var(--shadow-lg)` |
| M6 | Toast.jsx | 105 | `rgba(0,0,0,0.4)` → `var(--shadow-lg)` |

### 第三批：Major 主题一致性

| # | 文件 | 行号 | 改动 |
|---|------|------|------|
| M1 | index.css | 362,366,878,879,946 | `rgba(0,242,255,...)` → `rgba(var(--accent-rgb),...)` |
| M3 | index.css | 907 | 新增 `html.light-mode .login-screen` 规则 |
| M5 | TranslationTab.jsx | 2126 | 新增 `--purple` 变量并引用 |

### 第四批：Minor 收尾

| # | 文件 | 改动 |
|---|------|------|
| m1-m3 | TranslationTab.jsx | 硬编码颜色 → CSS 变量 |
| m4-m5 | DashboardTab.jsx | 硬编码颜色 → CSS 变量 |
| m6 | LogsTab.jsx | 硬编码 RGBA → CSS 变量 |
| m7-m8 | ErrorBoundary / index.css | 可选 |

---

## 验证清单

- [ ] 浅色模式表格行 hover 可见
- [ ] 浅色模式日志 Diff 文字可读
- [ ] 浅色模式 GlossaModal simple 变体有背景色
- [ ] 浅色模式所有阴影为柔和的 `var(--shadow-*)`
- [ ] 浅色模式无硬编码青色边框
- [ ] 浅色模式登录页背景适配
- [ ] E2E 测试 20/20 通过
- [ ] Build 0 errors
