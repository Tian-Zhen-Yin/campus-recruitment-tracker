function extractJobPage() {
  function flatten(value, output = []) {
    if (!value) return output;
    if (Array.isArray(value)) value.forEach(item => flatten(item, output));
    else if (typeof value === 'object') {
      output.push(value);
      if (value['@graph']) flatten(value['@graph'], output);
    }
    return output;
  }
  const objects = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(node => {
    try { flatten(JSON.parse(node.textContent), objects); } catch (_) {}
  });
  const job = objects.find(item => {
    const type = item && item['@type'];
    return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
  }) || {};
  const meta = name => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content?.trim() || '';
  const firstText = selectors => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value && value.length < 160) return value;
    }
    return '';
  };
  const organization = typeof job.hiringOrganization === 'string' ? job.hiringOrganization : job.hiringOrganization?.name;
  const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation].filter(Boolean);
  const city = locations.map(location => {
    const address = location?.address || location;
    return [address?.addressLocality, address?.addressRegion].filter(Boolean).join(' ');
  }).filter(Boolean).join(' / ');
  const headingTexts = [...document.querySelectorAll('h1, h2, h3, h4, [class*="position-name"], [class*="positionName"], [class*="job-name"], [class*="jobName"], [class*="title"]')]
    .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
    .map(node => node.innerText?.trim() || '')
    .filter(value => value && value.length <= 120)
    .slice(0, 120);
  return {
    url: location.href,
    hostname: location.hostname,
    title: job.title || firstText(['[data-testid*="position"]', '[class*="position-name"]', '[class*="positionName"]', '[class*="job-name"]', '[class*="jobName"]', '[class*="job-title"]', '[class*="jobTitle"]', 'h1']) || meta('og:title') || document.title,
    company: organization || firstText(['[data-testid*="company"]', '[class*="company-name"]', '[class*="companyName"]', '[class*="company_title"]']) || meta('og:site_name'),
    city,
    headingTexts,
    pageTitle: document.title,
    pageText: (document.body?.innerText || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 80000)
  };
}

function tidy(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^招聘[:：]?\s*/, '').trim();
}

function inferCity(text, hostname = '') {
  const cities = ['北京','上海','广州','深圳','杭州','南京','苏州','成都','重庆','武汉','西安','长沙','天津','厦门','合肥','郑州','青岛','济南','宁波','无锡','珠海','佛山','东莞','福州','昆明','南昌','大连','沈阳','哈尔滨','石家庄','太原','贵阳','南宁','海口','兰州','乌鲁木齐','呼和浩特','长春','香港','澳门'];
  const labeled = text.match(/(?:工作地点|工作城市|意向城市|所在城市|城市|地点)\s*[:：]?\s*[①②③④⑤]?\s*([^\n，。|]{1,12})/);
  const labeledCity = labeled ? cities.find(city => labeled[1].includes(city)) : '';
  if (labeledCity) return labeledCity;
  if (/(?:^|\.)campus\.anta\.com$/i.test(hostname)) return '';
  return cities.find(city => text.includes(city)) || '';
}

