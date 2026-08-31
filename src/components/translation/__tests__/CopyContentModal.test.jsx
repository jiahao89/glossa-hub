import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../Toast';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CopyContentModal from '../CopyContentModal';

describe('CopyContentModal', () => {
  let mockOnClose;
  let writeTextMock;

  const sampleRecords = [
    {
      id: 'rec-1',
      KW: 'KW_START',
      'CN（中文）': '开始',
      '所在页面': '首页',
      '字号类别': '中号',
      status: 'APPROVED',
      EN: 'Start',
      FR: 'Démarrer'
    },
    {
      id: 'rec-2',
      KW: 'KW_STOP',
      'CN（中文）': '停止',
      '所在页面': '首页',
      '字号类别': '中号',
      status: 'DRAFT',
      EN: 'Stop',
      FR: 'Arrêter'
    }
  ];

  beforeEach(() => {
    mockOnClose = vi.fn();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
  });

  const renderComponent = (props = {}) => {
    return render(
      <ToastProvider>
        <CopyContentModal
          open={true}
          onClose={mockOnClose}
          selectedRecords={sampleRecords}
          targetLanguages={['EN', 'FR']}
          {...props}
        />
      </ToastProvider>
    );
  };

  it('renders modal with selected records count and does NOT include header by default', async () => {
    renderComponent();

    // Check header checkbox is NOT checked by default
    const headerCheckbox = screen.getByLabelText('包含表头（第一行输出列名）');
    expect(headerCheckbox.checked).toBe(false);

    // Click copy button
    const copyButton = screen.getByRole('button', { name: /复制到剪贴板/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    const copiedText = writeTextMock.mock.calls[0][0];
    const lines = copiedText.split('\n');

    // Should have exactly 2 lines (2 records), NO header line
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('KW_START');
    expect(lines[0]).toContain('开始');
    expect(lines[1]).toContain('KW_STOP');
    expect(lines[1]).toContain('停止');
    expect(lines[0]).not.toContain('KW (键名)');
  });

  it('includes header row when user explicitly checks "包含表头"', async () => {
    renderComponent();

    const headerCheckbox = screen.getByLabelText('包含表头（第一行输出列名）');
    fireEvent.click(headerCheckbox);
    expect(headerCheckbox.checked).toBe(true);

    const copyButton = screen.getByRole('button', { name: /复制到剪贴板/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    const copiedText = writeTextMock.mock.calls[0][0];
    const lines = copiedText.split('\n');

    // Should have 3 lines (1 header + 2 data rows)
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('KW (键名)');
    expect(lines[0]).toContain('CN (中文)');
    expect(lines[1]).toContain('KW_START');
    expect(lines[2]).toContain('KW_STOP');
  });

  it('copies in CSV format without header when CSV is selected', async () => {
    renderComponent();

    const csvRadio = screen.getByLabelText(/逗号分隔 CSV/i);
    fireEvent.click(csvRadio);

    const copyButton = screen.getByRole('button', { name: /复制到剪贴板/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    const copiedText = writeTextMock.mock.calls[0][0];
    const lines = copiedText.split('\n');

    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('KW_START,开始,首页,中号,APPROVED,Start,Démarrer');
    expect(lines[1]).toBe('KW_STOP,停止,首页,中号,DRAFT,Stop,Arrêter');
  });
});
