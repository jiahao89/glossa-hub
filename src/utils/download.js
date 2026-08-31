// 统一的浏览器文件下载工具：传入 Blob 与文件名，触发浏览器保存
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延迟释放，避免个别浏览器下载尚未开始就 revoke
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

// 生成带日期后缀的导出文件名，例如 GlossaHub_表名_2026-08-28.xlsx
export function buildExportFilename(prefix, name, ext) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${name || 'export'}_${date}.${ext}`;
}
