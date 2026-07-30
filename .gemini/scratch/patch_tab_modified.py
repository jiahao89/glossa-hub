with open('src/components/translation/TranslationTab.jsx', 'r') as f:
    content = f.read()

bad = "setModifiedCells({}); // Clear modified cells on table switch"
content = content.replace(bad, "// REMOVED: setModifiedCells({}) here to avoid pagination clearing")

use_effect = """  // Column Visibility States"""
use_effect_new = """  useEffect(() => {
    setModifiedCells({});
  }, [selectedTableId]);

  // Column Visibility States"""

content = content.replace(use_effect, use_effect_new)

with open('src/components/translation/TranslationTab.jsx', 'w') as f:
    f.write(content)
