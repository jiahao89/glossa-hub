# GlossaHub - 迈金词条智能翻译与版本管理平台 技术方案 (Technical Design)

## 1. 系统架构与免审逻辑

### 1.1 开发平台选择：飞书妙搭 (Mioda) 自定义组件
为了在企业内部提供流畅的系统体验，且**规避飞书开放平台（Lark Open Platform）企业管理员审核**的流程障碍，本项目采用飞书多维表格小组件（Bitable Extension Widget）开发模式。

```
+-------------------------------------------------------------+
| 飞书多维表格 (Feishu Base) 客户端 / 网页端                    |
|                                                             |
|   +-----------------------------------------------------+   |
|   | 妙搭 / 自定义组件容器 (Iframe Sandbox)              |   |
|   |                                                     |   |
|   |   +---------------------------------------------+   |   |
|   |   |   GlossaHub React 前端 Web 应用             |   |   |
|   |   |   (React 19 + Vite 8)                       |   |   |
|   |   |                                             |   |   |
|   |   |   - 调用 @lark-base-open/js-sdk             |   |   |
|   |   |   - 调用 Dify Workflow API 翻译词条         |   |   |
|   |   +---------------------------------------------+   |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

*   **免审机制原理**：
    1.  当应用开发为**独立 Web 应用**并采用后台 API 对接（如使用 `tenant_access_token` 获取多维表格数据）时，必须在开放平台注册企业自建应用、配置敏感权限（如读取多维表格数据），并必须提交至企业 IT 管理员处进行审核。
    2.  而使用**妙搭小组件**开发时，前端 React 应用作为一个静态网页被加载在飞书多维表格的 iframe 沙箱内。它通过 Web PostMessage 建立与飞书宿主环境的连接，利用飞书官方包 `@lark-base-open/js-sdk` 直接对当前表格进行操作。
    3.  此模式下，**插件直接继承当前正在查看该多维表格的飞书用户的个人权限**。如果该用户有编辑权限，插件就能读写；如果该用户是只读，插件则只读。整个过程无须配置任何 Client ID/Client Secret 密钥，也**完全不需要任何企业管理员审批**，对企业内网安全是零风险的。

---

## 2. 模块技术实现设计

### 2.1 飞书多维表格 JS-SDK 对接实现
妙搭自定义组件中，使用 `@lark-base-open/js-sdk` 对接表格的常用操作设计如下：

#### 1. 初始化 SDK 连接
在项目入口 `main.jsx` 中调用一次初始化，并在 React 组件中导入 `bitable` 实例：
```javascript
import { bitable } from '@lark-base-open/js-sdk';

// 插件启动时，SDK 会自动建立与飞书主容器的 JSON-RPC 双向桥接通道
```

#### 2. 读取当前 Base 内的所有子表（用于固件版本下拉菜单）
```javascript
async function getFirmwareVersions() {
  const tableMetaList = await bitable.base.getTableMetaList();
  // 过滤并排序只包含版本号的子表
  return tableMetaList
    .map(meta => ({
      id: meta.id,
      name: meta.name,
      versionNum: parseFloat(meta.name)
    }))
    .filter(meta => !isNaN(meta.versionNum))
    .sort((a, b) => a.versionNum - b.versionNum); // 升序排列
}
```

#### 3. 分页读取词条记录并建立 `KW` 字典
由于单次读取可能有限制，采用分页读取以保障稳定性：
```javascript
async function loadTableRecords(tableId) {
  const table = await bitable.base.getTableById(tableId);
  
  // 获取所有字段的 Name 到 ID 映射，写入数据时需使用 FieldId
  const fieldList = await table.getFieldMetaList();
  const fieldMap = {}; // name -> id
  fieldList.forEach(f => {
    fieldMap[f.name] = f.id;
  });

  let hasMore = true;
  let pageToken = undefined;
  let allRecords = [];

  while (hasMore) {
    const response = await table.getRecordsByPage({
      pageToken,
      pageSize: 200
    });
    allRecords = [...allRecords, ...response.records];
    hasMore = response.hasMore;
    pageToken = response.pageToken;
  }
  
  return { allRecords, fieldMap };
}
```

#### 4. 分批（Chunk）写入多维表格（规避飞书 API 超时）
导入 CSV 或批量回写 AI 翻译译文时，前端必须将大量记录切片为 200 条/组：
```javascript
async function batchWriteRecords(tableId, recordsToWrite) {
  const table = await bitable.base.getTableById(tableId);
  const chunkSize = 200;
  
  for (let i = 0; i < recordsToWrite.length; i += chunkSize) {
    const chunk = recordsToWrite.slice(i, i + chunkSize);
    await table.addRecords(chunk); // 批量插入
  }
}
```

---

### 2.2 Dify 工作流 (Workflow) 翻译接口集成

#### 1. Dify 工作流请求协议设计
前端妙搭组件在需要翻译时，会向用户配置的 Dify API Base URL 发送 `POST` 请求。

*   **请求地址 (Endpoint)**: `POST {DIFY_API_BASE}/workflows/run`
    *(例如官方 SaaS 地址为 `https://api.dify.ai/v1/workflows/run`)*
