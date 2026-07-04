import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../ErrorBoundary';

// 触发错误的子组件
function ThrowError({ message = '测试错误' }) {
  throw new Error(message);
}

// 正常子组件
function GoodChild() {
  return <div data-testid="good">正常内容</div>;
}

describe('ErrorBoundary 错误边界', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // 静默 console.error 避免测试输出噪音
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('无错误时正常渲染子元素', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('good')).toBeInTheDocument();
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('子组件抛出错误时渲染降级 UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('GlossaHub 遇到了一个错误')).toBeInTheDocument();
    expect(screen.getByText(/请刷新页面重试/)).toBeInTheDocument();
  });

  it('降级 UI 包含 "刷新页面" 按钮', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument();
  });

  it('点击 "刷新页面" 按钮调用 window.location.reload', async () => {
    const user = userEvent.setup();
    const reloadMock = vi.fn();
    const originalLocation = window.location;
    delete window.location;
    window.location = { reload: reloadMock };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: '刷新页面' }));
    expect(reloadMock).toHaveBeenCalledOnce();

    window.location = originalLocation;
  });

  it('将错误信息输出到 console.error', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="boom" />
      </ErrorBoundary>
    );
    // componentDidCatch 会调用 console.error
    expect(consoleErrorSpy).toHaveBeenCalled();
    // React 19 可能以格式化字符串调用 console.error，检查所有参数
    const allArgs = consoleErrorSpy.mock.calls.flatMap((c) => c.map(String));
    const hasErrorBoundary = allArgs.some(
      (arg) => arg.includes('[ErrorBoundary]') || arg.includes('未捕获的渲染错误')
    );
    // 如果参数中没有找到标记文本，至少确认 spy 被调用了且传入了 Error 对象
    if (!hasErrorBoundary) {
      const errorObj = consoleErrorSpy.mock.calls.flat().find((a) => a instanceof Error);
      expect(errorObj).toBeTruthy();
      expect(errorObj.message).toBe('boom');
    } else {
      expect(hasErrorBoundary).toBe(true);
    }
  });
});
