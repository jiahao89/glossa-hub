import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../Toast';
import TranslationTab from '../TranslationTab';
import AddTermModal from '../AddTermModal';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const createLocalStorageMock = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });

const SAMPLE_LANGUAGES = [
  { lang_name: 'EN（英文）' },
  { lang_name: 'FR（法）' },
  { lang_name: '泰语' },
];

const TABLES = [
  { id: 'tbl-br-light', name: 'BR Light' },
  { id: 'tbl-other', name: 'Other Version' },
];

function setupApiMock({ recordsByTable } = {}) {
  const defaultRecords = {
    'tbl-br-light': [
      {
        id: 'rec-9',
        recordId: 'rec-9',
        status: 'DRAFT',
        fields: {
          KW: 'KW_OFF',
          'CN（中文）': '关闭',
          'EN（英文）': 'off',
          'FR（法）': 'Arrêt',
          '泰语': '',
        },
      },
      {
        id: 'rec-10',
        recordId: 'rec-10',
        status: 'DRAFT',
        fields: {
          KW: 'KW_RADAR',
          'CN（中文）': '雷达',
          'EN（英文）': 'Radar',
          'FR（法）': 'Radar',
          '泰语': '',
        },
      },
      {
        id: 'rec-11',
        recordId: 'rec-11',
        status: 'DRAFT',
        fields: {
          KW: 'KW_ON',
          'CN（中文）': '开启',
          'EN（英文）': 'On',
          'FR（法）': 'Marche',
          '泰语': 'เปิด',
        },
      },
    ],
    'tbl-other': [
      {
        id: 'rec-o1',
        recordId: 'rec-o1',
        status: 'DRAFT',
        fields: {
          KW: 'KW_START',
          'CN（中文）': '开始',
          'EN（英文）': 'Start',
          'FR（法）': 'Démarrer',
          '泰语': '',
        },
      },
    ],
  };

  const map = recordsByTable || defaultRecords;

  mockFetch.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/languages')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => SAMPLE_LANGUAGES });
    }
    if (u.includes('/dify')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) });
    }
    if (u === '/api/tables') {
      return Promise.resolve({ ok: true, status: 200, json: async () => TABLES });
    }
    if (u.includes('/api/tables/')) {
      const tableId = u.split('/api/tables/')[1].split('/')[0];
      const list = map[tableId] || [];
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ records: list, total: list.length }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