*   **请求头 (Headers)**:
    ```http
    Authorization: Bearer {DIFY_WORKFLOW_API_KEY}
    Content-Type: application/json
    ```
*   **请求体 (Request Payload)**:
    ```json
    ```json
    {
      "inputs": {
        "term_id": "KW_RIDE_PAUSED",
        "zh_cn": "骑行已暂停",
        "context": "表盘页面",
        "target_languages": "英文,法语,德语,西班牙语,意大利语,葡萄牙语,韩语,日语,俄语,波兰语,繁体中文,丹麦语,捷克语,瑞典语,挪威语,荷兰语,泰语,芬兰语,土耳其语"
      },
      "response_mode": "blocking",
      "user": "glossahub_client"
    }
    ```

#### 2. Dify 工作流响应数据结构
Dify 工作流在运行结束后，会返回一个包含 `outputs` 的 JSON 对象。其中的 `translations` 应为一个由 Dify 的 LLM 或代码节点生成的 JSON 字符串（或直接为 JSON 对象）：

*   **响应体 (Response Body)**:
    ```json
    {
      "workflow_run_id": "9a7b70d8-18e3-4bbf-89ea-c4d32098e980",
      "task_id": "d8e3bbf9-09ea-4c4d-9a7b-2098e980abdf",
      "data": {
        "id": "9a7b70d8-18e3-4bbf-89ea-c4d32098e980",
        "workflow_id": "e980abdf-18e3-4bbf-89ea-c4d32098e980",
        "status": "succeeded",
        "outputs": {
          "translations": "{\"英文\": \"Ride Paused\", \"法语\": \"Sortie en pause\", \"德语\": \"Fahrt pausiert\", \"西班牙语\": \"Recorrido pausado\", \"意大利语\": \"Corsa in pausa\", \"葡萄牙语\": \"Pedalada pausada\", \"韩语\": \"라이드 일시정지됨\", \"日语\": \"ライド一时停止\", \"俄语\": \"Заезд приостановлен\"}"
        },
        "error": null,
        "elapsed_time": 1.45
      }
    }
    ```

#### 3. 前端解析与容错处理
妙搭组件在接收到 Dify 响应后，执行如下逻辑解析翻译内容：
```javascript
function parseDifyResponse(responseBody) {
  try {
    const outputs = responseBody.data.outputs;
    let translationsObj = {};
    
    if (typeof outputs.translations === 'string') {
      // Dify 输出的是 stringified JSON，需要进行二次解析
      translationsObj = JSON.parse(outputs.translations);
    } else {
      // 已经是 JSON 对象
      translationsObj = outputs.translations;
    }
    
    return translationsObj;
  } catch (error) {
    console.error('Dify 响应数据解析失败:', error);
    throw new Error('Dify 返回的数据格式不符合预期，请检查工作流输出配置。');
  }
}
```

---

### 2.3 版本比对（Version Diff）算法实现
比对算法执行时，在前端内存中构建以 `KW` 为 Key 的哈希表：

```
Table A (源版本, 如 3.2)            Table B (目标版本, 如 3.3)
+-----------------------+           +-----------------------+
| Key: KW               |           | Key: KW               |
+-----------------------+           +-----------------------+
| KW_SPEED -> 中文:速度  |           | KW_SPEED -> 中文:速度  |  ===> Unchanged (未变)
| KW_CADENCE -> 中文:踏频|           | KW_CADENCE -> 中文:踏频|  ===> Unchanged (未变)
| KW_TEMP -> 中文:温度   |           | KW_TEMP -> 中文:气温   |  ===> Modified (修改, 中文变更)
| KW_HEART -> 中文:心率  |           |                       |  ===> Deleted (被删除)
|                       |           | KW_POWER -> 中文:功率  |  ===> Added (新增)
+-----------------------+           +-----------------------+
```

```javascript
export function calculateDiff(tableAData, tableBData) {
  const mapA = new Map(tableAData.map(item => [item.KW, item]));
  const mapB = new Map(tableBData.map(item => [item.KW, item]));

  const diffResult = [];

  // 1. 检查 Table B 中的所有词条（寻找“新增”与“修改”）
  for (const [kw, itemB] of mapB) {
    const itemA = mapA.get(kw);

    if (!itemA) {
      // 新增词条 (Added)
      diffResult.push({
        KW: kw,
        status: 'added',
        newData: itemB,
        oldData: null,
        changes: {}
      });
    } else {
      // 比对每个语种列内容是否一致
      const changes = {};
      let isModified = false;

      // 遍历 itemB 中除系统字段外的所有语种 Key
      Object.keys(itemB).forEach(key => {
        if (key !== '负责人' && key !== 'modified_by' && key !== 'modified_time' && key !== 'record_id') {
          const valA = itemA[key] || '';
          const valB = itemB[key] || '';
          if (valA !== valB) {
            isModified = true;
            changes[key] = { from: valA, to: valB };
          }
        }
      });

      if (isModified) {
        // 修改词条 (Modified)
        diffResult.push({
          KW: kw,
          status: 'modified',
          newData: itemB,
          oldData: itemA,
          changes: changes
        });
      } else {
        // 未改动词条 (Unchanged)
        diffResult.push({
          KW: kw,
          status: 'unchanged',
          newData: itemB,
          oldData: itemA,
          changes: {}
        });
      }
    }
  }

  // 2. 检查 Table A 中存在但 Table B 中没有的词条（寻找“已删除”）
  for (const [kw, itemA] of mapA) {
    if (!mapB.has(kw)) {
      diffResult.push({
        KW: kw,
        status: 'deleted',
        newData: null,
        oldData: itemA,
        changes: {}
      });
    }
  }

  return diffResult;
}
```

---

## 3. 安全合规与防超时设计
1.  **LocalStorage 本地隔离**：用户的 Dify API Key 不会通过任何后端中转，完全由本地沙箱 iframe 中的前端代码通过 `HTTPS` 直接向 Dify 地址发起 API 请求，满足公司内部审计合规性。
2.  **跨域说明**：Dify 自建服务需在其服务器配置中开启 `CORS`，以允许来自飞书客户端（通常源为 `https://*.feishu.cn`）的请求跨域访问。
3.  **大批数据分片机制**：对于 2000 行以上的 CSV 导入，前端将通过 `FileReader` 先将 CSV 读入内存数组，再以 200 条为一组异步轮询写入多维表格。在分批写入时，前台界面提供环形进度条（Progress Indicator）进行视觉友好提示，避免用户误触关闭。