function inferApplicationDate(text) {
  const match = text.match(/(?:投递|申请|提交)(?:时间|日期)?\s*[:：]?\s*(20\d{2})[.\/年-]\s*(\d{1,2})[.\/月-]\s*(\d{1,2})日?/)
    || text.match(/(20\d{2})[.\/年-]\s*(\d{1,2})[.\/月-]\s*(\d{1,2})日?\s*(?:投递|申请|提交)/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  if (!/(?:投递简历|已投递|我的投递|应聘记录|申请记录)/.test(text)) return '';
  const dates = [...text.matchAll(/(20\d{2})[.\/年-]\s*(\d{1,2})[.\/月-]\s*(\d{1,2})日?/g)]
    .map(item => `${item[1]}-${item[2].padStart(2, '0')}-${item[3].padStart(2, '0')}`);
  const uniqueDates = [...new Set(dates)];
  return uniqueDates.length === 1 ? uniqueDates[0] : '';
}

function inferStage(text) {
  const labeled = text.match(/(?:当前状态|投递状态|申请状态|招聘进度|求职进度)\s*[:：]?\s*([^\s，。|]{2,12})/);
  const visibleStatus = text.match(/(?:AI面试|初筛中|筛选中|笔试中|测评中|一面|初面|二面|复试|HR面|人事面|已录用|待入职|未通过|已拒绝|流程结束)/i);
  const value = labeled?.[1] || visibleStatus?.[0] || '';
  if (/offer|录用|待入职/i.test(value)) return 'Offer';
  if (/不合适|未通过|已拒绝|流程结束|招聘结束|已关闭/.test(value)) return '已结束';
  if (/HR面|hr面|人事面/i.test(value)) return 'HR面';
  if (/二面|第二轮|复试/.test(value)) return '二面';
  if (/AI面试/i.test(value)) return '一面';
  if (/一面|初面|第一轮/.test(value)) return '一面';
  if (/笔试|测评/.test(value)) return '笔试';
  return '已投递';
}

const GENERIC_POSITION = /^(?:应聘记录|申请记录|我的申请|职位申请|校园招聘|社会招聘|招聘官网|职位列表|岗位列表|职位详情|岗位详情|首页)$/i;
const POSITION_WORDS = /工程师|经理|运营|设计师|分析师|顾问|开发|算法|产品|销售|商务|市场|营销|商业化|策略|行业|客户|供应链|财务|人力|法务|测试|数据|项目(?:经理|管理|运营|策划|专员)|采购|管培|校招生|实习生|专员|研究员|策划|编辑|审计|助理|负责人/;
const POSITION_NOISE = /编辑短信|发送短信|修改志愿|查看详情|个人资料|我的简历|投递记录|撤回投递|更新简历|重新投递|取消申请|官网主投|初筛中|筛选中|已投递|申请时间|投递时间|发布|全职|兼职|第\d志愿|^(?:招聘)?项目\s*[:：]|招聘批次|校招项目|应届生项目|^(?:产品|技术|设计|运营|职能|销售|市场|研发)类$/;

function knownCompany(hostname) {
  if (/(?:^|\.)xiaomi\.jobs\.f\.mioffice\.cn$/i.test(hostname || '')) return '小米集团';
  if (/(?:^|\.)campus\.kuaishou\.cn$/i.test(hostname || '')) return '快手';
  if (/(?:^|\.)campus\.anta\.com$/i.test(hostname || '')) return '安踏集团';
  return '';
}

function inferPosition(text, proposed, headingTexts = []) {
  const clean = value => tidy(value)
    .replace(/^(?:岗位|职位)(?:名称)?\s*[:：]\s*/, '')
    .replace(/第\s*\d+\s*志愿/g, '')
    .replace(/(?:撤回投递|更新简历|重新投递|取消申请|官网主投|初筛中|筛选中|已投递)+/g, '')
    .trim();
  const direct = clean(proposed).split(/\s[-_|｜·]\s|招聘职位|职位详情|校园招聘/)[0].trim();
  if (direct && !GENERIC_POSITION.test(direct) && !POSITION_NOISE.test(direct) && POSITION_WORDS.test(direct) && direct.length <= 80) return direct;
  const sources = [
    ...headingTexts.map(value => ({ value: clean(value), prominence: 5 })),
    ...String(text || '').split(/\n+/).map(value => ({ value: clean(value), prominence: 0 }))
  ];
  const bestByValue = new Map();
  sources.filter(item => item.value && item.value.length >= 2 && item.value.length <= 80)
    .filter(item => !GENERIC_POSITION.test(item.value) && POSITION_WORDS.test(item.value) && !POSITION_NOISE.test(item.value))
    .forEach(item => {
      const score = item.prominence + 3 + (/【|届|实习|校招/.test(item.value) ? 1 : 0) - (/登录|搜索|筛选|导航/.test(item.value) ? 3 : 0);
      if (!bestByValue.has(item.value) || bestByValue.get(item.value).score < score) bestByValue.set(item.value, { value: item.value, score });
    });
  const candidates = [...bestByValue.values()]
    .sort((a, b) => b.score - a.score || a.value.length - b.value.length);
  if (!candidates.length) return '';
  if (candidates.length > 1 && candidates[0].score === candidates[1].score && candidates[0].value !== candidates[1].value) return '';
  return candidates[0].value;
}

function normalizeCaptured(raw) {
  const position = inferPosition(raw.pageText, raw.title, Array.isArray(raw.headingTexts) ? raw.headingTexts : []);
  let company = knownCompany(raw.hostname) || tidy(raw.company);
  if (!company || /^(?:官网|网站)$|BOSS直聘|猎聘|智联招聘|前程无忧|拉勾|牛客|实习僧|应届生求职网|招聘官网|招聘网站|校园招聘|社会招聘|应聘记录|申请记录/i.test(company)) {
    const parts = tidy(raw.pageTitle).split(/[_|｜·-]/).map(item => item.trim()).filter(Boolean);
    company = parts.find(part => part !== position && !/招聘|职位|官网|应聘|申请|BOSS|猎聘|智联|前程|拉勾|牛客|实习僧/.test(part)) || '';
  }
  return {
    company: company.slice(0, 60),
    position: position.slice(0, 80),
    city: tidy(raw.city || inferCity(`${raw.pageTitle}\n${raw.pageText}`, raw.hostname)).slice(0, 30),
    applicationDate: inferApplicationDate(raw.pageText || ''),
    stage: inferStage(raw.pageText || ''),
    applicationUrl: raw.url
  };
}

function waitForComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('详情页加载超时，请确认网址可以正常访问。')), 18000);
    const listener = (changedId, info) => {
      if (changedId === tabId && info.status === 'complete') finish();
    };
    function finish(error) {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') finish(); }).catch(() => {});
  });
}

