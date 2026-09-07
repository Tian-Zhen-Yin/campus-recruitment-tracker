// 本文件由 chrome.scripting.executeScript({files:['page-pull.js']}) 注入到腾讯文档页面。
// 在页面上下文同源拉取智能表格数据（自带登录态）；解析函数与 background.js 原版逐字一致。
function parseSheetChunk(json) {
  const text = json && json.data && json.data.initialAttributedText
    && json.data.initialAttributedText.text && json.data.initialAttributedText.text[0]
    && json.data.initialAttributedText.text[0].smartsheet;
  if (!text || typeof text !== 'string') return null;
  let inner = null;
  try { inner = JSON.parse(text); } catch (_) { return null; }
  const schemaRec = inner?.[0]?.['0'] || null;
  let rows = {};
  try { rows = inner[0]['1'].c['2']['1'] || {}; } catch (_) { rows = {}; }
  const fields = {};
  const fieldOptions = {};
  (function findFields(node, depth) {
    if (depth > 10) return;
    if (Array.isArray(node)) { node.forEach(item => findFields(item, depth + 1)); return; }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (value && typeof value === 'object' && !Array.isArray(value)
          && typeof value['30'] === 'string' && value['30'].length <= 20 && !fields[key]) {
          fields[key] = value['30'];
          // 单选字段的选项对照表：key "9" 下 {3:[{1:选项ID, 2:选项名}, ...]}
          const opts = value['9'] && value['9']['3'];
          if (Array.isArray(opts)) {
            const map = {};
            opts.forEach(opt => { if (opt && typeof opt['1'] === 'string' && typeof opt['2'] === 'string') map[opt['1']] = opt['2']; });
            if (Object.keys(map).length) fieldOptions[key] = map;
          }
        }
        findFields(value, depth + 1);
      }
    }
  })(schemaRec, 0);
  return { fields, fieldOptions, rows };
}

function sheetCellToValue(cell) {
  // 文本片段挂在键 "1"，超链接片段挂在键 "8"（两段式结构），这里统一收集所有数组片段
  let runs = [];
  if (cell && typeof cell === 'object') {
    for (const key of Object.keys(cell)) {
      if (Array.isArray(cell[key])) runs = runs.concat(cell[key]);
    }
  }
  let text = '';
  let link = '';
  for (const run of runs) {
    if (!run || typeof run !== 'object') continue;
    if (run['1'] === 'url' && typeof run['3'] === 'string' && run['3']) {
      link = run['3'];
      if (typeof run['2'] === 'string') text += run['2'];
    } else if (typeof run['2'] === 'string') {
      text += run['2'];
    }
  }
  return { text: text.trim(), link };
}

