import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from '../EmptyState';

describe('EmptyState 空状态', () => {
  it('默认标题为 "暂无数据"', () => {
    render(<EmptyState />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('渲染自定义标题和描述', () => {
    render(<EmptyState title="无结果" description="请尝试更换筛选条件" />);
    expect(screen.getByText('无结果')).toBeInTheDocument();
    expect(screen.getByText('请尝试更换筛选条件')).toBeInTheDocument();
  });

  it('提供 actionLabel 和 onAction 时渲染操作按钮', () => {
    const onAction = vi.fn();
    render(<EmptyState actionLabel="新增" onAction={onAction} />);
    expect(screen.getByRole('button', { name: '新增' })).toBeInTheDocument();
  });

  it('不提供 actionLabel 时不渲染操作按钮', () => {
    render(<EmptyState title="空" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('提供 actionLabel 但不提供 onAction 时不渲染操作按钮', () => {
    render(<EmptyState actionLabel="新增" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('点击操作按钮调用 onAction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<EmptyState actionLabel="创建" onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: '创建' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('渲染自定义 icon 组件', () => {
    // lucide-react 导出的 SVG 图标组件就是一个函数
    const CustomIcon = (props) => <svg data-testid="custom-icon" {...props} />;
    render(<EmptyState icon={CustomIcon} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('不传 description 时不渲染描述区域', () => {
    const { container } = render(<EmptyState title="空状态" />);
    // 只有标题 div，没有描述 div（通过检查子元素数量）
    const mainDiv = container.firstChild;
    // icon wrapper + title = 2 个子元素（无 description 和 button）
    expect(mainDiv.children).toHaveLength(2);
  });
});
