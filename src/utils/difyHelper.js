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
  
  if (data.status === 'failed') {
    throw new Error(`Dify 工作流内部执行失败: ${data.error || '未知错误'}`);
  }
  
  const outputs = data.data?.outputs;
  if (!outputs) {
    throw new Error('Dify 工作流未返回任何数据 (outputs为空)');
  }
  
  // Dify code node output returns the 'result' or 'translations' parameter as stringified JSON
  const resultStr = outputs.result || outputs.translations;
  if (!resultStr) {
    throw new Error('Dify 工作流未包含 result 或 translations 输出值，请检查 Dify 结束（End）节点的输出变量命名。');
  }
  
  try {
    const parsed = JSON.parse(resultStr);
    
    // Check if the Python node outputted an error
    if (parsed.error) {
      throw new Error(`Dify 清洗代码解析失败: ${parsed.error}. 原始生成为: ${parsed.raw_output || ''}`);
    }
    
    return parsed; // Example: { "英文": "Ride Paused", "法语": "Sortie en pause" }
  } catch (err) {
    throw new Error(`解析 Dify 输出 JSON 失败: ${err.message}. 原始输出为: ${resultStr}`);
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
      target_languages: '英文'
    };
    
    await runDifyWorkflow(baseUrl, apiKey, testInputs);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
