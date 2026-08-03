# GlossaHub Design System

> 单一来源:本文件覆盖 GlossaHub 前端设计令牌、组件 API、可访问性规范。
> 与 `src/index.css` 的 `:root` / `html.light-mode` 块保持同步。
> 任何视觉改动请同时更新本文件和 CSS。

---

## 1. 设计原则

1. **数据优先**:这是一个数据工作台,信息密度 > 视觉装饰。表格优先于插画、字号克制、留白以"提升扫描效率"为目的。
2. **暗色优先**:深色科技风为默认,亮色为可访问性补充。两者共用同一色相家族,只切亮度不切色相。
3. **WCAG 优先**:可访问性不是"加 bonus",是底线。重点守则:焦点环始终可见、色彩不是唯一信息载体、触摸目标 ≥ 28px、表单标签明确。
4. **不重新发明**:能用成熟库(HeroUI / lucide-react)就用,Tailwind utility class + CSS 变量做"骨架"。避免组件库和原生 CSS 混用。

---

## 2. 色彩令牌

### 2.1 表面层级(Surface Ladder)

| Token | 暗色 | 亮色 | 用途 |
|-------|------|------|------|
| `--bg-primary` | `#0e0e10` | `#f8fafc` | 应用底色 |
| `--bg-secondary` | `#16161a` | `#ffffff` | 卡片 / 表格 th / sidebar |
| `--bg-tertiary` | `#202024` | `#f1f5f9` | 输入框 / 二级容器 |
| `--bg-hover` | `#2a2a30` | `#cbd5e1` | 按钮 hover、行 hover |

> ⚠️ 亮色 `--bg-hover` 选择 `#cbd5e1` 而非更柔和的 `#e2e8f0`,因为 `#e2e8f0` 与 `#ffffff` 仅 1.23:1,**不满足 WCAG 1.4.11 (3:1)**。`#cbd5e1` 达到 1.48:1,搭配左侧 3px accent rail 形成可见边界。

### 2.2 强调色(Accent)

| Token | 暗色 | 亮色 | 备注 |
|-------|------|------|------|
| `--accent` | `#00f2ff` (cyan-400) | `#0ea5e9` (sky-500) | 主品牌色,链接 / 激活 / 进度条 |
| `--accent-rgb` | `0, 242, 255` | `14, 165, 233` | 用于 `rgba(var(--accent-rgb), α)` |
| `--accent-glow` | `rgba(0, 242, 255, 0.18)` | `rgba(14, 165, 233, 0.14)` | 阴影 / hover 光晕 |

**为什么亮色用 sky 而非 blue?**  
原 `#2563eb` (royal blue) 偏紫,与暗色 cyan 色相不一致——切换主题时用户感受到的是"色相变化"而非"亮度变化",品牌感丢失。`#0ea5e9` (sky-500) 与暗色 cyan 同属 cyan family,只切亮度,品牌一致性更强。

### 2.3 语义色

| Token | 暗色 | 亮色 | 语义 |
|-------|------|------|------|
| `--green` | `#10b981` | `#059669` | 成功 / 已审核 / 已联通 |
| `--green-bg` | `rgba(16, 185, 129, 0.12)` | `rgba(5, 150, 105, 0.1)` | 成功徽章背景 |
| `--yellow` | `#f59e0b` | `#d97706` | 警告 / 待审核 / 部分翻译 |
| `--yellow-bg` | `rgba(245, 158, 11, 0.12)` | `rgba(217, 119, 6, 0.1)` | 警告徽章背景 |
| `--red` | `#ef4444` | `#dc2626` | 错误 / 已驳回 / 已锁定 |
| `--red-bg` | `rgba(239, 68, 68, 0.12)` | `rgba(220, 38, 38, 0.1)` | 错误徽章背景 |
| `--purple` | `#8b5cf6` | `#7c3aed` | AI 翻译来源 / 已发布 |
| `--purple-bg` | `rgba(139, 92, 246, 0.12)` | `rgba(124, 58, 237, 0.1)` | AI 徽章背景 |

### 2.4 文字层级

