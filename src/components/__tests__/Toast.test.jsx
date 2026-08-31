import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

// ============================================================
// 辅助组件：在 ToastProvider 内调用 useToast 暴露方法
// ============================================================
function ToastHarness({ onReady }) {
  const toast = useToast();
  React.useEffect(() => { onReady(toast); }, [toast, onReady]);
  return <div>harness</div>;
}

function renderWithToast() {
  let toastRef;
  render(
    <ToastProvider>
      <ToastHarness onReady={(t) => { toastRef = t; }} />
    </ToastProvider>
  );
  return { getToast: () => toastRef };
}

describe('Toast 系统', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ToastProvider 正确渲染子元素', () => {
    render(
      <ToastProvider>
        <div data-testid="child">hello</div>
      </ToastProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('useToast 返回 success / error / info 函数', () => {
    const { getToast } = renderWithToast();
    const toast = getToast();
    expect(typeof toast.success).toBe('function');
    expect(typeof toast.error).toBe('function');
    expect(typeof toast.info).toBe('function');
  });

  it('调用 toast.success 后显示正确消息', () => {
    const { getToast } = renderWithToast();
    act(() => { getToast().success('操作成功'); });
    expect(screen.getByRole('alert')).toHaveTextContent('操作成功');
  });

  it('调用 toast.error 后显示错误消息', () => {
    const { getToast } = renderWithToast();
    act(() => { getToast().error('出错了'); });
    expect(screen.getByRole('alert')).toHaveTextContent('出错了');
  });

  it('toast 在超时后自动消失', () => {
    const { getToast } = renderWithToast();
    act(() => { getToast().success('自动消失'); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // success 类型 2500ms 自动关闭
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('error 类型 toast 在 5000ms 后自动消失', () => {
    const { getToast } = renderWithToast();
    act(() => { getToast().error('错误消息'); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(4999); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('第三参 options.duration 可覆盖默认停留时长', () => {
    const { getToast } = renderWithToast();
    act(() => { getToast().error('较长的错误详情...', { duration: 10000 }); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // 默认 5000ms 处不应消失（证明 duration 已覆盖默认值）
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(4999); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('点击关闭按钮立即移除 toast', () => {
    const { getToast } = renderWithToast();
    act(() => { getToast().info('手动关闭'); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: '关闭' });
    act(() => { fireEvent.click(closeBtn); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('多个 toast 同时堆叠', () => {
    const { getToast } = renderWithToast();
    act(() => {
      getToast().success('第一条');
      getToast().error('第二条');
      getToast().info('第三条');
    });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(3);
    expect(alerts[0]).toHaveTextContent('第一条');
    expect(alerts[1]).toHaveTextContent('第二条');
    expect(alerts[2]).toHaveTextContent('第三条');
  });
});

// ============================================================
// Provider 外 fallback 行为
//
// vitest 默认 import.meta.env.DEV === true,所以这里测的是 dev 分支:
//   - 调用 useToast 不在 Provider 内时:
//     · console.warn 一次
//     · 返回 noop 函数(不抛错)
//   生产分支(prod 抛错)在 build 后的代码里,通过 import.meta.env.DEV
//   在打包时被静态消除,这里无法直接验证。
// ============================================================

describe('Toast - Provider 外 fallback (dev)', () => {
  it('useToast 在 Provider 外: 不抛错, 返回 noop, console.warn 一次', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function NoProviderHarness() {
      const toast = useToast();
      return <div data-testid="noop">{typeof toast.success}</div>;
    }
    expect(() => {
      render(<NoProviderHarness />);
    }).not.toThrow();
    expect(screen.getByTestId('noop')).toHaveTextContent('function');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('useToast() called outside <ToastProvider>')
    );
    warnSpy.mockRestore();
  });

  it('Provider 外的 noop.success 调用不抛错', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    function NoProviderCaller() {
      const toast = useToast();
      // 不应 throw
      toast.success('这条消息被默默丢弃');
      toast.error('这条也是');
      return <div>ok</div>;
    }
    expect(() => render(<NoProviderCaller />)).not.toThrow();
  });
});
