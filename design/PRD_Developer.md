# Product Requirement Document (PRD) - GlossaHub (Developer Edition)

This document specifies the requirements for **GlossaHub**, a Translation & Version Management Extension for Feishu/Lark Bitable (多维表格). It is written specifically for a **Software Engineering AI Agent (like Codex or Antigravity)** to implement the application correctly.

---

## 1. Product Overview & Architecture

### 1.1 Product Definition
GlossaHub is a widescreen desktop PC Web application designed to run as a **Feishu Bitable Custom Extension (多维表格自定义小组件)**. It is embedded directly within a Feishu Bitable dashboard, running inside an iframe sandbox.

### 1.2 Target Platform & Security Context
*   **Platform**: Client-side Single Page Application (React 19 + Vite 8).
*   **Data Integration**: Connects to the host Bitable using `@lark-base-open/js-sdk`.
*   **Security & Permissions**: The application inherits the active user's Bitable read/write permissions directly. It must not require enterprise administrator approval (avoiding global tenant OAuth apps).
*   **Configuration Storage**: All API credentials (API Keys, Endpoints) must be saved strictly in the user's browser `localStorage` and never transmitted to any third-party server besides the translation endpoint.

### 1.3 Translation Engine
*   **Engine**: **Dify Workflow API** (`POST /v1/workflows/run`). The extension sends the term ID, source text, context, and target languages, and receives translated values in structured JSON.

---

## 2. Page Navigation & UI Layout (Widescreen PC Desktop)

The application is structured as a full-width desktop dashboard containing a Header, Navigation Tabs, Main Content Area, and a Status Footer.

```
+----------------------------------------------------------------------------------+
| Logo | GlossaHub (迈金词条助手)                     [智能翻译] [版本对比] [引擎设置] |
+----------------------------------------------------------------------------------+
|                                                                                  |
|                                                                                  |
|                               Main Content Area                                  |
|                                                                                  |
|                                                                                  |
+----------------------------------------------------------------------------------+
| GlossaHub v1.0.0 © Magene                                [ AI 引擎已配置 (Green) ] |
+----------------------------------------------------------------------------------+
```

---

## 3. Detailed Functional Modules

### 3.1 Tab 1: Smart Translation (智能翻译)
The primary workspace for viewing and translating terms.

#### 1. Widescreen Data Grid
*   Display a data table with all columns from the selected Bitable table.
*   **Frozen Columns**: The first two columns `term_id` and `zh_cn` must be sticky on the left side during horizontal scrolling.
*   Columns must include: `term_id`, `zh_cn`, `context`, and target language columns (e.g. `en_us`, `es_es`, `de_de`, `fr_fr`, `it_it`, `ja_jp`, `ko_kr`, etc.).
*   Columns for `modified_by` (Lark User Field) and `modified_time` (Lark Date Field) must be shown at the right.

#### 2. Toolbar & Filtering
*   **Table Selector**: A dropdown menu displaying available version tables (e.g., `3.2`, `3.3`) in the active Bitable Base.
*   **Search**: A search input filtering rows matching `term_id` or `zh_cn` (case-insensitive).
*   **Filter Untranslated**: A toggle switch showing only rows where one or more target language columns are empty.
*   **Actions**:
    *   `新增词条` (Add Term) Button.
    *   `批量翻译` (Batch Translate) Button.
    *   `导入 CSV` (Import CSV) Button.
    *   `导出 CSV` (Export CSV) Button.

#### 3. Inline Edit Modal (Double-Click / Edit Icon)
*   Double-clicking a row or clicking its "Edit" action opens a dialog showing form inputs for all 15+ target languages side-by-side in a responsive grid layout.
*   Clicking "Save" writes the edited terms back to the Bitable table via the SDK.

#### 4. Batch Translate Flow
*   When clicking `批量翻译`, the app scans the current table in React state for rows matching search/filter constraints.
*   For each row with missing target language fields, the app calls the Dify Workflow API.
*   The results are previewed in a translation validation modal. The user can review, edit the values, and click "Confirm & Write to Base" to save the updates to Bitable.

---

### 3.2 Tab 2: Version Comparison (版本对比)
Allows Git-like diff comparison between two firmware versions.

```
+----------------------------------------------------------------------------------+
| Source Table (源版本 A): [ 3.2 | v ]   Target Table (目标版本 B): [ 3.3 | v ] [对比]  |
+----------------------------------------------------------------------------------+
| Filter: [ All ] [ Added (12) ] [ Modified (5) ] [ Unchanged ]    [ Search... ]   |
+----------------------------------------------------------------------------------+
| term_id       | zh_cn      | en_us             | es_es             | Status      |
+---------------+------------+-------------------+-------------------+-------------+
| lbl_speed     | 速度       | Speed             | Velocidad         | Unchanged   |
| [Green Row]   | 功率       | Power             | Potencia          | Added       |
| [Yellow Row]  | 气温       | Temp -> Air Temp  | Temp. -> Temp.    | Modified    |
+----------------------------------------------------------------------------------+
```

#### 1. Version Table Detection & Sort
*   The app must query Bitable tables, filter for those with numeric version names (e.g., matching regex `/^\d+(\.\d+)?$/`), parse them as float values, and sort them in ascending order.
*   When a target version $V_{curr}$ is selected, the source version defaults to $V_{prev}$ (the predecessor in the sorted version array).

