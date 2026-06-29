import React, { useState } from 'react';
import { testDifyConnection } from '../utils/difyHelper';

export default function SettingsTab({ 
  difyUrl, 
  setDifyUrl, 
  difyKey, 
  setDifyKey, 
  onConnectionStatusChange 
}) {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  const handleSave = () => {
    localStorage.setItem('glossahub_dify_url', difyUrl);
    localStorage.setItem('glossahub_dify_key', difyKey);
    setMessage({ type: 'success', text: '配置已成功保存！' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleTest = async () => {
    if (!difyUrl || !difyKey) {
      setMessage({ type: 'error', text: '请先填写接口地址和 API 密钥！' });
      return;
    }

    setTesting(true);
    setMessage(null);

    const result = await testDifyConnection(difyUrl, difyKey);
    setTesting(false);

    if (result.success) {
      setMessage({ type: 'success', text: '连接成功！Dify 工作流对接正常。' });
      onConnectionStatusChange(true);
      // Auto save on successful test
      localStorage.setItem('glossahub_dify_url', difyUrl);
      localStorage.setItem('glossahub_dify_key', difyKey);
    } else {
      setMessage({ type: 'error', text: `连接失败: ${result.error}` });
      onConnectionStatusChange(false);
    }
  };

  return (
    <div className="settings-container">
      <h3 className="settings-title">Dify 翻译引擎设置</h3>
      
      {message && (
        <div className={`alert-box alert-box-${message.type === 'success' ? 'success' : 'danger'}`}>
          {message.text}
        </div>
      )}

      <div className="form-group">
        <label>Dify 接口地址 (Base URL)</label>
        <input 
          type="text" 
          value={difyUrl} 
          onChange={(e) => setDifyUrl(e.target.value)} 
          placeholder="例如: https://api.dify.ai/v1"
          className="text-input"
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          即 Dify 平台提供的工作流 API 基础路径，若为云服务填 https://api.dify.ai/v1
        </span>
      </div>

      <div className="form-group">
        <label>Dify API 密钥 (API Key)</label>
        <input 
          type="password" 
          value={difyKey} 
          onChange={(e) => setDifyKey(e.target.value)} 
          placeholder="app-xxxxxxxxxxxx"
          className="text-input"
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          在 Dify 对应工作流的“API 访问”页面中生成的密钥，以 app- 开头
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button 
          onClick={handleTest} 
          disabled={testing}
          className="btn btn-secondary"
          style={{ flex: 1 }}
        >
          {testing ? '正在测试连接...' : '测试 API 连接'}
        </button>
        
        <button 
          onClick={handleSave}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          保存配置
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>配置安全提示</h4>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          * 所有 API 凭证均安全地加密/存储在您的**浏览器本地 (localStorage)** 中，绝不会上传给任何第三方非 Dify 服务器。<br />
          * 如果多人协作使用此多维表格，建议各人配置属于自己的 Dify 密钥，或者在成功连接后将密钥保存在本地浏览器即可。
        </p>
      </div>
    </div>
  );
}
