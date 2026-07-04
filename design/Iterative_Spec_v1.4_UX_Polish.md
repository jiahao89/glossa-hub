# GlossaHub UX 打磨规划说明书 (v1.4)

本规划书针对 Iterative_Spec_v1.1 §9 中**工作量较大、需单独迭代**的体验优化而制定，涵盖：暗色模式切换、骨架屏。表格列宽可调降为最低优先级，移动端适配**已移除**（产品定位为桌面端工具）。

---

## 1. 现状评估

| 维度 | 当前状态 | 影响范围 |
|---|---|---|
| 主题 | **暗色硬编码**（`--bg-primary: #0e0e10` 等固定值写在 `:root`）| 全局 |
| Loading | 全局 `<Loader2 className="animate-spin">` spinner，无骨架屏 | 翻译表 / 日志 / 词汇 / Dashboard |
| 表格 | 表头 `<th style={{ width: '100px' }}>` 固定像素，不可拖拽 | 翻译表（低频诉求） |

**关键认知**：当前默认即为暗色主题。因此 §9.1 的实际诉求是**新增"亮色模式"并提供切换**，而非"实现暗色"。

---

## 2. §9.4 骨架屏 (Skeleton) — 优先落地

### 2.1 业务目标
- 替换全局 spinner，减少感知等待时间，避免内容跳动（Layout Shift）。
- 覆盖：翻译表、日志、词汇表、Dashboard 4 个高加载耗时模块。

### 2.2 技术方案

#### A. 通用 Skeleton 组件

```jsx
// Skeleton.jsx
export function Skeleton({ width = '100%', height = 16, radius = 4, count = 1 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-shimmer 1.5s infinite',
    }} />
  ));
}
```

```css
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

#### B. 各模块骨架屏布局

| 模块 | 骨架形状 |
|---|---|
| 翻译表 | 10 行 × N 列的表格骨架（每行 KW 短条 + 中文长条 + 翻译短条）|
| 日志列表 | 8 行列表项骨架（左侧时间戳 + 右侧文本条）|
| 词汇表 | 表格骨架（同翻译表，列更少）|
| Dashboard | 4 个统计卡片骨架（数字大块 + 标签短条）|

### 2.3 任务拆解（4 个）

| # | 任务 | 产出 |
|---|---|---|
| 1 | 新建 `Skeleton.jsx` + shimmer 动画 CSS | 1 个组件 |
| 2 | TranslationTab 的 `loading ?` 分支替换为表格骨架 | 替换 spinner |
| 3 | LogsTab / GlossaryTab / DashboardTab 的 loading 替换 | 替换 spinner |
| 4 | 走查骨架尺寸与真实内容匹配（避免跳动）| 测试报告 |

### 2.4 风险评估
- **预估工作量**：小（Skeleton 组件本身简单，主要工作是逐个替换 loading 分支）。
- **可优先做**：作为本批次第一项落地。

---

## 3. §9.1 亮色 / 暗色模式切换

### 3.1 业务目标
- 提供"亮色 / 暗色 / 跟随系统"三态切换，记忆用户选择。
- 复用现有 CSS 变量体系，不改动任何业务组件的样式硬编码。

### 3.2 技术方案

#### A. CSS 变量分层重构
当前所有变量集中在 `:root`。重构为按主题分组：

```css
/* 默认 = 暗色（向后兼容，不动现有 :root）*/
:root {
  --bg-primary: #0e0e10;
  --text-primary: #f8fafc;
  /* ... 其余保持不变 ... */
}

/* 亮色覆盖层：仅当 html[data-theme="light"] 时生效 */
html[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --bg-hover: #e2e8f0;
  --accent: #0891b2;            /* 降低饱和度以适配亮背景 */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
  --border-focus: #cbd5e1;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  /* status 色保持，但 -bg 透明度调高 */
  --green-bg: rgba(16, 185, 129, 0.18);
  --yellow-bg: rgba(245, 158, 11, 0.18);
  --red-bg: rgba(239, 68, 68, 0.18);
}
```

**优势**：组件代码零改动（它们都引用 `var(--xxx)`），只需在 `html` 标签切换 `data-theme` 属性。

#### B. 主题 Context + 持久化

```jsx
// ThemeContext.jsx
const THEME_KEY = 'glossahub-theme';

