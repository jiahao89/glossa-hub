# GlossaHub UI/UX 体检报告

> 基于 **UI/UX Pro Max** 技能 (`ui-ux-pro-max-skill`) 对当前 v1.1 代码的全栈审计。
> 日期: 2026-08-03 · 范围: 前端 React UI · 不涉及后端

---

## 0. TL;DR

| 维度 | 评分 | 一句话 |
|------|------|--------|
| 可访问性 (A11y) | **B-** | 多数已做,有 3 处高危:输入框无焦点环、emoji 用作图标、缺键盘交互 |
| 设计一致性 | **B** | CSS 变量做得好,但表格状态色/锁定色硬编码、与品牌脱节 |
| 性能 / 渲染 | **A-** | `memo`、lazy、`requestRef` 都到位,但缺 `useCallback` 包裹回调 |
| 反馈系统 | **A** | Toast + Skeleton + EmptyState 三件套齐全 |
| 字体 / 排版 | **B-** | Outfit + JetBrains Mono 与 ui-ux-pro-max 推荐"仪表盘"差距大 |
| 暗色 / 主题 | **B+** | 变量设计正确,亮色 accent 用蓝(2593eb),与暗色 cyan 撕裂感强 |
| 表单 / 输入 | **C+** | 输入框 `outline: none` 隐藏焦点环 → A11y 严重违规 |

**推荐优化顺序**(纯样式、低风险、可独立验证):

1. **P0** 修复输入框焦点环 → WCAG 2.4.7
2. **P0** 锁定按钮改为可识别语义色 + aria 状态
3. **P1** 表格状态徽章统一化(待审核/已审核/已驳回/已发布/锁定)抽成组件
4. **P1** 全文替换唯一 emoji 图标(🚀 → SVG)
5. **P2** 引入 Fira Sans/Code 作为仪表盘字体,保留 Outfit 作为品牌字
6. **P2** 优化可读性:正文 ≥ 14px,强调文本 ≥ 16px
7. **P3** 添加 `prefers-reduced-motion` 媒体查询
8. **P3** 亮色模式 accent 与暗色统一(都用 emerald 或都用 blue,目前混)

---

## 1. 设计系统基线(由 ui-ux-pro-max 生成)

### 风格:Dark Mode (OLED) + Financial Dashboard 配色

| Token | 当前值 | 推荐值 | 差距 |
|-------|--------|--------|------|
| Background | `#0e0e10` | `#020617` (更深) | 当前略偏紫,推荐纯黑偏蓝 |
| Secondary | `#16161a` | `#1E293B` (slate) | 当前近黑,层级不够分明 |
| Accent (dark) | `#00f2ff` (cyan) | `#22C55E` (emerald) | 当前更"赛博朋克",推荐更"商业感" |
| Accent (light) | `#2563eb` (royal blue) | `#0369A1` (sky-700) | 当前略偏紫 |
| Text primary | `#f8fafc` | `#F8FAFC` | ✅ 完美 |
| Text secondary | `#94a3b8` | `#94A3B8` | ✅ 完美 |
| Border | `#2a2a32` | `#334155` (slate-700) | 当前略偏紫,推荐 slate |

### 字体(仪表盘场景)

**当前**:Outfit + JetBrains Mono
**推荐**:Fira Sans + Fira Code

理由:Outfit 太"营销",JetBrains Mono 笔画太重用于表格 KW 列会导致密度过高。Fira 系列在数据表格里更克制、更易扫读,且与 Tailwind/HeroUI 生态搭配成熟。

---

## 2. P0 高优先级(必须修)

### P0-1. 输入框焦点环被全局隐藏 ❌

**位置**:`src/index.css:143, 398, 730`

```css
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: none;   /* ← 违反 WCAG 2.4.7 */
}
```

`.select-input, .text-input` 和 `.form-group input` 也都有 `outline: none`。

**问题**:键盘用户(屏幕阅读器、Tab 导航)看不到当前焦点在哪。

**修复**:
```css
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}
```
与现有"`:focus` 时边框变 accent + box-shadow"叠加,提供视觉与无障碍双重反馈。

**风险**:极低 · 仅 3 行 CSS · 立刻生效。

### P0-2. 锁定/解锁图标当前是装饰图标,缺少 aria 状态

**位置**:`src/components/translation/TranslationRow.jsx:46-68`