async function pagePullSheetImpl(url) {
  const parsed = new URL(url);
  const docId = parsed.pathname.split('/').filter(Boolean)[1] || '';
  const subId = parsed.searchParams.get('tab') || parsed.searchParams.get('subId') || '';
  const viewId = parsed.searchParams.get('viewId') || '';
  if (!docId || !subId) return { error: '这不是支持的腾讯智能表格网址。' };
  const metaResp = await fetch('https://docs.qq.com/dop-api/opendoc?id=' + encodeURIComponent(docId) + '&outformat=1&normal=1', { credentials: 'include' });
  if (metaResp.status === 401 || metaResp.status === 403) return { needLogin: true };
  const meta = await metaResp.json().catch(() => null);
  const localPadId = meta && meta.bodyData && meta.bodyData.localPadId || '';
  if (!localPadId) return { needLogin: true };
  const fields = {}; const fieldOptions = {}; let fieldsReady = false;
  const collected = new Map();
  for (let start = 0; start < 1500; start += 60) {
    const query = 'padId=' + encodeURIComponent('300000000$' + localPadId) + '&subId=' + encodeURIComponent(subId)
      + '&startrow=' + start + '&endrow=' + (start + 59) + '&outformat=1&normal=1&needSheetState=2'
      + (viewId ? '&viewId=' + encodeURIComponent(viewId) : '');
    let json = null;
    try {
      const r = await fetch('https://docs.qq.com/dop-api/get/sheet?' + query, { credentials: 'include' });
      if (!r.ok) break;
      json = await r.json().catch(() => null);
    } catch (_) { break; }
    const chunk = json && parseSheetChunk(json);
    if (!chunk) break;
    if (!fieldsReady && Object.keys(chunk.fields).length) {
      Object.assign(fields, chunk.fields);
      Object.assign(fieldOptions, chunk.fieldOptions || {});
      fieldsReady = true;
    }
    const ids = Object.keys(chunk.rows);
    let added = 0;
    ids.forEach((rowId) => { if (!collected.has(rowId)) { collected.set(rowId, chunk.rows[rowId]); added += 1; } });
    if (!ids.length || !added) break;
  }
  if (!fieldsReady) return { error: '没有读到表格结构，请稍后重试。' };
  if (!collected.size) return { error: '没有读到岗位，请确认这份文档有内容。' };
  const fieldIds = Object.keys(fields);
  const rows = [];
  for (const rowId of collected.keys()) {
    const cellsMap = (collected.get(rowId) && collected.get(rowId)['1']) || {};
    const values = fieldIds.map((fieldId) => {
      const cell = cellsMap[fieldId];
      if (cell && Array.isArray(cell['9'])) {
        const opts = fieldOptions[fieldId] || {};
        const names = cell['9'].map((id) => opts[id]).filter(Boolean);
        return { name: fields[fieldId], value: { text: names.join('、'), link: '' } };
      }
      return { name: fields[fieldId], value: sheetCellToValue(cell) };
    });
    const texts = values.map((item) => item.value.text);
    const isNoiseUrl = (u) => /qlogo\.cn|thirdwx\./i.test(u);
    const primary = values.find((item) => /链接|网申|报名/.test(item.name) && item.value.link && !isNoiseUrl(item.value.link));
    const others = values.map((item) => item.value.link).filter((u) => u && /^https?:\/\//i.test(u) && !isNoiseUrl(u));
    const links = [...new Set([primary && primary.value.link, ...others].filter(Boolean))];
    if (!texts.some(Boolean) && !links.length) continue;
    rows.push({ cells: texts, text: texts.filter(Boolean).join(' '), links });
  }
  if (!rows.length) return { error: '没有读到岗位，请确认这份文档有内容。' };
  const header = fieldIds.map((fieldId) => fields[fieldId]);
  rows.unshift({ cells: header, text: header.join(' '), links: [] });
  return { rows };
}
window.__campusPagePull = pagePullSheetImpl;


// 分页参数矩阵探针：5 种参数组合各拉一次，回报真实行数（供人工修正分页实现）
async function probePagination(url, localPadId, subId, viewId) {
  const base = 'https://docs.qq.com/dop-api/get/sheet?padId=' + encodeURIComponent('300000000$' + localPadId) + '&subId=' + encodeURIComponent(subId) + '&outformat=1&normal=1&needSheetState=2';
  const vq = viewId ? '&viewId=' + encodeURIComponent(viewId) : '';
  const variants = [
    ['同视图 0-59', base + '&startrow=0&endrow=59' + vq],
    ['同视图 60-119', base + '&startrow=60&endrow=119' + vq],
    ['同视图 300-359', base + '&startrow=300&endrow=359' + vq],
    ['无视图 0-59', base + '&startrow=0&endrow=59'],
    ['无视图 60-119', base + '&startrow=60&endrow=119'],
    ['无视图 300-359', base + '&startrow=300&endrow=359'],
  ];
  const out = [];
  for (const [label, u] of variants) {
    try {
      const r = await fetch(u, { credentials: 'include' });
      const j = await r.json().catch(() => null);
      const ch = j && parseSheetChunk(j);
      out.push(label + ':' + r.status + (ch ? '/' + Object.keys(ch.rows).length + '行' : '/无chunk'));
    } catch (e) { out.push(label + ':异常'); }
  }
  return out.join(' | ');
}
window.__campusProbePagination = probePagination;
