/**
 * 统一 API 请求封装
 * 自动附带 JWT Token，401 时自动跳转登录页
 * 支持通过环境变量配置 API 地址（云端部署）
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // 401: 登录过期，清除状态并跳转登录页
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
    throw new Error('登录已过期，请重新登录');
  }

  return res;
}

/**
 * 安全读取和解析 localStorage 中的 JSON 数据
 */
export function safeGetLocalStorage(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (err) {
    console.warn(`读取/解析 localStorage 中的 [${key}] 失败，使用默认值:`, err);
    return defaultValue;
  }
}

