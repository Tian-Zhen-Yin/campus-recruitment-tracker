const input = document.getElementById('trackerUrl');
const statusEl = document.getElementById('status');

chrome.storage.local.get('trackerUrl').then(({ trackerUrl }) => { input.value = trackerUrl || ''; });
document.getElementById('saveBtn').addEventListener('click', async () => {
  const value = input.value.trim();
  try {
    const url = new URL(value);
    if (!['file:', 'http:', 'https:'].includes(url.protocol)) throw new Error();
    await chrome.storage.local.set({ trackerUrl: url.href });
    statusEl.textContent = '已保存';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  } catch (_) {
    statusEl.textContent = '请输入完整有效的网址';
  }
});
