# 飞书多维表格自定义小组件（方案一）开发与部署指南

本指南详细描述了如何在飞书多维表格中实现并部署一个**自定义小组件（Base Extension）**，以承载 GlossaHub 词条管理与翻译平台。此方案完全不需要创建企业应用或通过企业管理员审批，完全基于当前登录用户的权限运行。

---

## 1. 什么是自定义小组件？

飞书多维表格自定义小组件是一种基于前端网页（React / Vue / HTML）的插件系统。它运行在飞书客户端或网页版多维表格的 `iframe` 沙箱中，通过飞书官方提供的 `@lark-base-open/js-sdk` 直接与当前表格进行数据双向交互。

---

## 2. 权限与安全机制

*   **无感鉴权**：小组件不需要配置 `App ID`、`App Secret`，也不需要获取 `Tenant Access Token`。
*   **权限继承**：小组件运行在用户的飞书客户端内，直接继承**当前操作用户的表格权限**：
    *   如果用户拥有该表格的编辑权限，小组件就可以读写数据。
    *   如果用户只有只读权限，小组件调用写入 API 时会报错拒绝。
*   **安全性**：数据操作完全符合飞书的权限模型，不会造成越权，且由于只在客户端运行，不会泄露企业全局凭证。

---

## 3. 开发与引入 SDK

小组件本质上是一个单页应用 (SPA)。只需要在前端项目中引入飞书 SDK：

### 安装 SDK
```bash
npm install @lark-base-open/js-sdk
```

### 初始化
在代码中引入并使用：
```javascript
import { bitable } from '@lark-base-open/js-sdk';

// 检查当前是否在多维表格环境中
const isSupported = bitable.isSupported();
```

---

## 4. 核心 SDK 代码参考

### 4.1 获取当前激活的表格与字段信息
```javascript
// 获取当前活跃的数据表
const activeTable = await bitable.base.getActiveTable();

// 获取所有字段的元信息（Field Meta List）
const fieldMetaList = await activeTable.getFieldMetaList();

// 建立“列名 -> 字段ID”的映射字典，用于精准读写
const fieldMap = {};
fieldMetaList.forEach(field => {
  fieldMap[field.name] = field.id;
});
// 示例输出: { "KW": "fld123456", "中文": "fld789101", "英文": "fld112131" }
```

### 4.2 读取未翻译的词条记录
```javascript
// 分页读取表格数据
let pageToken = undefined;
let hasMore = true;
const pendingTranslations = [];

while (hasMore) {
  const result = await activeTable.getRecordsByPage({ pageToken, pageSize: 200 });
  
  result.records.forEach(record => {
    const fields = record.fields;
    const kwValue = fields[fieldMap["KW"]];
    const zhValue = fields[fieldMap["中文"]];
    const englishValue = fields[fieldMap["英文"]]; // 用于判断是否未翻译
    
    // 如果中文存在，但英文缺失（或者其他语种缺失），加入翻译待处理列表
    if (zhValue && !englishValue) {
      pendingTranslations.push({
        recordId: record.recordId,
        kw: kwValue,
        zh_cn: zhValue,
        context: fields[fieldMap["所在页面"]] || "无"
      });
    }
  });
  
  hasMore = result.hasMore;
  pageToken = result.pageToken;
}
```

### 4.3 将翻译结果回写到多维表格
```javascript
// 假设 Dify 返回的 translations 为: { "英文": "Avg Speed", "法语": "Vit. Moyenne" }
async function saveTranslations(recordId, translations) {
  const fieldsToUpdate = {};
  
  // 遍历翻译结果，根据列名映射到对应的 fieldId
  Object.keys(translations).forEach(lang => {
    const fieldId = fieldMap[lang];
    if (fieldId) {
      fieldsToUpdate[fieldId] = translations[lang];
    }
  });
  
  // 写入多维表格
  await activeTable.setRecord(recordId, {
    fields: fieldsToUpdate
  });
}
```

---

## 5. 调试与部署流程

产品经理或开发人员可以通过以下步骤在飞书中加载并调试小组件：

### 步骤一：开启本地服务
在本地启动 Vite 服务（通常是 `http://localhost:5173`）。

### 步骤二：在飞书多维表格中启用小组件
1. 打开您的飞书多维表格。
2. 点击右上角的 **“小组件 (Extensions)”** 侧边栏按钮，点击 **“添加小组件”**。
3. 点击 **“创建小组件”**。
4. 输入名称（如：`GlossaHub 词条助手`），开发模式选择 **“本地开发 (Localhost)”**。
5. 输入本地开发地址 `http://localhost:5173`。
6. 点击确定后，飞书客户端中就会渲染您本地运行的网页，并能与表格数据实时调试。

### 步骤三：打包与线上发布
1. 调试完成后，运行项目打包命令：`npm run build`。
2. 在飞书小组件的配置页面，将开发模式切换为 **“线上部署 (Host Online)”**。
3. 上传打包生成的 `dist` 压缩包（包含 `index.html` 及编译后的 JS/CSS 静态资源）。
4. 点击发布，此后所有有权限查看该多维表格的协作者，都能在侧边栏直接打开使用该小组件。