```jsx
<Lock size={12} onClick={...} title="点击解锁此行" />
<Unlock size={12} onClick={...} title="点击锁定此行" />
```

**问题**:
- 鼠标用户能看到 `title`,键盘用户读不到当前状态
- 与 P0-1 联动:此按钮还是 `<svg>` 而非 `<button>`,Tab 不可达

**修复**:
```jsx
<button
  className="lock-toggle-btn"
  aria-pressed={isLocked}
  aria-label={isLocked ? `已锁定,点击解锁` : `未锁定,点击锁定`}
  onClick={...}
>
  {isLocked ? <Lock /> : <Unlock />}
</button>
```
配合 `.lock-toggle-btn:focus-visible` 焦点环。

**风险**:低 · 但需联动调整样式(去掉行内 style)。

### P0-3. 唯一 emoji 用作图标

**位置**:`src/components/SettingsTab.jsx:287`
```jsx
<span>🚀 快速切换 Dify 引擎预设</span>
```

**问题**:`ui-ux-pro-max` 规则 #7 明确:"No emojis as icons (use SVG)"。

**修复**:替换为 lucide-react `<Rocket size={14} />`(项目已在用)。

**风险**:零。

---

## 3. P1 中优先级(强烈推荐)

### P1-1. 表格状态徽章统一化

**位置**:`src/components/translation/TranslationRow.jsx:70-92`

当前是 30+ 行内联三元表达式生成 4 种状态徽章(待审核/已审核/已驳回/已发布)。

**修复**:抽到独立组件 `src/components/translation/StatusBadge.jsx`:

```jsx
const STATUS_CONFIG = {
  DRAFT:          { label: '待审核', tone: 'pending' },
  PENDING_REVIEW: { label: '待审核', tone: 'pending' },
  TRANSLATING:    { label: '待审核', tone: 'pending' },
  APPROVED:       { label: '已审核', tone: 'success' },
  REJECTED:       { label: '已驳回', tone: 'danger' },
  PUBLISHED:      { label: '已发布', tone: 'info' },
};
```

样式建议复用现有 `--yellow`/`--green`/`--red`/`--purple` token,加 `.badge` 类。

### P1-2. 表格行悬浮态缺失

**位置**:整个 `.data-table tbody tr` 没有 hover 样式。

**问题**:在大表格里用户无法跟踪鼠标位置对应哪一行。

**修复**:`src/index.css` 新增:
```css
.data-table tbody tr:hover {
  background-color: var(--bg-hover);
  transition: background-color 0.15s ease;
}
.data-table tbody tr[aria-selected="true"] {
  background-color: rgba(var(--accent-rgb), 0.08);
}
```

### P1-3. 进度条 mini 指示器数字与色块重叠

**位置**:`src/components/translation/TranslationRow.jsx:114-126`

颜色 `color` 同时用作色块和文字色,在亮色模式 `--green: #059669` 上对比度足够;但亮色模式 `--red: #dc2626` 在白底 OK;问题在中间色:亮色 `--accent: #2563eb` 与白色背景对比度 4.7:1,**刚好不达标 4.5:1 的"正文"标准**(对 normal text)。建议对进度百分比文字加 `font-weight: 600`。

### P1-4. 翻译进度的 0% 状态用红色

**位置**:`src/components/translation/TranslationRow.jsx:108-112`

```jsx
const color = translatedCount === 0 ? 'var(--red)' : ...;
```

0% 在绝大多数翻译工作流里其实是**正常初始状态**,不是错误。红色会暗示"出错了",误导用户。

**修复**:0% → `--text-muted`(中性);<50% → `--yellow`;50-99% → `--accent`;100% → `--green`。

---

## 4. P2 设计系统打磨

### P2-1. 暗色 accent 与亮色 accent 风格不统一

**当前**:暗 `#00f2ff` (cyan) · 亮 `#2563eb` (royal blue)
**问题**:切换主题时不仅颜色变,**色相**也变了——品牌感丢失。

**推荐**:都用 emerald 系(暗 `#10b981`,亮 `#059669`),保留暖橙作为单一品牌点缀。或两者都用 blue 但亮色用更深的 `#1d4ed8`。

### P2-2. 字号过小

`grep` 结果显示广泛使用 `0.65rem`、`0.68rem`(约 10.4-10.9px)。WCAG 建议正文 ≥ 16px,UI 文本 ≥ 14px。