| Token | 暗色 | 亮色 | 用途 |
|-------|------|------|------|
| `--text-primary` | `#f8fafc` | `#0f172a` | 正文 / 标题 |
| `--text-secondary` | `#94a3b8` | `#475569` | 次要文本 / 标签 |
| `--text-muted` | `#7c899c` | `#64748b` | metadata / 占位符 / 0% 进度 |

**对比度**:`--text-primary` 在各自底色上 ≥ 14:1,`--text-secondary` ≥ 7:1。

### 2.5 边框与分隔

| Token | 暗色 | 亮色 | 用途 |
|-------|------|------|------|
| `--border-color` | `#2a2a32` | `#e2e8f0` | 默认边框 |
| `--border-focus` | `#40404c` | `#cbd5e1` | hover / focus 强化边框 |

### 2.6 阴影

| Token | 暗色 | 亮色 |
|-------|------|------|
| `--shadow-sm` | `0 1px 2px 0 rgba(0,0,0,0.5)` | `0 1px 2px 0 rgba(15,23,42,0.06)` |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.5)` | `0 4px 8px -2px rgba(15,23,42,0.08)` |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.7)` | `0 12px 24px -6px rgba(15,23,42,0.12)` |

> 亮色阴影用 slate (rgba(15, 23, 42, ...)) 而非纯黑——纯黑阴影在白底上发灰发脏。

### 2.7 圆角 / 渐变

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `4px` | 徽章 / 标签 |
| `--radius-md` | `8px` | 按钮 / 输入框 / 卡片 |
| `--radius-lg` | `12px` | 模态框 / 大卡片 |
| `--logo-gradient` | `linear-gradient(135deg, <text> 40%, var(--accent) 100%)` | 品牌字 |

---

## 3. 字体系统

```html
<!-- index.html -->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Fira+Sans:wght@300;400;500;600;700&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet" />
```

| 角色 | 字体 | 用途 |
|------|------|------|
| 品牌字 | Outfit | logo / 大标题 / 营销页 |
| UI 正文 | Fira Sans (`--font-ui`) | 数据表格 / sidebar / 表单 |
| 数据 | Fira Code (`--font-mono`) | KW / code snippet |

### 字号规范(rem → px @ 16px base)

| 用途 | rem | px | 备注 |
|------|-----|----|------|
| 徽章 / 极小 metadata | `0.7` | 11.2px | 仅徽章使用 |
| small label | `0.75` | 12px | tooltips、btn-icon 文字 |
| body small | `0.8` | 12.8px | footer、metadata |
| body | `0.85-0.875` | 13.6-14px | **UI 文本下限** |
| body large | `0.95-1.0` | 15.2-16px | 数据值、modal 文本 |
| heading 2 | `1.1` | 17.6px | 卡片标题 |
| heading 1 | `1.4` | 22.4px | modal 标题 |
| display | `1.5+` | 24px+ | dashboard 大数字 |

> ⚠️ WCAG 没有强制最小字号,但建议 UI 文本 ≥ 14px。徽章 ≤ 12px 是行业惯例。

---

## 4. 间距

本项目使用 `gap` / `padding` 内联风格,未抽象成 token。常用值:

| 用途 | 值 |
|------|-----|
| 紧密相邻 | `4px` |
| 默认相邻 | `8px` (`--radius-md`) |
| 段落间距 | `12px` |
| 卡片内 padding | `16-24px` |
| 区块间距 | `24-32px` |

> 当前未抽象的原因:每个组件的间距语义不同(如 toast gap 10px、modal padding 24px),抽象 token 反而增加心智成本。

---

## 5. 组件 API

### 5.1 `<GlossaModal>`(统一模态框)

`src/components/GlossaModal.jsx` —— 项目里 16 处模态框统一入口。

```jsx
<GlossaModal
  isOpen={open}
  onClose={() => setOpen(false)}
  title="编辑词条"
  maxWidth="800px"           // standard 模式
  width="400px"              // simple 模式
  variant="standard"         // 'standard' | 'simple'
  dismissOnBackdrop={true}
  closeDisabled={false}
  footer={<><button>取消</button><button>保存</button></>}
/>
```

**特性**:
- ESC 键关闭
- 点击 backdrop 关闭(可关)
- 打开时自动 focus 第一个可聚焦元素
- Tab 键在模态框内循环(focus trap)
- 打开时锁定 body 滚动
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`

### 5.2 `<Toast>`(通知系统)

`src/components/Toast.jsx`

```jsx
import { useToast } from './Toast';
const toast = useToast();

