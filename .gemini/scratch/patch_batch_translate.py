import re

# 1. Update TranslationTab.jsx
with open('src/components/translation/TranslationTab.jsx', 'r') as f:
    content = f.read()

# Add import for difyHelper
if 'runDifyWorkflow' not in content:
    content = content.replace("import { apiFetch, safeGetLocalStorage } from '../../utils/api';", 
                              "import { apiFetch, safeGetLocalStorage } from '../../utils/api';\nimport { runDifyWorkflow } from '../../utils/difyHelper';")

# Add dify settings reading inside component
settings_code = """  const getDifyConfig = () => {
    const s = safeGetLocalStorage('glossa_settings');
    return { difyUrl: s?.difyUrl, difyKey: s?.difyKey };
  };"""
if 'getDifyConfig' not in content:
    content = re.sub(r'(const \[batchTranslateOpen, setBatchTranslateOpen\] = useState\(false\);)', r'\1\n' + settings_code, content)

# Update handleOpenBatchTranslate
old_open_batch = r'const handleOpenBatchTranslate = async \(\) => \{\s*setBatchTargetTableId\(selectedTableId\);\s*setBatchPreviewList\(items\);\s*setBatchTranslateOpen\(true\);\s*setBatchProgress\(\{ total: items\.length, current: 0, status: items\.length > 0 \? .等待开始批量翻译. : .该版本下没有未翻译词条. \}\);\s*\};'
new_open_batch = """const handleOpenBatchTranslate = async () => {
    const itemsToTranslate = records.map(r => {
      const missingLangs = targetLanguages.filter(lang => !r.fields[lang]);
      if (missingLangs.length === 0) return null;
      return {
        recordId: r.id,
        KW: r.fields['KW'] || '',
        '中文': r.fields['CN（中文）'] || '',
        '所在页面': r.fields['所在页面'] || '',
        missingLangs,
        translations: {}
      };
    }).filter(Boolean);

    setBatchTargetTableId(selectedTableId);
    setBatchPreviewList(itemsToTranslate);
    setBatchTranslateOpen(true);
    setBatchProgress({ total: itemsToTranslate.length, current: 0, status: itemsToTranslate.length > 0 ? '等待开始批量翻译' : '该版本下没有未翻译词条' });
    setSelectedBatchItemIds(new Set(itemsToTranslate.map(i => i.recordId)));
  };"""
content = re.sub(old_open_batch, new_open_batch, content, flags=re.DOTALL)

# Update handleStartBatchTranslate
old_start_batch = r'const handleStartBatchTranslate = async \(\) => \{\s*setIsTranslatingBatch\(true\);\s*const updatedList = \[\.\.\.batchPreviewList\];\s*setBatchProgress\(\{\s*setBatchPreviewList\(\[\.\.\.updatedList\]\);\s*setIsTranslatingBatch\(false\);\s*setBatchProgress\(prev => \(\{ \.\.\.prev, status: .批量翻译完成！请检查预览内容并确认写入。. \}\)\);\s*\}'
new_start_batch = """const handleStartBatchTranslate = async () => {
    const { difyUrl, difyKey } = getDifyConfig();
    if (!difyUrl || !difyKey) {
      toast.error('请先在“引擎设置”配置 Dify');
      return;
    }
    setIsTranslatingBatch(true);
    const updatedList = [...batchPreviewList];

    for (let i = 0; i < updatedList.length; i++) {
      const item = updatedList[i];
      if (!selectedBatchItemIds.has(item.recordId)) continue;
      
      setBatchProgress({
        total: selectedBatchItemIds.size,
        current: i + 1,
        status: `正在翻译 (${i + 1}/${selectedBatchItemIds.size}): ${item.KW}`
      });

      try {
        const inputs = {
          KW: item.KW,
          text: item['中文'],
          context: item['所在页面'] || '无',
          target_languages: item.missingLangs.join(',')
        };

        const result = await runDifyWorkflow(difyUrl, difyKey, inputs);
        
        const trans = {};
        item.missingLangs.forEach(lang => {
          if (result[lang]) trans[lang] = result[lang];
        });
        
        item.translations = trans;
        setBatchPreviewList([...updatedList]);
      } catch (err) {
        console.error(`翻译词条 ${item.KW} 失败:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsTranslatingBatch(false);
    setBatchProgress(prev => ({ ...prev, status: '批量翻译完成！请检查预览内容并确认写入。' }));
  };"""
content = re.sub(r'const handleStartBatchTranslate = async \(\) => \{.*?setIsTranslatingBatch\(false\);\n\s*setBatchProgress\(prev => \(\{ \.\.\.prev, status: .批量翻译完成！请检查预览内容并确认写入。. \}\)\);\n  \};', new_start_batch, content, flags=re.DOTALL)

# Update handleConfirmBatchWrite
new_confirm_batch = """const handleConfirmBatchWrite = async () => {
    try {
      setIsSavingBatch(true);
      const recordsToUpdate = [];
      
      batchPreviewList.forEach(item => {
        if (!selectedBatchItemIds.has(item.recordId)) return;
        const fields = {};
        let hasNewTrans = false;
        Object.keys(item.translations).forEach(lang => {
          if (item.translations[lang]) {
            fields[lang] = item.translations[lang];
            hasNewTrans = true;
          }
        });
        if (hasNewTrans) {
          recordsToUpdate.push({
            id: item.recordId,
            ...fields
          });
        }
      });

      if (recordsToUpdate.length === 0) {
        setBatchTranslateOpen(false);
        return;
      }

      const updatedForSync = recordsToUpdate.map(r => {
        const { id, ...newFields } = r;
        const existingRec = records.find(rec => rec.id === id);
        return {
          recordId: id,
          fields: {
             ...(existingRec ? existingRec.fields : {}),
             ...newFields
          }
        };
      });

      const res = await apiFetch(`/api/tables/${batchTargetTableId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ added: [], updated: updatedForSync })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '写入失败');
      }
      
      toast.success('批量翻译写入成功');
      setBatchTranslateOpen(false);
      setBatchPreviewList([]);
      loadTableData(batchTargetTableId);
    } catch(err) {
      toast.error(err.message);
    } finally {
      setIsSavingBatch(false);
    }
  };"""
content = re.sub(r'const handleConfirmBatchWrite = async \(\) => \{.*?setBatchPreviewList\(\[\]\);\n  \};', new_confirm_batch, content, flags=re.DOTALL)

# Update modal props
content = content.replace('onStartBatchTranslate={() => {}}', 'onStartBatchTranslate={handleStartBatchTranslate}')
content = content.replace('onConfirmBatchWrite={() => {}}', 'onConfirmBatchWrite={handleConfirmBatchWrite}')
content = content.replace('targetLanguages={targetLanguages}', 'targetLanguages={targetLanguages}\n        difyConfig={getDifyConfig()}')

with open('src/components/translation/TranslationTab.jsx', 'w') as f:
    f.write(content)

print("Patched TranslationTab.jsx successfully")
