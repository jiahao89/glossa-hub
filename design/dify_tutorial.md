# GlossaHub - Dify 翻译工作流配置教程

本教程旨在指导您如何从零开始，在 **Dify** 中配置一个专为 **迈金（Magene）智能骑行码表** 词条设计的翻译工作流（Workflow），并在 GlossaHub 插件中完成对接。

---

## 1. 为什么使用 Dify 工作流？
1. **词条语境（Context）控制强**：骑行码表屏幕空间极其有限，直译往往会导致 UI 溢出（例如 “平均速度” 翻译为 “Average Speed” 会超出格子，骑行界通常缩写为 “Avg Speed”）。Dify 工作流能够注入专业的骑行领域字典与缩写约束。
2. **格式稳定**：通过在 Dify 中加入 Python / JS 代码过滤节点，可以百分百确保输出的是纯净的 JSON，避免大模型输出 Markdown 标记（如 ` ```json `）导致前端解析崩溃。
3. **接口扩展性高**：未来如果您想更换大模型（如从 DeepSeek 切换到 GPT-4o），只需在 Dify 后台修改，无须修改和发布妙搭插件代码。

---

## 2. 步骤一：在 Dify 创建工作流应用
1. 登录您的 Dify 系统（官方云服务为 [dify.ai](https://dify.ai/)，或您企业私有化部署的地址）。
2. 在主页点击 **“创建空白应用”**。
3. 在弹窗中选择 **“工作流 (Workflow)”**。
4. 命名为：`GlossaHub 词条智能翻译工作流`，点击 **“创建”** 进入画布编辑器。

---

## 3. 步骤二：配置“开始”节点（Start Node）
开始节点定义了 GlossaHub 插件发送过来的入参。请在开始节点右侧，点击 **“添加输入变量”**，依次添加以下 4 个变量：

| 变量标识 (Key) | 变量类型 (Type) | 是否必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `term_id` | 单行文本 (Short Text) | 否 | 词条唯一标识（对应 KW 字段，如 `KW_RIDE_PAUSED`） |
| `zh_cn` | 段落文本 (Paragraph) | 是 | 需要翻译的中文源词（对应 中文 字段，如 `骑行已暂停`） |
| `context` | 段落文本 (Paragraph) | 否 | 词条的上下文描述（对应 `词条所在界面（注意是界面不是模块！！）` 字段，如 `表盘页面`） |
| `target_languages` | 段落文本 (Paragraph) | 是 | 逗号分隔的目标语种列表（使用中文名称，如 `英文,法语,德语`） |

---

## 4. 步骤三：配置“LLM”节点（翻译核心）
在“开始”节点右侧点击 **`+`** 按钮，插入一个 **“LLM 节点”**。

1. **选择模型**：推荐选择具有较强推理和遵循指令能力的模型（如 `deepseek-chat / deepseek-coder`，或者 `gpt-4o`）。
2. **设置 Temperature（温度）**：推荐设为 `0.2`（较低的温度可保证翻译的一致性，防止大模型胡思乱想）。
3. **编写 Prompt（提示词）**：
   请复制以下精心调优的 Prompt 粘贴到 LLM 节点的 SYSTEM / USER 提示词框中：

```text
你是一个精通自行车运动、GPS骑行码表及相关配件的专业软件国际化翻译专家。
现在，请你翻译下方输入的中文词条。

### 核心翻译原则：
1. 【行业专有名词】：必须符合自行车运动的行业规范。
   * 踏频 -> Cadence
   * 坡度 -> Slope 或 Grade (切勿翻译为 chemistry 领域的 Gradient)
   * 功率 -> Power
   * 速度 -> Speed
   * 距离 -> Distance
   * 卡路里 -> Calories
   * 心率 -> Heart Rate (或缩写 HR)
2. 【大屏UI空间约束】：自行车码表屏幕尺寸很小（通常2.4-3.0英寸），界面文本必须极度精炼。
   * 尽量使用骑行领域的标准缩写（例如：Average 缩写为 Avg，Maximum 缩写为 Max，Minimum 缩写为 Min）。
   * 仔细参考输入的 context 提示（如果指明了字符限制，翻译长度绝对不能超过该限制）。