#### 2. Diff Calculation & Color Coding
*   Query all records from Table A and Table B. Compare them in memory by matching `term_id`.
*   **Added Rows**: Rows present in Table B but not in Table A. Rendered with a light green background and an `Added` tag.
*   **Modified Rows**: Rows present in both tables, but containing different translation values in any language column. Rendered with a light yellow background and a `Modified` tag.
*   **Deleted Rows**: Rows present in Table A but not in Table B. Listed under a "Deleted terms" summary list.
*   **Fallback CSV**: A file upload button allowing the user to upload a CSV file representing Table A in case Table A has been deleted from Bitable.

---

### 3.3 Tab 3: Engine Settings (引擎设置)
Form fields to configure API credentials, saved in `localStorage`:
*   `Dify Base URL` (e.g. `https://api.dify.ai/v1`).
*   `Dify API Key` (Password-masked input).
*   `Test Connection` Button: Sends a dummy payload (`zh_cn: "速度"`) to the Dify workflow endpoint to verify setup. Displays success/error notifications.

---

## 4. Technical & SDK Interface Specifications

To implement this extension, the code must call the `@lark-base-open/js-sdk` interfaces.

### 4.1 Reading Table Meta List
List all tables in the current Bitable Base:
```javascript
const tableMetaList = await bitable.base.getTableMetaList();
```

### 4.2 Reading Table Records (With Pagination & Field ID mapping)
To fetch records and construct column mappings:
```javascript
const table = await bitable.base.getTableById(tableId);
const fieldMetaList = await table.getFieldMetaList();
const fieldMap = {}; // mapping fieldName -> fieldId
fieldMetaList.forEach(f => {
  fieldMap[f.name] = f.id;
});

let pageToken = undefined;
let hasMore = true;
let allRecords = [];

while (hasMore) {
  const result = await table.getRecordsByPage({ pageToken, pageSize: 200 });
  allRecords = [...allRecords, ...result.records];
  hasMore = result.hasMore;
  pageToken = result.pageToken;
}
```

### 4.3 Batch Writing Records (Chunked)
Writing to Bitable in chunks of 200 records to prevent API request timeouts:
```javascript
async function writeRecords(tableId, recordsList) {
  const table = await bitable.base.getTableById(tableId);
  const chunkSize = 200;
  for (let i = 0; i < recordsList.length; i += chunkSize) {
    const chunk = recordsList.slice(i, i + chunkSize);
    await table.addRecords(chunk);
  }
}
```

### 4.4 Creating a Version Table & Dynamic Language Columns
When importing a CSV representing a new version $V_{new}$:
1.  **Strict Increment Validation**: Ensure $V_{new} > \max(V_{existing})$.
2.  **Create Table**:
    ```javascript
    const { tableId } = await bitable.base.addTable({ name: versionString });
    const table = await bitable.base.getTableById(tableId);
    ```
3.  **Add Predefined Columns**: Create `term_id`, `zh_cn`, `context` as text fields.
    ```javascript
    await table.addField({ name: 'term_id', type: 1 }); // Type 1 is Text
    await table.addField({ name: 'zh_cn', type: 1 });
    await table.addField({ name: 'context', type: 1 });
    ```
4.  **Add Dynamic Columns**: Read headers of the CSV. If any language code (e.g. `it_it`) is not in the current table field list, call `table.addField({ name: 'it_it', type: 1 })` to append it at the right.

### 4.5 CSV Export with UTF-8 BOM
To support Windows Excel readability:
*   Prepend the BOM char `\ufeff` to the CSV string:
    ```javascript
    const csvContent = '\ufeff' + csvString;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    ```

---

## 5. Dify Workflow Integration Specification

### 5.1 Request Specification
*   **URL**: `POST {DIFY_BASE_URL}/workflows/run`
*   **Headers**:
    *   `Authorization`: `Bearer {DIFY_API_KEY}`
    *   `Content-Type`: `application/json`
*   **Body**:
    ```json
    {
      "inputs": {
        "term_id": "string",
        "zh_cn": "string",
        "context": "string",
        "target_languages": "string" // comma-separated e.g. "en_us,es_es,de_de"
      },
      "response_mode": "blocking",
      "user": "glossahub_user"
    }
    ```

### 5.2 Response Parsing
Dify returns `data.outputs.translations`. The agent must parse this output as a JSON string containing the translations:
```javascript
const outputs = response.data.data.outputs;
const translations = typeof outputs.translations === 'string' 
  ? JSON.parse(outputs.translations) 
  : outputs.translations;
// format: { "en_us": "...", "es_es": "..." }
```

---

## 6. Implementation Deliverables Checklists (For AI Coding Agent)

When implementing the code, the Agent must ensure the following are complete:
- [ ] **State Management**: React context or hooks syncing current version data, search filters, and local settings.
- [ ] **CSS Style System**: High-fidelity dark mode matching the Obsidian design system (charcoal gray `#131315`, neon blue `#00f2ff`, and glassmorphic backdrop filters).
- [ ] **Rate Limiting**: Add a `300ms` delay between consecutive Dify workflow calls when batch translating to prevent rate limit blocks.
- [ ] **Error Handling**: Graceful warnings when CSV columns are misaligned, Bitable API requests fail, or Dify returns malformed JSON.
