import re

with open('src/components/translation/TranslationTab.jsx', 'r') as f:
    content = f.read()

# Remove the broken block
bad_block = """  const handleOpenBatchTranslate = async () => {
    const itemsToTranslate = records.map(r => {
      const missingLangs = TARGET_LANGUAGES.filter(lang => !r.fields[lang]);
      if (missingLangs.length === 0) return null;
      return {
        id: r.recordId,
        text: r.fields['CN（中文）'],
        context: r.fields['所在页面'] || '无',
        target_languages: TARGET_LANGUAGES.join(',')
      };
    }).filter(Boolean);
    // ... rest of implementation
  };

"""
content = content.replace(bad_block, "")

# Now fix the targetLanguages in the ACTUAL handleOpenBatchTranslate
content = content.replace("const missingLangs = targetLanguages.filter(lang => !r.fields[lang]);", "const missingLangs = TARGET_LANGUAGES.filter(lang => !r.fields[lang]);")

# Also in handleStartBatchTranslate:
content = content.replace("target_languages: item.missingLangs.join(',')", "target_languages: TARGET_LANGUAGES.join(',')")

with open('src/components/translation/TranslationTab.jsx', 'w') as f:
    f.write(content)