async function captureUrl(url, returnTabId) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只支持 http 或 https 投递网址。');
  const openTabs = await chrome.tabs.query({});
  const tab = openTabs.find(item => {
    try {
      const current = new URL(item.url || '');
      return current.hostname === parsed.hostname && current.pathname === parsed.pathname;
    } catch (_) {
      return false;
    }
  }) || await chrome.tabs.create({ url: parsed.href, active: true });
  const createdTab = !openTabs.some(item => item.id === tab.id);
  let activatedExistingTab = false;
  try {
    await waitForComplete(tab.id);
    let captured = {};
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt === 3 && !tab.active) {
        await chrome.tabs.update(tab.id, { active: true });
        activatedExistingTab = true;
      }
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1800 : 1000));
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJobPage });
      const raw = result[0]?.result || {};
      captured = normalizeCaptured(raw);
      if (captured.position && (captured.city || captured.applicationDate || (attempt >= 2 && String(raw.pageText || '').length > 40))) return captured;
    }
    return captured;
  } finally {
    if (createdTab && tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
    if (activatedExistingTab && returnTabId) await chrome.tabs.update(returnTabId, { active: true }).catch(() => {});
  }
}

// ===== 腾讯智能表格：同源数据接口读取（v1.4.3 起为首选路径） =====
// 智能表格的数据网格由 canvas 绘制，DOM 里没有行节点和链接可抓，
// 因此改为直接调用页面自己使用的同源接口（带登录态），拿到结构化数据。
async function apiFetchJson(url) {
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) throw new Error(`接口返回 ${resp.status}`);
  return resp.json();
}

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

