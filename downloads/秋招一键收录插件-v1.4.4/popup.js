const captureBtn = document.getElementById('captureBtn');
const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');

function capturePageData() {
  function flatten(value, output = []) {
    if (!value) return output;
    if (Array.isArray(value)) value.forEach(item => flatten(item, output));
    else if (typeof value === 'object') {
      output.push(value);
      if (value['@graph']) flatten(value['@graph'], output);
    }
    return output;
  }

  const jsonObjects = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(node => {
    try { flatten(JSON.parse(node.textContent), jsonObjects); } catch (_) {}
  });
  const job = jsonObjects.find(item => {
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
  const org = typeof job.hiringOrganization === 'string' ? job.hiringOrganization : job.hiringOrganization?.name;
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
    company: org || firstText(['[data-testid*="company"]', '[class*="company-name"]', '[class*="companyName"]', '[class*="company_title"]']) || meta('og:site_name'),
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
    const titleParts = tidy(raw.pageTitle).split(/[_|｜·-]/).map(item => item.trim()).filter(Boolean);
    company = titleParts.find(part => part !== position && !/招聘|职位|官网|应聘|申请|BOSS|猎聘|智联|前程|拉勾|牛客|实习僧/.test(part)) || '';
  }
  return {
    company: company.slice(0, 60),
    position: position.slice(0, 80),
    city: tidy(raw.city || inferCity(`${raw.pageTitle}\n${raw.pageText}`, raw.hostname)).slice(0, 30),
    applicationUrl: raw.url,
    applicationDate: inferApplicationDate(raw.pageText || ''),
    stage: inferStage(raw.pageText || '')
  };
}

function encodePayload(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function showPreview(data) {
  const escape = value => String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  previewEl.innerHTML = `
    <div class="item"><span class="label">公司</span><span class="value">${escape(data.company)}</span></div>
    <div class="item"><span class="label">岗位</span><span class="value">${escape(data.position)}</span></div>
    <div class="item"><span class="label">城市</span><span class="value">${escape(data.city || '待确认')}</span></div>`;
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = '正在识别当前页面…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || '')) throw new Error('请先打开一个招聘岗位网页');
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: capturePageData });
    const captured = normalizeCaptured(result[0]?.result || {});
    showPreview(captured);
    const { trackerUrl } = await chrome.storage.local.get('trackerUrl');
    if (!trackerUrl) throw new Error('请先用当前浏览器打开一次秋招管理器');
    const destination = new URL(trackerUrl);
    destination.searchParams.set('capture', encodePayload(captured));
    await chrome.tabs.create({ url: destination.href });
    statusEl.textContent = '已发送，请在管理器中确认保存';
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = error.message || '识别失败，请换一个岗位页面重试';
  } finally {
    captureBtn.disabled = false;
  }
});

document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
