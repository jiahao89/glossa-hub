import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditTermModal from '../EditTermModal';

// ============================================================
// EditTermModal — 编辑单条词条 + 一键生成 KW
//
// 回归测试: 之前 v1.2 重构时整个 inline 编辑模态框被删,
// 只剩 setEditModalRecord(rec) 调用, 编辑按钮无响应。
// 本组件恢复该功能 + "生成 KW" 按钮 (调用 /generate-kw 端点)。
// ============================================================

// Module-level fetch mock — must be installed before EditTermModal imports
// apiFetch, otherwise the apiFetch module captures a reference to the
// original global fetch. (Same pattern as src/utils/__tests__/api.test.js.)
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// In-memory localStorage stub — apiFetch calls localStorage.getItem('token')
// and jsdom's default localStorage throws "Cannot read properties of
// undefined" in some vitest runs. Same pattern as api.test.js.
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

describe('EditTermModal', () => {
  let mockOnClose;
  let mockOnSaveSuccess;

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockOnSaveSuccess = vi.fn();
    mockFetch.mockReset();
  });

  const sampleRecord = {
    recordId: 'rec-123',
    id: 'rec-123',
    fields: {
      'KW': 'KW_EXISTING',
      'CN（中文）': '现有中文',
      '所在页面': '主页',
      '字号类别': '大号',
    },
  };

  const fieldMap = {
    'KW': 'f_kw',
    'CN（中文）': 'f_cn',
    '所在页面': 'f_page',
    '字号类别': 'f_size',
    'EN（英文）': 'f_en',
  };

  const getRecordValue = (rec, fId) => {
    const inv = { f_kw: 'KW', f_cn: 'CN（中文）', f_page: '所在页面', f_size: '字号类别', f_en: 'EN（英文）' };
    return rec.fields[inv[fId]] || '';
  };

  it('当 record 为 null 时, 不渲染任何内容', () => {
    const { container } = render(
      <EditTermModal
        open={false}
        record={null}
        onClose={mockOnClose}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('打开模态框时, 用 record.fields 填充表单', () => {
    render(
      <EditTermModal
        open={true}
        record={sampleRecord}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
      />
    );

    // KW field 显示现有值
    expect(screen.getByDisplayValue('KW_EXISTING')).toBeInTheDocument();
    // CN 字段
    expect(screen.getByDisplayValue('现有中文')).toBeInTheDocument();
    // 模态框标题
    expect(screen.getByText('编辑词条')).toBeInTheDocument();
    // "生成 KW" 按钮存在
    expect(screen.getByText('生成 KW')).toBeInTheDocument();
  });

  it('点击"生成 KW"按钮: 调用 /generate-kw 端点, 用 CN 文本', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ kw: 'KW_AUTO_GENERATED' }),
    });

    render(
      <EditTermModal
        open={true}
        record={sampleRecord}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByText('生成 KW').closest('button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/proj-default/generate-kw'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: '现有中文' }),
        })
      );
    });

    // 生成后, KW 输入框更新
    await waitFor(() => {
      expect(screen.getByDisplayValue('KW_AUTO_GENERATED')).toBeInTheDocument();
    });
  });

  it('CN 为空时点"生成 KW", 提示先填写 CN, 不调用端点', async () => {
    const emptyRecord = { ...sampleRecord, fields: { ...sampleRecord.fields, 'CN（中文）': '' } };

    render(
      <EditTermModal
        open={true}
        record={emptyRecord}
        fieldMap={fieldMap}
        getRecordValue={(rec, fId) => {
          const v = getRecordValue(rec, fId);
          return fId === 'f_cn' ? '' : v;
        }}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByText('生成 KW').closest('button'));

    // 不调用 fetch
    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('点击"保存修改": 调用 PUT /api/terms/:id 并触发 onSaveSuccess + onClose', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    render(
      <EditTermModal
        open={true}
        record={sampleRecord}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
        onSaveSuccess={mockOnSaveSuccess}
      />
    );

    fireEvent.click(screen.getByText('保存修改'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/terms/rec-123'),
        expect.objectContaining({ method: 'PUT' })
      );
      expect(mockOnSaveSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});

// ============================================================
// 右侧 tab: 跨版本参考 (TM) + 修改历史 (History)
//
// v1.2 重构后这两个功能从 EditTermModal 整体丢失,
// 现在恢复。后端端点 (GET /api/versions/:id/terms/:kw/references
// 和 GET /api/terms/:id/snapshots) 已存在, 只需验证前端正确调用。
// ============================================================

describe('EditTermModal 右侧 tab', () => {
  let mockOnClose;
  let mockOnSaveSuccess;

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockOnSaveSuccess = vi.fn();
    mockFetch.mockReset();
  });

  const recordWithVersion = {
    recordId: 'rec-tm-1',
    id: 'rec-tm-1',
    versionId: 'ver-tm-1',
    kw: 'KW_TM_TEST',
    fields: { 'KW': 'KW_TM_TEST', 'CN（中文）': '测试TM' },
  };

  const fieldMap = { 'KW': 'f_kw', 'CN（中文）': 'f_cn' };
  const getRecordValue = (rec, fId) => {
    const inv = { f_kw: 'KW', f_cn: 'CN（中文）' };
    return rec.fields[inv[fId]] || '';
  };

  it('打开模态框时, 默认显示跨版本参考 tab 并调用 /references 端点', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ([
        { versionName: '海外 2.1', zh_cn: 'A', translations: { 'EN（英文）': 'A-en' }, owner: '王赵云', updatedAt: '2026-08-01' }
      ]),
    });

    render(
      <EditTermModal
        open={true}
        record={recordWithVersion}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/ver-tm-1/terms/KW_TM_TEST/references'),
        expect.anything()
      );
    });

    // 跨版本参考 tab 显示版本名
    expect(await screen.findByText('海外 2.1')).toBeInTheDocument();
  });

  it('点击"修改历史" tab: 调用 /snapshots 端点', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([]) })  // /references (default load)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ([
          { id: 'snap-1', termId: 'rec-tm-1', versionId: 'ver-tm-1', kw: 'KW_TM_TEST',
            zh_cn: '历史CN', translations: { 'EN（英文）': 'history-en' },
            createdAt: '2026-08-01T10:00:00Z', creatorName: '老王' }
        ]),
      });

    render(
      <EditTermModal
        open={true}
        record={recordWithVersion}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
      />
    );

    // 切到"修改历史" tab — 用 role=tab 定位避免歧义
    const historyTab = screen.getByRole('tab', { name: /修改历史/ });
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/terms/rec-tm-1/snapshots'),
        expect.anything()
      );
    });

    // 等到快照渲染 — 操作者字段包含 "老王"
    expect(await screen.findByText(/老王/)).toBeInTheDocument();
  });

  it('点击"套用此版"按钮: 把跨版本翻译灌入左侧编辑表单', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ([
        { versionName: '海外 2.1', zh_cn: '源CN', translations: { 'EN（英文）': 'source-en' }, owner: '王赵云', updatedAt: '2026-08-01' }
      ]),
    });

    render(
      <EditTermModal
        open={true}
        record={recordWithVersion}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
      />
    );

    // 等跨版本参考数据加载
    const applyBtn = await screen.findByText(/套用此版/);
    fireEvent.click(applyBtn);

    // EN 字段更新为 source-en
    await waitFor(() => {
      const enInput = screen.getByDisplayValue('source-en');
      expect(enInput).toBeInTheDocument();
    });
  });

  it('点击"回退"按钮: 弹出 confirm 并调用 /rollback 端点', async () => {
    // Mock window.confirm
    const origConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([]) })  // /references
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ([
          { id: 'snap-rb-1', termId: 'rec-tm-1', versionId: 'ver-tm-1',
            kw: 'KW_TM_TEST', zh_cn: '历史CN', translations: {},
            createdAt: '2026-08-01T10:00:00Z', creatorName: '老王' }
        ]),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });  // /rollback

    render(
      <EditTermModal
        open={true}
        record={recordWithVersion}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        targetLanguages={['EN（英文）']}
        onClose={mockOnClose}
        onSaveSuccess={mockOnSaveSuccess}
        currentUserRole="admin"  // 让 canRollback=true
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /修改历史/ }));
    const rollbackBtn = await screen.findByText('回退');
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/terms/rec-tm-1/rollback'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ snapshotId: 'snap-rb-1' }),
        })
      );
    });

    window.confirm = origConfirm;
  });
});