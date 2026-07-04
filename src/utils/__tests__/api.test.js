import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../api';

// ============================================================
// Mock 全局 fetch 和 localStorage
// ============================================================
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// 简易内存 localStorage mock
function createLocalStorageMock() {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _getStore: () => store,
  };
}

describe('apiFetch', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('当 localStorage 中存在 token 时，附带 Authorization 头', async () => {
    localStorageMock.getItem.mockReturnValue('my-jwt-token');
    mockFetch.mockResolvedValue({ status: 200 });

    await apiFetch('/api/data');

    expect(mockFetch).toHaveBeenCalledWith('/api/data', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer my-jwt-token',
      },
    });
  });

  it('当 localStorage 中无 token 时，不附带 Authorization 头', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    mockFetch.mockResolvedValue({ status: 200 });

    await apiFetch('/api/data');

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('Authorization');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('401 响应时清除 localStorage 并重定向', async () => {
    localStorageMock.getItem.mockReturnValue('expired-token');
    mockFetch.mockResolvedValue({ status: 401 });

    // Mock window.location.href
    const originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };

    await expect(apiFetch('/api/data')).rejects.toThrow('登录已过期，请重新登录');

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    expect(window.location.href).toBe('/');

    // 恢复 window.location
    window.location = originalLocation;
  });

  it('透传 options 中的自定义 headers', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    mockFetch.mockResolvedValue({ status: 200 });

    await apiFetch('/api/data', {
      headers: { 'X-Custom': 'value' },
    });

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders['X-Custom']).toBe('value');
  });

  it('正确合并 Content-Type 头', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    mockFetch.mockResolvedValue({ status: 200 });

    await apiFetch('/api/upload', {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    // options.headers 会覆盖默认的 Content-Type
    expect(callHeaders['Content-Type']).toBe('multipart/form-data');
  });

  it('网络异常时抛出错误', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/data')).rejects.toThrow('Failed to fetch');
  });

  it('透传其他 options 参数（如 method, body）', async () => {
    localStorageMock.getItem.mockReturnValue('tok');
    mockFetch.mockResolvedValue({ status: 200 });

    const body = JSON.stringify({ key: 'val' });
    await apiFetch('/api/data', { method: 'POST', body });

    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.method).toBe('POST');
    expect(callOpts.body).toBe(body);
  });
});