toast.success('保存成功');     // 2.5s 自动消失,绿
toast.error('保存失败：xxx');  // 5s 自动消失,红
toast.info('提示信息');        // 3s 自动消失,蓝
```

**Provider 规则**:`useToast()` 必须在 `<ToastProvider>` 内调用(在 `src/main.jsx` 已包裹)。
- **Dev 模式**:`useToast()` 在 Provider 外 → `console.warn` 一次 + 返回 noop(不崩)
- **Prod 模式**:`useToast()` 在 Provider 外 → **throw**,让 bug 立即暴露

### 5.3 `<EmptyState>`(空状态)

`src/components/EmptyState.jsx`

```jsx
<EmptyState
  title="暂无词条表"
  description="请前往「数据表管理」创建第一张词条表。"
  actionLabel="前往数据表管理"
  onAction={() => navigate('versions')}
  icon={CustomIcon}   // 默认 Inbox
/>
```

**规则**:
- 所有"无数据"状态统一用 `<EmptyState />`,不要再 `<div>暂无数据</div>`
- 如有可引导的下一步,必须提供 `actionLabel` + `onAction`

### 5.4 `<StatusBadge>`(状态徽章)

`src/components/translation/StatusBadge.jsx`

```jsx
<StatusBadge status={rec.status} rejectReason={rec.rejectReason} />
```

状态映射:
| Status code | 显示 | tone |
|-------------|------|------|
| DRAFT / PENDING_REVIEW / TRANSLATING | 待审核 | `pending` (yellow) |
| APPROVED | 已审核 | `success` (green) |
| REJECTED | 已驳回 | `danger` (red) |
| PUBLISHED | 已发布 | `info` (purple) |

> ⚠️ 不要在内联三元表达式里手写徽章,新状态加 `STATUS_CONFIG` 即可。

### 5.5 `<ErrorBoundary>`(错误边界)

`src/components/ErrorBoundary.jsx`

包裹在 `<App />` 外层,捕获渲染错误。失败时显示降级 UI + 重置按钮,避免白屏。

### 5.6 `<Pagination>`(分页)

`src/components/Pagination.jsx`

页脚固定,支持 page / pageSize 切换。

### 5.7 `<Skeleton>`(骨架屏)

`src/components/Skeleton.jsx`

```jsx
import { Skeleton, SkeletonTable, SkeletonTab } from './Skeleton';

<Skeleton width="200px" height="20px" />
<SkeletonTable rows={10} cols={6} />
<SkeletonTab />  // 全 tab 骨架
```

> 用户开启 `prefers-reduced-motion` 时,shimmer 动画自动停用。

---

## 6. 布局原语

### 6.1 `.data-table`(数据网格)

唯一用于翻译表的网格类:
- 列对齐:`text-align: left`(默认),数字列 `text-align: center`
- Sticky:`.sticky-col-1` / `.sticky-col-2` 用于冻结 KW / CN 列
- 选中:`tr[aria-selected="true"]` + `rgba(var(--accent-rgb), 0.08)` 高亮
- Hover:`tr:hover` + `bg-hover` + 左侧 3px accent rail(`inset 3px 0 0 var(--accent)`)
- 键盘可达:`tr[tabIndex="0"]` + Enter 触发编辑

### 6.2 App 布局(`src/App.jsx`)

```
┌──────────┬─────────────────────────────────────┐
│ Sidebar  │ Header (60px)                       │
│ 64/230px├─────────────────────────────────────┤
│         │                                     │
│ nav     │ <ActiveTab>                         │
│ + logout│                                     │
│         ├─────────────────────────────────────┤
│         │ Footer (36px)                       │
└──────────┴─────────────────────────────────────┘
```

---

## 7. 主题切换

```jsx
// src/App.jsx
const [theme, setTheme] = useState(() => safeGetLocalStorage('glossahub_theme', 'light'));