function applyTheme(theme) {
  // 'auto' 时读取系统 prefers-color-scheme
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

// 初始化（在 main.jsx 中调用一次）
const saved = localStorage.getItem(THEME_KEY) || 'dark'; // 默认暗色保持现状
applyTheme(saved);
```

#### C. 切换入口
在顶部 Header 右侧加一个三态切换器（Sun / Moon / Monitor 图标），下拉选择。

### 3.3 任务拆解（4 个）

| # | 任务 | 产出 |
|---|---|---|
| 1 | 在 index.css 新增 `html[data-theme="light"]` 覆盖块 + 调试全组件视觉 | 1 个 CSS diff |
| 2 | 新建 `ThemeContext.jsx` + `useTheme` hook + 初始化逻辑 | 1 个新文件 |
| 3 | 在 App.jsx Header 加主题切换器（3 图标下拉） | 1 个组件 |
| 4 | 全量回归测试两套主题下的表格/弹窗/Toast/EmptyState 视觉 | 测试报告 |

### 3.4 风险评估
- **硬编码颜色**：部分组件内联 style 用了字面色（如 `color: '#ef4444'`、`backgroundColor: '#fff'` 在 Toast 中）。需全局 grep 排查并替换为 CSS 变量，否则亮色下会"穿帮"。
- **预估工作量**：中（CSS 变量映射 + 排查硬编码色是主要工作）。

---

## 4. §9.6 表格列宽可调（最低优先级）

### 4.1 业务目标
- 翻译表格表头支持拖拽调整列宽。
- 用户调整后的列宽持久化到 localStorage，下次进入恢复。

### 4.2 技术方案

#### A. 列宽状态管理

```jsx
const [columnWidths, setColumnWidths] = useState(() => {
  const saved = localStorage.getItem('glossahub-col-widths');
  return saved ? JSON.parse(saved) : {}; // { KW: 120, 'CN（中文）': 200, ... }
});

useEffect(() => {
  localStorage.setItem('glossahub-col-widths', JSON.stringify(columnWidths));
}, [columnWidths]);
```

#### B. 拖拽手柄

在 `<th>` 右边缘加一个 4px 拖拽区：

```jsx
<th style={{ width: columnWidths['KW'] || 120, position: 'relative' }}>
  KW
  <div
    className="col-resizer"
    onMouseDown={(e) => startResize(e, 'KW')}
    style={{ position: 'absolute', right: 0, top: 0, width: '4px', height: '100%', cursor: 'col-resize' }}
  />
</th>
```

```jsx
function startResize(e, colKey) {
  const startX = e.clientX;
  const startWidth = columnWidths[colKey] || 120;
  const onMove = (ev) => {
    const newWidth = Math.max(60, startWidth + ev.clientX - startX); // 最小 60px
    setColumnWidths(prev => ({ ...prev, [colKey]: newWidth }));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
```

#### C. 重置入口
在表格工具栏加"重置列宽"按钮，清空 localStorage 对应 key。

### 4.3 任务拆解（3 个）

| # | 任务 | 产出 |
|---|---|---|
| 1 | 列宽状态 hook + localStorage 持久化 | 1 个 hook |
| 2 | TranslationTab 所有 `<th>` 接入拖拽手柄 + 动态 width | 改造表头 |
| 3 | "重置列宽"按钮 + 走查拖拽流畅度 | 工具栏增强 |

### 4.4 风险评估
- **sticky 列**：KW / 中文是 sticky 定位居左，拖拽时需保证 sticky 位置同步更新。
- **语种列动态显隐**：visibleLanguages 切换后列宽状态需保持有效。
- **预估工作量**：中（拖拽逻辑简单，但 sticky + 动态列的边界 case 处理需细心）。

---

## 5. 落地顺序

```
§9.4 骨架屏 (工作量:小) ← 先做
    │
    ▼
§9.1 亮/暗模式 (工作量:中) ← 主题需先稳定
    │
    ▼
§9.6 列宽可调 (最低优先级, 可选)
```

---

## 6. 老版本兼容性说明

| 功能 | DB Schema 变更 | 数据迁移 | 老数据兼容 |
|---|---|---|---|
| §9.4 骨架屏 | 无 | 无 | ✅ 纯 UI 组件 |
| §9.1 主题切换 | 无 | 无 | ✅ 纯前端，localStorage 默认值 'dark' 保持现状 |
| §9.6 列宽可调 | 无 | 无 | ✅ localStorage 无值时用默认 width |

**全部 3 项均不涉及数据库变更，对老版本数据完全兼容。**

---

## 7. 验收标准

| 功能 | 验收点 |
|---|---|
| §9.4 | 加载时显示与真实内容尺寸接近的骨架；无 Layout Shift |
| §9.1 | 三态切换生效；刷新后保持；亮色下无暗色残留；Toast/Modal/EmptyState 视觉正常 |
| §9.6 | 拖拽表头右边缘可调宽；最小 60px；刷新后保持；重置按钮可用 |
