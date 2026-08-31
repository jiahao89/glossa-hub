// ============================================================
// 模块级缓存 Intl.DateTimeFormat 实例：
// 构造 Intl 格式化器开销较大，禁止在渲染循环内重复 new
// （原 DashboardTab 每行日志渲染都 new 两个 formatter 的性能问题）
// ============================================================
const LOG_TZ = 'Asia/Shanghai';
const logDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: LOG_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const logTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: LOG_TZ,
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

// 智能日志时间：今天的日志只显示时分秒，非今天显示 日期+时分秒（北京时间）
export function formatLogTime(timestampStr) {
  if (!timestampStr) return '';
  let date;
  // 兼容 'YYYY-MM-DD HH:mm:ss' 形态：按北京时间(+08:00)解析
  if (typeof timestampStr === 'string' && timestampStr.includes(' ') && !timestampStr.includes('T')) {
    date = new Date(timestampStr.replace(' ', 'T') + '+08:00');
  } else {
    date = new Date(timestampStr);
  }

  if (isNaN(date.getTime())) {
    return timestampStr;
  }

  const now = new Date();
  const todayStr = logDateFormatter.format(now);
  const logDateStr = logDateFormatter.format(date);
  const timePart = logTimeFormatter.format(date);

  if (todayStr === logDateStr) {
    return timePart;
  } else {
    const ymd = logDateStr.replace(/\//g, '-');
    return `${ymd} ${timePart}`;
  }
}

// 本地时区完整时间（如 2026/8/28 14:30:05），原 SettingsTab 回收站列使用
export function formatLocaleDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return dateStr;
  }
}

// 年月日时分（如 2026/08/28 14:30），空值返回 '—'，原 VersionsTab 表格列使用
export function formatDateTimeMinute(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}天前`;
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