useEffect(() => {
  document.documentElement.classList.toggle('light-mode', theme === 'light');
  localStorage.setItem('glossahub_theme', theme);
}, [theme]);
```

`<html>` 上的 `light-mode` class 触发 `html.light-mode { ... }` 内的 CSS 变量覆盖,**整套颜色自动切换**,不需要组件层做任何事。

### early-load 避免 flash(`index.html`)

```html
<script>
  var theme = localStorage.getItem('glossahub_theme') || 'dark';
  if (theme === 'light') document.documentElement.classList.add('light-mode');
</script>
```

---

## 8. 可访问性规范

### 8.1 焦点环

**全局规则**(在 `index.css`):
```css
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**例外**:输入框 `:focus` 时用 `box-shadow: 0 0 0 1px var(--accent-glow)`,鼠标 focus 时不显示 outline(`input:focus:not(:focus-visible)`)。

### 8.2 触摸目标

| 元素 | 最小尺寸 |
|------|---------|
| 主按钮 | 36-44px |
| 表格内 icon-btn | 28×28 |
| 表格内 lock-toggle-btn | 28×28 |
| 编辑按钮(`btn-icon-only`) | 32×32 |

WCAG 2.5.5 推荐 ≥ 44px;表格内取 28-32 是密度妥协,在主交互按钮仍守 36+。

### 8.3 键盘导航

- 所有可点击元素必须是 `<button>` / `<a>`,**禁用 `<div onClick>`**
- 图标按钮必须有 `aria-label`(icon-only)
- 表格行:`<tr tabIndex="0">` + Enter 触发主操作
- 模态框:ESC 关闭 + Tab 循环(focus trap)

### 8.4 ARIA

- 状态变化:`role="status"` + `aria-live="polite"`(例:Dify 连接状态指示器)
- 错误信息:`role="alert"`(Toast 自动)
- 切换控件:`aria-pressed`(锁定按钮)、`aria-expanded`(折叠面板)
- 选择:`aria-selected="true"`(表格行)

### 8.5 `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

> 前庭敏感用户会感谢的。

---

## 9. 性能与最佳实践

### 9.1 渲染优化

- 用 `React.memo()` 包裹行/单元组件(例:`TranslationRow`)
- `useCallback` 包裹传给 memo 子组件的回调
- 表格 > 100 行时考虑虚拟滚动(react-window)——**当前未实施**
- 懒加载次要 tab:`React.lazy(() => import('./TranslationTab'))`

### 9.2 图标

- **统一**用 `lucide-react`(已 18 个文件依赖)
- **不用 emoji**(WCAG / OS 渲染不一致)
- 装饰性 SVG 加 `aria-hidden="true"`

### 9.3 状态徽章 vs 内联三元

```jsx
// ❌ 不推荐
{rec.status === 'DRAFT' ? <span>待审核</span> : rec.status === 'APPROVED' ? <span>已审核</span> : ...}

// ✅ 推荐
<StatusBadge status={rec.status} />
```

### 9.4 CSS 类优先于 inline style

只在**一次性、动态值**用 inline style:
```jsx
// ✅ OK: 动态值
<div style={{ width: `${pct}%`, backgroundColor: color }} />

// ❌ 改用 class: 静态重复样式
<button style={{ padding: '2px', borderRadius: '4px' }}>  // 改为 className
```

---

## 10. 验证清单

提交前自检:
- [ ] 切换暗色 / 亮色,所有页面无白底泄漏
- [ ] Tab 走过所有交互元素,焦点环始终可见
- [ ] 开启系统"减少动效",动画消失
- [ ] 移动设备模拟下,触摸目标 ≥ 28px
- [ ] oxlint silent
- [ ] `npm test` 全过(当前 86 个测试)
- [ ] `npm run build` 无 warning

---

## 11. 维护说明

**改了 token 怎么办?**
1. 改 `:root` 或 `html.light-mode` 块
2. 同步更新本文档 §2
3. 跑 `npm run build` 验证编译
4. 视觉对比暗/亮主题

**新增组件怎么办?**
1. 放在 `src/components/<Name>.jsx`
2. 写头部注释 + Props 类型示例
3. 同步本文档 §5
4. 写测试(`src/components/__tests__/<Name>.test.jsx`)

**遇到边界情况(色相冲突、新交互模式)?**
1. 先看本文档原则 §1
2. 跑 ui-ux-pro-max 设计系统查询
3. 在 PR 里附设计理由