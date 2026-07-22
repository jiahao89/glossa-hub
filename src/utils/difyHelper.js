/**
 * Sends a blocking request to the Dify Workflow execution API.
 * Parses and returns the formatted translations object.
 * 
 * @param {string} baseUrl - The Dify API base URL (e.g., https://api.dify.ai/v1).
 * @param {string} apiKey - The Authorization Bearer API Key.
 * @param {object} inputs - The input variables object (KW, text, 所在页面, 语种).
 * @returns {Promise<object>} Returns a translations object, e.g. { "英文": "Speed", "法语": "Vitesse" }.
 */
export async function runDifyWorkflow(baseUrl, apiKey, inputs) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const url = `${cleanBaseUrl}/workflows/run`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      inputs,
      response_mode: 'blocking',
      user: 'glossahub_bitable_plugin'
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorText);
    } catch {
      parsedError = null;
    }
    const message = parsedError?.message || parsedError?.error || errorText;
    throw new Error(`Dify API 请求失败 (${response.status}): ${message}`);
  }
  
  const data = await response.json();
  
  const workflowStatus = data.data?.status || data.status;
  const workflowError = data.data?.error || data.error;
  if (workflowStatus === 'failed' || workflowStatus === 'stopped') {
    throw new Error(`Dify 工作流执行失败 (status: ${workflowStatus}): ${workflowError || '未知错误，请检查 Dify 工作流日志'}`);
  }
  
  let outputs = data.data?.outputs || data.outputs;
  if (!outputs || typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
    if (data.data?.result || data.result) {
      outputs = { result: data.data?.result || data.result };
    } else if (data.data?.text || data.text) {
      outputs = { text: data.data?.text || data.text };
    } else if (data.data?.answer || data.answer) {
      outputs = { answer: data.data?.answer || data.answer };
    } else if (data.data?.response || data.response) {
      outputs = { response: data.data?.response || data.response };
    } else if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      outputs = data.data;
    } else {
      outputs = data;
    }
  }

  if (!outputs || typeof outputs !== 'object') {
    throw new Error(`Dify 工作流未返回任何有效数据。原始响应: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const outputKeys = Object.keys(outputs);
  if (outputKeys.some(k => k.includes('英') || k.includes('法') || k.includes('德') || k.includes('日') || k.includes('EN') || k.includes('FR') || k.includes('CN') || k.includes('中文'))) {
    return outputs;
  }

  let rawVal = outputs.result || outputs.translations || outputs.output || outputs.text || outputs.answer || outputs.response || outputs.res || outputs.data || outputs.json;
  if (rawVal === undefined && outputKeys.length === 1) {
    rawVal = outputs[outputKeys[0]];
  }

  if (rawVal === undefined) {
    for (const key of outputKeys) {
      const val = outputs[key];
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        rawVal = val;
        break;
      }
    }
  }

  if (rawVal === undefined || rawVal === null) {
    throw new Error(`Dify 工作流未包含有效输出变量 (当前输出字段为: ${outputKeys.join(', ') || '无'}). 原始响应片段: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // If already an object
  if (typeof rawVal === 'object') {
    if (rawVal.error) {
      throw new Error(`Dify 代码节点抛出错误: ${rawVal.error}`);
    }
    return rawVal;
  }

  // Parse stringified JSON
  try {
    const parsed = JSON.parse(String(rawVal));
    if (parsed && typeof parsed === 'object' && parsed.error) {
      throw new Error(`Dify 清洗代码解析失败: ${parsed.error}. 原始生成为: ${parsed.raw_output || ''}`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`解析 Dify 输出 JSON 失败: ${err.message}. 原始输出为: ${rawVal}`);
  }
}

/**
 * Tests the Dify Workflow connection by sending a lightweight test payload.
 * 
 * @param {string} baseUrl - Dify API base URL.
 * @param {string} apiKey - Dify API Key.
 * @returns {Promise<{success: boolean, error?: string}>} Connection test results.
 */
export async function testDifyConnection(baseUrl, apiKey) {
  try {
    const testInputs = {
      KW: 'KW_CONNECTION_TEST',
      text: '测试',
      context: '设置',
      target_languages: 'EN（英文）'
    };
    
    await runDifyWorkflow(baseUrl, apiKey, testInputs);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