async function syncTencentJobsApi(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'docs.qq.com' || !parsed.pathname.startsWith('/smartsheet/')) {
    throw new Error('这不是支持的腾讯智能表格网址。');
  }
  const docId = parsed.pathname.split('/').filter(Boolean)[1] || '';
  const subId = parsed.searchParams.get('tab') || parsed.searchParams.get('subId') || '';
  const viewId = parsed.searchParams.get('viewId') || '';
  if (!docId || !subId) throw new Error('这不是支持的腾讯智能表格网址。');

  const meta = await apiFetchJson(`https://docs.qq.com/dop-api/opendoc?id=${encodeURIComponent(docId)}&outformat=1&normal=1`);
  const localPadId = meta?.bodyData?.localPadId || '';
  if (!localPadId) throw new Error('没有读到文档信息，请确认已登录腾讯文档且有查看权限。');

  const fields = {};
  const fieldOptions = {};
  let fieldsReady = false;
  const collected = new Map();
  const step = 60;
  const limit = 1500;
  for (let start = 0; start < limit; start += step) {
    const query = `padId=${encodeURIComponent('300000000$' + localPadId)}&subId=${encodeURIComponent(subId)}`
      + `&startrow=${start}&endrow=${start + step - 1}&outformat=1&normal=1&needSheetState=2`
      + (viewId ? `&viewId=${encodeURIComponent(viewId)}` : '');
    let chunk = null;
    try { chunk = parseSheetChunk(await apiFetchJson('https://docs.qq.com/dop-api/get/sheet?' + query)); } catch (_) { break; }
    if (!chunk) break;
    if (!fieldsReady && Object.keys(chunk.fields).length) {
      Object.assign(fields, chunk.fields);
      Object.assign(fieldOptions, chunk.fieldOptions || {});
      fieldsReady = true;
    }
    const ids = Object.keys(chunk.rows);
    let added = 0;
    ids.forEach(rowId => {
      if (!collected.has(rowId)) { collected.set(rowId, chunk.rows[rowId]); added += 1; }
    });
    if (!ids.length || !added) break;
  }
  if (!fieldsReady) throw new Error('没有读到表格结构，请稍后重试。');
  if (!collected.size) throw new Error('没有读到岗位，请确认已登录且有权限查看这份文档。');

  const fieldIds = Object.keys(fields);
  const rows = [];
  for (const rowId of collected.keys()) {
    const cellsMap = (collected.get(rowId) && collected.get(rowId)['1']) || {};
    const values = fieldIds.map(fieldId => {
      const cell = cellsMap[fieldId];
      // 单选字段：键 "9" 下是选项 ID 列表，用字段定义里的对照表还原成选项名称
      if (cell && Array.isArray(cell['9'])) {
        const opts = fieldOptions[fieldId] || {};
        const names = cell['9'].map(id => opts[id]).filter(Boolean);
        return { name: fields[fieldId], value: { text: names.join('、'), link: '' } };
      }
      return { name: fields[fieldId], value: sheetCellToValue(cell) };
    });
    // 注意：cells 必须与表头等长（空单元格保留 '' 占位），否则台账按表头下标取列会错位
    const texts = values.map(item => item.value.text);
    const isNoiseUrl = u => /qlogo\.cn|thirdwx\./i.test(u);
    const primaryLinkField = values.find(item => /链接|网申|报名/.test(item.name) && item.value.url && !isNoiseUrl(item.value.url));
    const otherLinks = values.map(item => item.value.url).filter(u => u && /^https?:\/\//i.test(u) && !isNoiseUrl(u));
    const links = [...new Set([primaryLinkField && primaryLinkField.value.url, ...otherLinks].filter(Boolean))];
    if (!texts.some(Boolean) && !links.length) continue;
    rows.push({ cells: texts, text: texts.filter(Boolean).join(' '), links });
  }
  if (!rows.length) throw new Error('没有读到岗位，请确认已登录且有权限查看这份文档。');
  // 台账解析器靠表头行识别列（公司名称/招聘岗位/内推链接…），把列名作为首行一起返回
  const header = fieldIds.map(fieldId => fields[fieldId]);
  rows.unshift({ cells: header, text: header.join(' '), links: [] });
  try {
    // 诊断回传：opendoc 元数据发给本机控制台（供多子表适配分析；发不出去不影响同步）
    await fetch('http://127.0.0.1:7788/api/debug/dump', { method: 'POST', keepalive: true, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({
      kind: 'tencent-sync-diag', url, docId, subId, rowsFetched: rows.length - 1, meta
    }) }).catch(() => {});
  } catch (_) {}
  return { title: '腾讯文档岗位表', rows };
}

async function syncTencentJobs(url) {
  // 首选同源接口；结构变化等异常时回退到旧的页面抓取方式
  try {
    return await syncTencentJobsApi(url);
  } catch (apiError) {
    try {
      return await syncTencentJobsLegacy(url);
    } catch (_) {
      throw apiError;
    }
  }
}

