/**
 * 统一 API 请求封装
 * 自动附带 JWT Token，401 时自动跳转登录页
 */
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
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
