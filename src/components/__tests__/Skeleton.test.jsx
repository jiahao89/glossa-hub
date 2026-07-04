import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonText, SkeletonTable } from '../Skeleton';

describe('Skeleton 骨架屏', () => {
  it('默认渲染单个矩形骨架', () => {
    const { container } = render(<Skeleton />);
    const div = container.firstChild;
    expect(div).toBeTruthy();
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('16px');
  });

  it('自定义 width 和 height', () => {
    const { container } = render(<Skeleton width="200px" height={32} />);
    const div = container.firstChild;
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('32px');
  });

  it('count > 1 时渲染多个骨架项', () => {
    const { container } = render(<Skeleton count={5} />);
    // 外层是一个 flex 容器，内部有 5 个子元素
    const wrapper = container.firstChild;
    expect(wrapper.children).toHaveLength(5);
  });

  it('variant="circle" 时 borderRadius 为 50%', () => {
    const { container } = render(<Skeleton variant="circle" width={40} height={40} />);
    const div = container.firstChild;
    expect(div.style.borderRadius).toBe('50%');
  });

  it('默认 variant="rect" 使用 radius 值作为 borderRadius', () => {
    const { container } = render(<Skeleton radius={8} />);
    const div = container.firstChild;
    expect(div.style.borderRadius).toBe('8px');
  });
});

describe('SkeletonText 文本骨架', () => {
  it('渲染正确数量的行', () => {
    const { container } = render(<SkeletonText lines={4} />);
    const wrapper = container.firstChild;
    expect(wrapper.children).toHaveLength(4);
  });

  it('最后一行宽度为 60%（较短）', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const wrapper = container.firstChild;
    const lastLine = wrapper.children[2];
    expect(lastLine.style.width).toBe('60%');
  });

  it('非最后一行宽度为 100%', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const wrapper = container.firstChild;
    expect(wrapper.children[0].style.width).toBe('100%');
    expect(wrapper.children[1].style.width).toBe('100%');
  });

  it('默认渲染 3 行', () => {
    const { container } = render(<SkeletonText />);
    const wrapper = container.firstChild;
    expect(wrapper.children).toHaveLength(3);
  });
});

describe('SkeletonTable 表格骨架', () => {
  it('渲染正确的行数和列数', () => {
    const { container } = render(<SkeletonTable rows={5} cols={3} />);
    const table = container.querySelector('table');
    expect(table).toBeTruthy();

    // thead: 1 行 3 列
    const thCells = table.querySelectorAll('thead th');
    expect(thCells).toHaveLength(3);

    // tbody: 5 行，每行 3 列
    const tbodyRows = table.querySelectorAll('tbody tr');
    expect(tbodyRows).toHaveLength(5);

    const firstRowCells = tbodyRows[0].querySelectorAll('td');
    expect(firstRowCells).toHaveLength(3);
  });

  it('默认渲染 8 行 6 列', () => {
    const { container } = render(<SkeletonTable />);
    const table = container.querySelector('table');

    const thCells = table.querySelectorAll('thead th');
    expect(thCells).toHaveLength(6);

    const tbodyRows = table.querySelectorAll('tbody tr');
    expect(tbodyRows).toHaveLength(8);
  });

  it('表头包含 Skeleton 组件', () => {
    const { container } = render(<SkeletonTable rows={1} cols={2} />);
    const thCells = container.querySelectorAll('thead th');
    // 每个 th 内有一个 div（Skeleton）
    thCells.forEach((th) => {
      expect(th.querySelector('div')).toBeTruthy();
    });
  });
});
