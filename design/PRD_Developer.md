# Product Requirement Document (PRD) - GlossaHub (Developer Edition)

This document specifies the technical and functional requirements for **GlossaHub**, a Translation & Version Management Platform for Magene. It is written specifically for a **Software Engineering AI Agent (like Codex or Antigravity)** to implement the application correctly.

---

## 1. Product Overview & Architecture

### 1.1 Product Definition
GlossaHub is a collaborative desktop PC Web application (Single Page Application) that serves as a central hub for translating, managing, and comparing Magene firmware term lists. It is a standalone web app hosted in a browser environment, replacing the old Feishu/Lark extension structure.

### 1.2 Tech Stack & Platform
*   **Frontend**: React 19 + Vite 8 + Tailwind CSS + Lucide Icons.
*   **Backend & Database (BaaS)**: **Supabase** / PostgreSQL.
    *   **Supabase Auth**: Managed user login, session states, and invite-only signups.
    *   **Supabase Database**: Relational PostgreSQL database tables.
    *   **Row-Level Security (RLS)**: Enforces access rules ensuring users can only read/edit projects they are invited to.
*   **Translation Engine**: **Dify Workflow API** (`POST /v1/workflows/run`). The app triggers Dify workflows to translate terms, and receives target values in a structured JSON string.

### 1.3 Configuration Storage
*   **Dify Engine Configurations**:
    *   *Option A (Local)*: Saved in the active user's browser `localStorage`.
    *   *Option B (Project Cloud)*: Encrypted in the cloud `projects` table (restricted to Project Owners for write permissions). Editor-level users can share the configured channel without re-entering keys.

---

## 2. Page Navigation & UI Layout (Widescreen PC Desktop)

The application is structured as a full-width desktop dashboard containing a Header, Navigation Tabs, Main Content Area, and a Status Footer.

```
+-----------------------------------------------------------------------------------------+
| Logo | GlossaHub (迈金词条助手)      [智能翻译] [版本对比] [成员管理] [设置]   User: xxx (Owner) |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|                                                                                         |
|                                     Main Content Area                                   |
|                                                                                         |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
| GlossaHub v0.2.0                                      [ Supabase Sync: Online (Green) ] |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Detailed Functional Modules

### 3.1 Tab 1: Smart Translation (智能翻译)
The primary workspace for viewing, editing, and bulk translating terms.

#### 1. Widescreen Data Grid
*   Display a paginated data table containing terms for the selected version.
*   **Frozen Columns**: The first two columns `KW` and `中文` must be sticky on the left side during horizontal scrolling.
*   Columns must include: `词条所在界面` (context), `KW` (key), `负责人` (developer), `中文` (source word), and 19 target language columns (`英文`, `法语`, `德语`, `西班牙语`, `意大利语`, `葡萄牙语`, `韩语`, `日语`, `俄语`, `波兰语`, `繁体中文`, `丹麦语`, `捷克语`, `瑞典语`, `挪威语`, `荷兰语`, `泰语`, `芬兰语`, `土耳其语`).
*   **Storage Mapping**: Target translations are retrieved from a database column named `translations` (PostgreSQL `JSONB` format).

#### 2. Toolbar & Filtering
*   **Project & Version Dropdowns**:
    *   Dropdown 1: Select/switch between available projects.
    *   Dropdown 2: Select/switch between numeric versions (e.g., `3.2`, `3.3`) in the active project.
*   **Search**: A search input filtering rows matching `KW` or `中文` (case-insensitive).
*   **Filter Untranslated**: A toggle switch showing only rows where one or more target language columns are empty inside the `translations` object.
*   **Actions** (Visibility dependent on RBAC):
    *   `新增词条` (Add Term) Button - Hidden for Viewers.
    *   `批量翻译` (Batch Translate) Button - Hidden for Viewers.
    *   `导入 CSV` (Import CSV) Button - Hidden for Viewers.
    *   `导出 CSV` (Export CSV) Button - Visible to all.

#### 3. Inline Edit Modal
*   Double-clicking a row or clicking its "Edit" action opens a dialog showing form inputs for all 15+ target languages side-by-side in a responsive grid layout.
*   Clicking "Save" writes the edited terms back to the cloud database (`terms` table).
*   **Concurrency Conflict check**: Before writing, verify if the term was updated by another user. If the term's `updated_at` on the database is newer than the client's loaded timestamp, display a warning: *"This term has been modified by another user. Please reload."*

#### 4. Batch Translate Flow
*   When clicking `批量翻译`, the app scans the current table in React state for rows matching search/filter constraints.
*   For each row with missing target language fields, the app calls the Dify Workflow API.
*   The results are previewed in a translation validation modal. The user can review, edit the values, and click "Confirm & Write to DB" to save the updates to the cloud database.

---

### 3.2 Tab 2: Version Comparison (版本对比)
Allows Git-like diff comparison between two firmware versions.

```
+----------------------------------------------------------------------------------+
| Source Version (源版本 A): [ 3.2 | v ]   Target Version (目标版本 B): [ 3.3 | v ] [对比] |
+----------------------------------------------------------------------------------+
| Filter: [ All ] [ Added (12) ] [ Modified (5) ] [ Deleted ]      [ Search... ]   |
+----------------------------------------------------------------------------------+
| KW            | 中文       | 英文               | 西班牙语           | Status      |
+---------------+------------+-------------------+-------------------+-------------+
| KW_SPEED      | 速度       | Speed             | Velocidad         | Unchanged   |
| [Green Row]   | 功率       | Power             | Potencia          | Added       |
| [Yellow Row]  | 气温       | Temp -> Air Temp  | Temp. -> Temp.    | Modified    |
+----------------------------------------------------------------------------------+
```

#### 1. Version Detection & Sort
*   Query versions from the selected project, filter for numeric names matching regex `/^\d+(\.\d+)?$/`, parse them as float values, and sort them in ascending order.
*   When a target version $V_{curr}$ is selected, the source version defaults to $V_{prev}$ (the predecessor in the sorted version array).

#### 2. Diff Calculation & Color Coding
*   Query all records from Version A and Version B. Compare them in memory by matching `KW`.
*   **Added Rows**: Rows present in Version B but not in Version A. Rendered with a light green background and an `Added` tag.
*   **Modified Rows**: Rows present in both versions, but containing different translation values in any language key inside the `translations` JSONB object. Rendered with a light yellow background and a `Modified` tag.
*   **Deleted Rows**: Rows present in Version A but not in Version B. Listed in a dedicated "Deleted terms" section or table rows with a red strikethrough and a `Deleted` tag.
*   **Fallback CSV**: A file upload button allowing the user to upload a CSV file representing Version A in case Version A has been deleted from the database.

---

### 3.3 Tab 3: Member Management (成员管理)
Accessible only by Project Owners to coordinate translation teams:
*   **Invite Members**: Input a user's email to add them to the project.
*   **Role Selection**: Choose the role for each member:
    *   `Owner`
    *   `Editor`
    *   `Viewer`
*   **Remove Member**: Remove user access from the current project.

---

### 3.4 Tab 4: Settings (设置)
Form fields to configure API credentials:
*   `Dify Base URL` (e.g. `https://api.dify.ai/v1`).
*   `Dify API Key` (Password-masked input).
*   `Test Connection` Button: Sends a dummy payload to the Dify workflow endpoint to verify setup. Displays success/error notifications.
*   **Encryption Scope**: Project Owners can choose to toggle "Save to Project Cloud" (sharing the key securely with team members) or "Save to LocalStorage".

