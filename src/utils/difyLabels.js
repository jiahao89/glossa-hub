// ============================================================
// difyLabels — 内置 Dify 引擎的中文显示名 / host 反向映射
//
// 单一真相源: server/routes/translation.cjs 的 BUILTIN_DIFY_APPS 是权威定义,
// 这里仅镜像一份,供前端 UI 展示用。
// 后端在调用时会强制覆盖 key,前端不参与认证决策。
// ============================================================

/**
 * 内置 Dify 引擎预设 (前端展示用,顺序决定下拉菜单顺序)
 * 必须与 server/routes/translation.cjs 的 BUILTIN_DIFY_APPS 保持一致。
 */
export const BUILTIN_DIFY_PRESETS = [
  {
    id: 'night',
    label: '迈金 Night 专用引擎',
    baseUrl: 'https://night.magene.cn/v1',
    description: '迈金内部运维预置,生产推荐',
  },
  {
    id: 'official',
    label: 'Dify 官方云服务',
    baseUrl: 'https://api.dify.ai/v1',
    description: 'Dify SaaS 公共实例',
  },
];

/**
 * 从 baseUrl 推断对应的内置预设 id。
 * 自定义 URL 返回 null(UI 应降级为"自定义 (host)")。
 */
export function matchBuiltinPreset(baseUrl) {
  if (!baseUrl) return null;
  const lower = baseUrl.toLowerCase();
  return BUILTIN_DIFY_PRESETS.find(p => lower.includes(p.id))?.id || null;
}

/**
 * UI 友好的当前引擎标签:
 *   - 内置命中 → "迈金 Night 专用引擎" / "Dify 官方云服务"
 *   - 自定义 → "自定义 · api.example.com" (只显示 host,不暴露 key/url path)
 */
export function getDifyDisplayLabel(baseUrl) {
  const id = matchBuiltinPreset(baseUrl);
  if (id) {
    return BUILTIN_DIFY_PRESETS.find(p => p.id === id).label;
  }
  try {
    const host = new URL(baseUrl).host;
    return `自定义 · ${host}`;
  } catch {
    return '自定义引擎';
  }
}