async function extractTencentSmartSheet() {
  const collected = new Map();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = value => String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const addRow = (text, cells = [], links = []) => {
    const cleanedText = clean(text);
    const cleanedCells = cells.map(clean).filter(Boolean).slice(0, 24);
    const cleanedLinks = [...new Set(links.map(String).filter(url => /^https?:\/\//i.test(url)))].slice(0, 8);
    if ((!cleanedText || cleanedText.length < 4) && cleanedCells.length < 2) return;
    if (cleanedText.length > 1500) return;
    const key = `${cleanedCells.join('|')}|${cleanedLinks.join('|')}|${cleanedText}`;
    collected.set(key, { text: cleanedText, cells: cleanedCells, links: cleanedLinks });
  };
  const collect = () => {
    const selectors = ['[role="row"]', '[data-record-id]', '[data-row-id]', '[class*="record-item"]', '[class*="table-row"]', '[class*="grid-row"]'];
    const nodes = [...document.querySelectorAll(selectors.join(','))].slice(0, 4000);
    nodes.forEach(node => {
      const text = clean(node.innerText || node.textContent || '');
      const cellNodes = [...node.querySelectorAll('[role="cell"], [role="gridcell"], td, [class*="cell"]')].slice(0, 30);
      const cells = cellNodes.length ? cellNodes.map(cell => clean(cell.innerText || cell.textContent || '')) : text.split(/\n|\t/).map(clean);
      const links = [...node.querySelectorAll('a[href]')].map(link => link.href);
      addRow(text, cells, links);
    });
    [...document.querySelectorAll('a[href]')].slice(0, 3000).forEach(link => {
      let container = link;
      for (let depth = 0; depth < 6 && container?.parentElement; depth += 1) {
        container = container.parentElement;
        const text = clean(container.innerText || '');
        if (text.length >= 8 && text.length <= 800) {
          addRow(text, text.split(/\n|\t/).map(clean), [link.href]);
          break;
        }
      }
    });
    const lines = clean(document.body?.innerText || '').split('\n').map(clean).filter(Boolean);
    lines.forEach(line => {
      if (line.includes('\t') || /实习|校招|秋招|春招|管培|工程师|开发|算法|产品|运营|设计|分析|顾问|招聘/.test(line)) addRow(line, line.split(/\t|[|｜]/).map(clean), []);
    });
  };

  await wait(2600);
  collect();
  const candidates = [document.scrollingElement, ...document.querySelectorAll('main, [role="grid"], [class*="scroll"], [class*="table"], [class*="content"]')]
    .filter(Boolean)
    .filter((element, index, array) => array.indexOf(element) === index && element.scrollHeight > element.clientHeight + 200)
    .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
  const scroller = candidates[0];
  if (scroller) {
    const originalTop = scroller.scrollTop;
    let unchanged = 0;
    let previousSize = collected.size;
    for (let index = 0; index < 90; index += 1) {
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(scroller.scrollHeight, before + Math.max(420, scroller.clientHeight * 0.82));
      await wait(180);
      collect();
      unchanged = collected.size === previousSize ? unchanged + 1 : 0;
      previousSize = collected.size;
      if (scroller.scrollTop === before || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5 || unchanged >= 8) break;
    }
    scroller.scrollTop = originalTop;
  }
  return { title: document.title, url: location.href, rows: [...collected.values()].slice(0, 3000) };
}

async function syncTencentJobsLegacy(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'docs.qq.com' || !parsed.pathname.startsWith('/smartsheet/')) throw new Error('这不是支持的腾讯智能表格网址。');
  const tab = await chrome.tabs.create({ url: parsed.href, active: false });
  let keepOpen = false;
  try {
    try { await waitForComplete(tab.id); } catch (_) {}
    await new Promise((r) => setTimeout(r, 2500)); // 等 canvas 前端就绪，同源接口才可用
    // 页面内同源拉取（page-pull.js 注入到文档页的 isolated world，自动携带页面登录态）
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page-pull.js'] });
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (u) => await window.__campusPagePull(u),
      args: [parsed.href]
    });
    const data = result[0]?.result || {};
    if (data.needLogin) {
      keepOpen = true;
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
      throw new Error('还没有登录腾讯文档：请在刚打开的文档页面完成登录，然后回到台账再点一次「同步腾讯文档」。');
    }
    if (data.error) throw new Error(data.error);
    if (!Array.isArray(data.rows) || !data.rows.length) throw new Error('没有读取到岗位，请确认已登录并且可以查看这份腾讯文档。');
    return data.rows;
  } catch (e) {
    // 诊断：分页参数矩阵 + 元数据回传，帮助定位「岗位数量少于表格」
    let diag = '';
    if (!/登录腾讯文档/.test(e.message)) {
      try {
        const d = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async (u) => await window.__campusProbePagination(u), args: [parsed.href] });
        diag = d[0]?.result || '';
        const sw = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async (u) => {
          const parsed = new URL(u);
          const docId = parsed.pathname.split('/').filter(Boolean)[1];
          const meta = await fetch('https://docs.qq.com/dop-api/opendoc?id=' + docId + '&outformat=1&normal=1', { credentials: 'include' }).then((r) => r.json()).catch(() => null);
          await fetch('http://127.0.0.1:7788/api/debug/dump', { method: 'POST', keepalive: true, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ kind: 'tencent-fail-diag', url: u, meta }) }).catch(() => {});
          return '已回传';
        }, args: [parsed.href] });
        diag += (sw[0]?.result ? ' | 元数据已回传' : '');
      } catch (_) {}
    }
    throw new Error((e.message || '同步失败') + (diag ? '\n[诊断] ' + diag : ''));
  } finally {
    if (tab?.id && !keepOpen) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['CAPTURE_JOB_URL', 'SYNC_QQ_JOBS'].includes(message?.type)) return false;
  const task = message.type === 'SYNC_QQ_JOBS' ? syncTencentJobs(message.url) : captureUrl(message.url, sender.tab?.id);
  task
    .then(data => sendResponse(message.type === 'SYNC_QQ_JOBS' ? { ok: true, rows: data } : { ok: true, data }))
    .catch(error => sendResponse({ ok: false, message: error.message || '识别失败，请重试。' }));
  return true;
});
