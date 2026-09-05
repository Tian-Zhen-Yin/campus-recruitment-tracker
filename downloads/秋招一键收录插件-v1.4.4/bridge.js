(() => {
  const TRACKER_SOURCE = 'AUTUMN_TRACKER';
  const EXTENSION_SOURCE = 'AUTUMN_JOB_CAPTURE';

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== TRACKER_SOURCE) return;
    if (event.data.type === 'CAPTURE_REGISTER_TRACKER') {
      const trackerUrl = String(event.data.url || '');
      if (/^(file|https?):\/\//i.test(trackerUrl)) {
        chrome.storage.local.set({ trackerUrl }).then(() => {
          window.postMessage({ source: EXTENSION_SOURCE, type: 'CAPTURE_READY' }, '*');
        });
      }
      return;
    }
    if (event.data.type === 'CAPTURE_PING') {
      const trackerUrl = String(event.data.url || '');
      const ready = () => window.postMessage({ source: EXTENSION_SOURCE, type: 'CAPTURE_READY' }, '*');
      if (/^(file|https?):\/\//i.test(trackerUrl)) chrome.storage.local.set({ trackerUrl }).then(ready);
      else ready();
      return;
    }
    if (!['CAPTURE_JOB_URL', 'SYNC_QQ_JOBS'].includes(event.data.type)) return;
    chrome.runtime.sendMessage({ type: event.data.type, url: event.data.url }, response => {
      if (chrome.runtime.lastError) {
        window.postMessage({ source: EXTENSION_SOURCE, type: event.data.type === 'SYNC_QQ_JOBS' ? 'SYNC_JOBS_ERROR' : 'CAPTURE_ERROR', message: '插件连接失败，请在扩展程序页面重新加载插件。' }, '*');
        return;
      }
      if (response?.ok) {
        window.postMessage({ source: EXTENSION_SOURCE, type: event.data.type === 'SYNC_QQ_JOBS' ? 'SYNC_JOBS_RESULT' : 'CAPTURE_RESULT', data: response.data, rows: response.rows }, '*');
      } else {
        window.postMessage({ source: EXTENSION_SOURCE, type: event.data.type === 'SYNC_QQ_JOBS' ? 'SYNC_JOBS_ERROR' : 'CAPTURE_ERROR', message: response?.message || '没有识别到内容。' }, '*');
      }
    });
  });
})();
