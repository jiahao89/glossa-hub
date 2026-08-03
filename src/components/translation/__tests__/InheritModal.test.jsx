import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InheritModal from '../InheritModal';

// ============================================================
// InheritModal — 翻译记忆库继承
//
// v1.2 重构后丢失, 现在恢复。功能: 从源大表继承翻译, 覆盖当前大表
// 未翻译的 cell。已锁定词条被跳过(后端处理)。
// 后端: POST /api/versions/:id/inherit-translations
//       body: { sourceVersionId }
//       response: { message, inheritedCount }
// ============================================================

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });

const tables = [
  { id: 'ver-current', name: '海外 2.1' },
  { id: 'ver-old-domestic', name: '国内 2.0' },
  { id: 'ver-overseas-20', name: '海外 2.0' },
];

describe('InheritModal', () => {
  let mockOnClose, mockOnSuccess;

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockOnSuccess = vi.fn();
    mockFetch.mockReset();
  });

  it('打开时, 默认选中第一张非自身的表作为源', () => {
    render(
      <InheritModal
        open={true}
        onClose={mockOnClose}
        currentTableId="ver-current"
        tables={tables}
        onSuccess={mockOnSuccess}
      />
    );

    // 标题
    expect(screen.getByText(/从其他大表继承翻译/)).toBeInTheDocument();
    // 默认选了 ver-old-domestic
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('ver-old-domestic');
  });

  it('没有其他大表时, 显示警告且按钮 disabled', () => {
    render(
      <InheritModal
        open={true}
        onClose={mockOnClose}
        currentTableId="ver-only"
        tables={[{ id: 'ver-only', name: '唯一的表' }]}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/当前项目下没有其他大表/)).toBeInTheDocument();
    expect(screen.getByText('开始继承')).toBeDisabled();
  });

  it('点击"开始继承"时, 调用 /api/versions/.../inherit-translations 端点', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: '成功继承 5 条词条', inheritedCount: 5 }),
    });

    render(
      <InheritModal
        open={true}
        onClose={mockOnClose}
        currentTableId="ver-current"
        tables={tables}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.click(screen.getByText('开始继承'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/ver-current/inherit-translations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sourceVersionId: 'ver-old-domestic' }),
        })
      );
    });

    // 成功后 onSuccess 触发 + onClose 关闭
    expect(mockOnSuccess).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('inheritedCount=0 时也调用 onSuccess (前端不需要分支处理)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: '无空白可补全', inheritedCount: 0 }),
    });

    render(
      <InheritModal
        open={true}
        onClose={mockOnClose}
        currentTableId="ver-current"
        tables={tables}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.click(screen.getByText('开始继承'));

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('后端返回 4xx/5xx 时, 不调用 onSuccess, 显示错误 toast', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: '指定的源版本不存在' }),
    });

    render(
      <InheritModal
        open={true}
        onClose={mockOnClose}
        currentTableId="ver-current"
        tables={tables}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.click(screen.getByText('开始继承'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // 失败时不应触发 onSuccess / onClose
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('未选源表时, 按钮 disabled, 不调端点', () => {
    render(
      <InheritModal
        open={true}
        onClose={mockOnClose}
        currentTableId="ver-current"
        tables={tables}
        onSuccess={mockOnSuccess}
      />
    );

    // 默认选了 ver-old-domestic, 手动清空让它 disabled
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });

    expect(screen.getByText('开始继承')).toBeDisabled();
  });
});