3. 【输出格式】：你必须直接输出纯 JSON 字符串，不能包含任何 markdown 的包裹标记（切勿使用 ```json 开头和 ``` 结尾），以保证我的程序能直接解析。

### 输入上下文：
- 词条 ID: {{sys.query.term_id}}
- 源词内容 (中文): {{sys.query.zh_cn}}
- 界面上下文/限制: {{sys.query.context}}
- 需要翻译的目标语种编码列表: {{sys.query.target_languages}}

### 要求的 JSON 输出格式：
键为目标语种中文名称，值为对应的翻译结果。示例如下：
{
  "英文": "Ride Paused",
  "法语": "Sortie en pause",
  "德语": "Fahrt pausiert"
}
```

---

## 5. 步骤四：配置“代码”节点（数据清洗）
为了防止 LLM 节点有时候仍然倔强地输出 ```json 包裹标记，或者首尾带有多余的空白字符，我们在 LLM 后面增加一个 **“代码节点 (Code Node)”** 进行清洗。

1. 在 LLM 节点右侧点击 **`+`** 按钮，选择 **“代码”**。
2. 将代码语言切换为 **`Python3`** 或 **`JavaScript`**。
3. **设置输入变量**：
   - 增加一个输入参数，Key 填 `llm_output`，Value 绑定为上面 LLM 节点的 `text` 输出。
4. **粘贴清洗代码**（这里以 Python3 为例）：

```python
import json
import re

def main(llm_output: str) -> dict:
    # 1. 剔除大模型可能输出的 Markdown codeblock 标记
    cleaned = re.sub(r'^```json\s*', '', llm_output, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    cleaned = cleaned.strip()
    
    # 2. 尝试解析，确保其是合法 JSON
    try:
        parsed = json.loads(cleaned)
        # 将解析后的干净 JSON 重新序列化为字符串输出
        return {
            "translations": json.dumps(parsed, ensure_ascii=False)
        }
    except Exception as e:
        # 如果解析失败，回退为一个包含 error 字段的 JSON
        error_res = {
            "error": f"JSON解析失败: {str(e)}",
            "raw_output": llm_output
        }
        return {
            "translations": json.dumps(error_res, ensure_ascii=False)
        }
```

---

## 6. 步骤五：配置“结束”节点（End Node）
在代码节点右侧连接 **“结束”** 节点。

1. 在结束节点中，点击 **“添加输出”**。
2. 变量名称填 `translations`。
3. 变量值（Value）绑定为上一个 **代码节点** 的 `translations` 输出值。

---

## 7. 步骤六：发布工作流并获取密钥

1. **测试运行**：点击画布右上角的 **“运行”**。输入测试数据：
   - `term_id`: `KW_RIDE_PAUSED`
   - `zh_cn`: `骑行已暂停`
   - `context`: `表盘页面`
   - `target_languages`: `英文,法语,德语`
   点击“开始运行”，检查结束节点输出的 `translations` 字段，确保其形如：`{"英文": "Ride Paused", "法语": "Sortie en pause", "德语": "Fahrt pausiert"}`。
2. **发布**：测试无误后，点击右上角的 **“发布”** ➜ **“更新运行”**。
3. **获取 API 密钥与地址**：
   - 在 Dify 左侧菜单栏，点击 **“API 访问”**。
   - 在右上角点击 **“API 密钥”** ➜ **“创建密钥”**，并复制该 Key（格式通常以 `app-` 开头）。
   - 您的 **Dify API Base URL** 即为 API 访问页面展示的基础路径（例如 `https://api.dify.ai/v1`）。

---

## 8. 步骤七：在 GlossaHub 插件中对接
1. 打开您的飞书多维表格，在右侧打开已通过“妙搭”部署好的 **GlossaHub** 自定义组件。
2. 点击切换到 **“引擎设置”** 页签。
3. 在表单中填入：
   - **API 接口地址**：填入步骤六中获取的 Dify 接口地址（如 `https://api.dify.ai/v1`）。
   - **API 密钥**：填入您刚刚生成的 `app-xxxx` 密钥，点击保存。
4. 切换回 **“智能翻译”** 页签，录入词条，点击一键翻译。系统将自动调用该工作流，获取精准的骑行码表语境翻译！