describe('Batch translate excluded-language deadlock & isolation', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    setupApiMock();
  });

  it('opens BatchTranslateModal instead of falsely claiming all translated when remaining missing language is excluded, and lets user restore it', async () => {
    localStorageMock.setItem('glossa_last_selected_table_id', 'tbl-br-light');
    localStorageMock.setItem('glossa_excluded_translate_langs_tbl-br-light', JSON.stringify(['泰语']));

    render(
      <ToastProvider>
        <TranslationTab difyConnected={true} projectRole="owner" selectedTableId="tbl-br-light" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('关闭')).toBeInTheDocument();
    });

    // Toolbar visibly surfaces the active exclusion and allows direct reset
    expect(screen.getByText(/已排除:\s*泰语\s*·\s*恢复/)).toBeInTheDocument();

    // Select row #9 (关闭) and row #10 (雷达), both missing only 泰语
    const row9 = screen.getByText('关闭').closest('tr');
    const row10 = screen.getByText('雷达').closest('tr');
    fireEvent.click(row9.querySelector('input[type="checkbox"]'));
    fireEvent.click(row10.querySelector('input[type="checkbox"]'));

    // Click "AI 翻译所选 (2)"
    fireEvent.click(screen.getByText('AI 翻译所选 (2)').closest('button'));

    // Must NOT show false completion toast; must open BatchTranslateModal with guidance
    await waitFor(() => {
      expect(screen.getByText(/🌐 翻译语种范围/)).toBeInTheDocument();
    });
    expect(screen.queryByText('选中的词条在当前翻译语种范围内均已完成翻译')).not.toBeInTheDocument();
    expect(screen.getAllByText(/当前范围无待译（已排除：泰语）/).length).toBe(2);

    const startBtn = screen.getByRole('button', { name: /开始 Dify 翻译 \(0\)/ });
    expect(startBtn).toBeDisabled();

    // User clicks "✓ 恢复包含泰语" right inside the modal
    fireEvent.click(screen.getByRole('button', { name: /恢复包含泰语/ }));

    // Missing language immediately becomes 泰语 and button becomes clickable for 2 rows
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /开始 Dify 翻译 \(2\)/ })).not.toBeDisabled();
    });
    expect(localStorageMock.getItem('glossa_excluded_translate_langs_tbl-br-light')).toBeNull();
  });

  it('ignores legacy global excluded key and isolates exclusions strictly per table', async () => {
    localStorageMock.setItem('glossa_excluded_translate_langs', JSON.stringify(['泰语']));
    localStorageMock.setItem('glossa_excluded_translate_langs_tbl-other', JSON.stringify(['泰语']));

    render(
      <ToastProvider>
        <TranslationTab difyConnected={true} projectRole="owner" selectedTableId="tbl-br-light" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('关闭')).toBeInTheDocument();
    });

    // Legacy global key must be cleaned and NOT infect tbl-br-light
    expect(localStorageMock.getItem('glossa_excluded_translate_langs')).toBeNull();
    expect(screen.queryByText(/已排除:/)).not.toBeInTheDocument();

    // Selecting row #9 directly sees 泰语 as active missing language
    const row9 = screen.getByText('关闭').closest('tr');
    fireEvent.click(row9.querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByText('AI 翻译所选 (1)').closest('button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /开始 Dify 翻译 \(1\)/ })).not.toBeDisabled();
    });
  });

  it('shows accurate completion toast only when all target languages are genuinely translated', async () => {
    render(
      <ToastProvider>
        <TranslationTab difyConnected={true} projectRole="owner" selectedTableId="tbl-br-light" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('开启')).toBeInTheDocument();
    });

    // Row #11 (开启) has all 3/3 languages filled
    const row11 = screen.getByText('开启').closest('tr');
    fireEvent.click(row11.querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByText('AI 翻译所选 (1)').closest('button'));

    await waitFor(() => {
      expect(screen.getByText('选中的词条全部语种均已完成翻译')).toBeInTheDocument();
    });
    expect(screen.queryByText(/🌐 翻译语种范围/)).not.toBeInTheDocument();
  });

  it('surfaces excluded languages inside AddTermModal and explains exclusions when active langs are filled', async () => {
    const onReset = vi.fn();
    render(
      <ToastProvider>
        <AddTermModal
          open={true}
          onClose={vi.fn()}
          selectedTableId="tbl-br-light"
          targetLanguages={['EN（英文）', 'FR（法）', '泰语']}
          excludedTranslateLangs={new Set(['泰语'])}
          onResetExcludedLangs={onReset}
          onAddSuccess={vi.fn()}
        />
      </ToastProvider>
    );

    expect(screen.getByText('已排除：泰语')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复全部' }));
    expect(onReset).toHaveBeenCalledTimes(1);

    // Fill Chinese, EN, and FR, leaving excluded 泰语 empty -> toast must mention 泰语 is excluded
    fireEvent.change(screen.getByPlaceholderText('请输入中文源文本...'), { target: { value: '关闭' } });
    const inputs = screen.getAllByRole('textbox');
    const enField = inputs.find(i => i.closest('.form-group')?.textContent.includes('EN（英文）'));
    const frField = inputs.find(i => i.closest('.form-group')?.textContent.includes('FR（法）'));
    fireEvent.change(enField, { target: { value: 'off' } });
    fireEvent.change(frField, { target: { value: 'Arrêt' } });

    fireEvent.click(screen.getByText('一键 AI 翻译').closest('button'));
    await waitFor(() => {
      expect(screen.getByText(/当前翻译范围内语种均已有翻译（已排除：泰语）/)).toBeInTheDocument();
    });
  });

  it('fills Thai translation when backend returns TH code', async () => {
    mockFetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/languages')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => SAMPLE_LANGUAGES });
      }
      if (u.includes('/dify')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) });
      }
      if (u === '/api/tables') {
        return Promise.resolve({ ok: true, status: 200, json: async () => TABLES });
      }
      if (u.includes('/api/tables/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            records: [
              {
                id: 'rec-9',
                recordId: 'rec-9',
                status: 'DRAFT',
                fields: { KW: 'KW_OFF', 'CN（中文）': '关闭', 'EN（英文）': 'off', 'FR（法）': 'Arrêt', '泰语': '' },
              },
            ],
            total: 1,
          }),
        });
      }
      if (u.includes('/ai-translate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ TH: 'ปิด' }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    render(
      <ToastProvider>
        <TranslationTab difyConnected={true} projectRole="owner" selectedTableId="tbl-br-light" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('关闭')).toBeInTheDocument();
    });

    const row9 = screen.getByText('关闭').closest('tr');
    fireEvent.click(row9.querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByText('AI 翻译所选 (1)').closest('button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /开始 Dify 翻译 \(1\)/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /开始 Dify 翻译 \(1\)/ }));

    await waitFor(() => {
      expect(screen.getByText('ปิด')).toBeInTheDocument();
      expect(screen.getByText(/批量翻译全部完成/)).toBeInTheDocument();
    });
  });

  it('surfaces per-row errorReason when backend omits requested Thai translation', async () => {
    mockFetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/languages')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => SAMPLE_LANGUAGES });
      }
      if (u.includes('/dify')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) });
      }
      if (u === '/api/tables') {
        return Promise.resolve({ ok: true, status: 200, json: async () => TABLES });
      }
      if (u.includes('/api/tables/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            records: [
              {
                id: 'rec-10',
                recordId: 'rec-10',
                status: 'DRAFT',
                fields: { KW: 'KW_RADAR', 'CN（中文）': '雷达', 'EN（英文）': 'Radar', 'FR（法）': 'Radar', '泰语': '' },
              },
            ],
            total: 1,
          }),
        });
      }
      if (u.includes('/ai-translate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ EN: 'Radar' }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    render(
      <ToastProvider>
        <TranslationTab difyConnected={true} projectRole="owner" selectedTableId="tbl-br-light" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('雷达')).toBeInTheDocument();
    });

    const row10 = screen.getByText('雷达').closest('tr');
    fireEvent.click(row10.querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByText('AI 翻译所选 (1)').closest('button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /开始 Dify 翻译 \(1\)/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /开始 Dify 翻译 \(1\)/ }));

    await waitFor(() => {
      expect(screen.getByText(/AI 未返回目标语种（泰语）的有效译文/)).toBeInTheDocument();
    });
  });
});