---

## 4. Technical & Database Specifications

To implement this application, the frontend must interact with the Supabase client library `@supabase/supabase-js`.

### 4.1 Loading Version List
```javascript
const { data: versions, error } = await supabase
  .from('versions')
  .select('*')
  .eq('project_id', activeProjectId)
  .order('created_at', { ascending: true });
```

### 4.2 Loading Term Records (With Pagination & Search)
```javascript
let query = supabase
  .from('terms')
  .select('*')
  .eq('version_id', activeVersionId);

if (searchQuery) {
  query = query.or(`kw.ilike.%${searchQuery}%,zh_cn.ilike.%${searchQuery}%`);
}

const { data: terms, error } = await query.range(offset, offset + limit - 1);
```

### 4.3 Batch Writing Records (Upsert with Chunking)
Writing to Supabase in chunks of 200 records to prevent HTTP packet sizes from causing API gateways or function limits to reject requests:
```javascript
async function batchUpsertTerms(termsList) {
  const chunkSize = 200;
  for (let i = 0; i < termsList.length; i += chunkSize) {
    const chunk = termsList.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('terms')
      .upsert(chunk, { onConflict: 'version_id,kw' });
    if (error) throw error;
  }
}
```

### 4.4 Creating a Version Table & Dynamic Language Columns
When importing a CSV representing a new version $V_{new}$:
1.  **Duplicate Check**: Ensure $V_{new}$ does not already exist in the `versions` table.
2.  **Create Version Record**:
    ```javascript
    const { data: version, error } = await supabase
      .from('versions')
      .insert({ project_id: activeProjectId, version_name: versionString })
      .select()
      .single();
    ```
3.  **Insert Terms**: Read headers of the CSV. Build the terms array. Target languages not defined in default arrays are dynamically added into the `translations` JSONB object:
    ```javascript
    // Target translation mapping example
    const termRecord = {
      version_id: version.id,
      kw: csvRow['KW'],
      context: csvRow['词条所在界面'],
      owner: csvRow['负责人'],
      zh_cn: csvRow['中文'],
      translations: {
        '英文': csvRow['英文'] || '',
        '法语': csvRow['法语'] || '',
        // Other languages from CSV columns
      }
    };
    ```

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
        "term_id": "string",          // Mapped from 'KW'
        "zh_cn": "string",            // Mapped from '中文'
        "context": "string",          // Mapped from '词条所在界面'
        "target_languages": "string"  // Comma-separated Chinese language names, e.g. "英文,法语,德语"
      },
      "response_mode": "blocking",
      "user": "glossahub_user"
    }
    ```

### 5.2 Response Parsing
Dify returns `data.outputs.translations`. The system must parse this output as a JSON string containing the translations:
```javascript
const outputs = response.data.data.outputs;
const translationsObj = typeof outputs.translations === 'string' 
  ? JSON.parse(outputs.translations) 
  : outputs.translations;
// translationsObj format: { "英文": "...", "法语": "..." }
```

---

## 6. Implementation Deliverables Checklists (For AI Coding Agent)

When implementing the code, the Agent must ensure the following are complete:
- [ ] **State Management**: React context or hooks syncing current user session, active project, active version, search filters, and Dify config.
- [ ] **Database RLS Policies**: Ensure `project_members` is linked to RLS policies so users cannot read/write projects they are not part of.
- [ ] **Rate Limiting**: Add a `300ms` delay between consecutive Dify workflow calls when batch translating to prevent rate limit blocks.
- [ ] **Concurrency Lock**: Validate `updated_at` before term updates to alert editors if concurrent edits occur.
- [ ] **Error Handling**: Graceful warnings when CSV columns are misaligned, Supabase API requests fail, or Dify returns malformed JSON.
