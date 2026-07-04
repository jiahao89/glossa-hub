import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from '../Pagination';

describe('Pagination 分页器', () => {
  const defaultProps = {
    total: 200,
    page: 1,
    pageSize: 50,
    onPageChange: vi.fn(),
  };

  it('渲染正确的页码信息', () => {
    render(<Pagination {...defaultProps} />);
    // 共 200 条，每页 50，共 4 页
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('第一页时 "上一页" 按钮被禁用', () => {
    render(<Pagination {...defaultProps} page={1} />);
    const prevBtn = screen.getByRole('button', { name: '上一页' });
    expect(prevBtn).toBeDisabled();
  });

  it('最后一页时 "下一页" 按钮被禁用', () => {
    render(<Pagination {...defaultProps} page={4} />);
    const nextBtn = screen.getByRole('button', { name: '下一页' });
    expect(nextBtn).toBeDisabled();
  });

  it('点击 "下一页" 调用 onPageChange 并传入正确页码', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={2} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('点击 "上一页" 调用 onPageChange 并传入正确页码', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: '上一页' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('显示每页条数选择器并在切换时调用 onPageSizeChange', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        {...defaultProps}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[20, 50, 100]}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    await user.selectOptions(select, '100');
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });

  it('不传 onPageSizeChange 时不渲染每页条数选择器', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('total 为 0 时不渲染任何内容', () => {
    const { container } = render(
      <Pagination total={0} page={1} pageSize={50} onPageChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('total 小于等于 pageSize 时不显示页码信息', () => {
    // total = 30, pageSize = 50 => totalPages = 1
    render(<Pagination total={30} page={1} pageSize={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('30')).toBeInTheDocument();
    // totalPages=1 时不渲染 "· 第 X / Y 页"
    expect(screen.queryByText(/\/ 1 页/)).not.toBeInTheDocument();
  });
});
