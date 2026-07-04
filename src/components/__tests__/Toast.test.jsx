import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