**修复**:
- 0.65rem / 0.68rem → 0.75rem (12px,仅用于徽章/二级 metadata)
- 0.72rem (footer) → 0.8rem
- 0.78rem (small UI labels) → 0.875rem (14px)

### P2-3. 字体引入 Fira 系列

**当前**:只声明了 Outfit + JetBrains Mono,实际渲染用 -apple-system 兜底
**推荐**:在 `index.html` 引入 Fira Sans + Fira Code,与 Outfit 共存:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

CSS:
```css
:root {
  --font-data: 'Fira Code', ui-monospace, monospace;
  --font-ui:   'Fira Sans', 'Outfit', -apple-system, sans-serif;
}
.data-table .mono { font-family: var(--font-data); }
```

### P2-4. 当前框阴影对亮色模式不够

**位置**:`src/index.css:99-101`

亮色 `--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1)` —— 模态框在白底上几乎是平的。

**修复**:`--shadow-lg: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)`(更柔的 slate 阴影)。

---

## 5. P3 锦上添花

### P3-1. `prefers-reduced-motion` 支持

`grep` 显示无任何动画降级处理。Toast 滑入、sidebar 折叠、骨架屏 shimmer 在前庭敏感人群中会引起不适。

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### P3-2. 表格行键盘可达

表格的"双击编辑"对鼠标很顺,但键盘用户必须 Tab 一路走完每一行 checkbox 才能到编辑按钮,且 row 本身不响应 Enter。修复方案:

```jsx
<tr
  tabIndex={0}
  onKeyDown={(e) => { if (e.key === 'Enter') onEditClick(rec); }}
  aria-label={`编辑词条 ${kw}`}
>
```

### P3-3. 触摸目标过小

`<button>` 在批量选择图标列里是 24×24px(icon-btn 标准),移动端不达标。`ui-ux-pro-max` 建议 min 44×44px。

### P3-4. 选中行高亮用 `rgba(59,130,246,0.05)` 蓝色——不与主题联动

**位置**:`src/components/translation/TranslationRow.jsx:30`

蓝色与暗色 `--accent: #00f2ff` / 亮色 `--accent: #2563eb` 都不一致。

**修复**:`background: rgba(var(--accent-rgb), 0.08)`——CSS 变量已支持。

### P3-5. 空状态文案统一化

**位置**:各 Tab 都有自写的空状态文案。当前已有 `EmptyState` 组件,直接复用:
```jsx
<EmptyState title="..." description="..." action={...} />
```
而不是各 Tab 自己写 `<div>暂无数据</div>`。

---

## 6. 不建议改的(主动跳过)

| 项目 | 原因 |
|------|------|
| 移除 `GlossaModal` 自实现 | 已经做了 focus trap + ESC + aria-labelledby,改用 HeroUI 不划算 |
| 大改 Tailwind v4 主题 | 现有 `@theme` + `@heroui/styles` 链路工作正常 |
| 重做侧边栏 | 64px 折叠/230px 展开 + 当前激活项样式已经合理 |
| 替换 lucide-react 为自定义 SVG | 18 个文件依赖,工作量与收益不匹配 |

---

## 7. 验证清单

每改一项后,跑这些用例确认无回归:

```bash
npm test                    # vitest 76 个测试
npx oxlint src/             # lint
npm run dev                 # 手动点击每个 Tab,确认布局未塌
# 切换暗色/亮色
# 用键盘 Tab 一遍侧边栏 + 表单 + 模态框,验证焦点环
# 用 chrome://inspect 模拟 prefers-reduced-motion
```

---

## 8. 工作量估算

| 阶段 | 改动文件数 | 估时 |
|------|-----------|------|
| P0 全部 | 2 (index.css + TranslationRow.jsx) + SettingsTab.jsx | 30 min |
| P1 全部 | 2 (新 StatusBadge + index.css) | 1 h |
| P2 全部 | 2 (index.css + index.html) | 1 h |
| P3 全部 | 1-2 (index.css + 各组件) | 1 h |

**总计** ~3.5 小时纯样式改动,零行为变更,零后端改动,零新依赖。

---

> 本报告由 `ui-ux-pro-max-skill` 自动产出建议 + 人工审计代码综合而成。
> 实施前请按 P0 → P1 → P2 → P3 顺序执行,每个阶段独立提交以便回滚。