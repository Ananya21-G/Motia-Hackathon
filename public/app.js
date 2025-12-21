// Enhanced frontend with detailed logging

const form = document.getElementById('monitor-form');
const urlInput = document.getElementById('url-input');
const monitorsRoot = document.getElementById('monitors');

const sseMap = new Map(); // monitorId -> EventSource

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const url = (urlInput.value || '').trim();
  if (!url) return;
  form.querySelector('button').disabled = true;
  try {
    const monitor = await createMonitor(url);
    console.log('✅ Monitor created:', monitor);
    renderMonitorCard(monitor.monitorId, url);
    startSSE(monitor.monitorId);
    urlInput.value = '';
  } catch (err) {
    console.error('❌ Failed to create monitor:', err);
    alert('Failed to create monitor');
  } finally {
    form.querySelector('button').disabled = false;
  }
});

async function createMonitor(url){
  const res = await fetch('http://localhost:3000/monitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Network response not ok');
  return await res.json();
}

function renderMonitorCard(monitorId, url){
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.monitorId = monitorId;
  card.innerHTML = `
    <div class="row">
      <div class="url">${escapeHtml(url)}</div>
      <div class="status status-degraded" aria-live="polite">
        <span class="dot"></span>
        <span class="status-text">PENDING</span>
      </div>
    </div>
    <div class="meta">
      <div class="item">
        <span class="label">Latency</span>
        <span class="latency">— ms</span>
      </div>
      <div class="item">
        <span class="label">Uptime</span>
        <span class="uptime">— %</span>
      </div>
      <div class="item">
        <span class="label">Last checked</span>
        <span class="last-checked small time">—</span>
      </div>
    </div>
  `;
  monitorsRoot.prepend(card);
}

function startSSE(monitorId) {
  if (sseMap.has(monitorId)) return;

  const url = 'http://localhost:3000/status/' + encodeURIComponent(monitorId);
  console.log('🔌 Opening SSE:', url);

  const es = new EventSource(url);

  es.onopen = () => {
    console.log('✅ SSE connection OPEN for', monitorId);
  };

  es.onmessage = (ev) => {
    console.log('📩 SSE message (default):', ev.data);
  };

  es.addEventListener('status', (ev) => {
    console.log('🔥 SSE STATUS EVENT:', ev.data);
    try {
      const data = JSON.parse(ev.data);
      console.log('📊 Parsed data:', data);
      
      // Log the specific fields we're checking
      console.log('  - success:', data.success, typeof data.success);
      console.log('  - latency:', data.latency, typeof data.latency);
      console.log('  - uptimePercent:', data.uptimePercent, typeof data.uptimePercent);
      console.log('  - empty flag:', data.empty);
      
      updateMonitorCard(monitorId, data);
    } catch (err) {
      console.error('❌ Failed to parse SSE data:', err);
    }
  });

  es.onerror = (err) => {
    console.error('❌ SSE error for', monitorId, err, 'readyState=', es.readyState);
  };

  sseMap.set(monitorId, es);
}

function updateMonitorCard(monitorId, data){
  const card = monitorsRoot.querySelector(`article[data-monitor-id="${monitorId}"]`);
  if (!card) {
    console.warn('⚠️ Card not found for monitor:', monitorId);
    return;
  }
  
  const statusEl = card.querySelector('.status');
  const statusText = card.querySelector('.status-text');
  const latencyEl = card.querySelector('.latency');
  const uptimeEl = card.querySelector('.uptime');
  const lastCheckedEl = card.querySelector('.last-checked');

  // Determine status
  let s = 'PENDING';
  if (data.success === true) {
    s = 'UP';
    console.log('✅ Status: UP');
  } else if (data.success === false) {
    s = 'DOWN';
    console.log('❌ Status: DOWN');
  } else {
    console.log('⏳ Status: PENDING (success is', data.success, ')');
  }

  // Update status
  statusEl.classList.remove('status-up','status-down','status-degraded');
  if (s === 'UP') statusEl.classList.add('status-up');
  else if (s === 'DOWN') statusEl.classList.add('status-down');
  else statusEl.classList.add('status-degraded');
  statusText.textContent = s;

  // Update latency
  if (typeof data.latency === 'number') {
    latencyEl.textContent = `${Math.round(data.latency)} ms`;
    console.log('⚡ Latency updated:', data.latency);
  }
  
  // Update uptime
  if (typeof data.uptimePercent === 'number') {
    uptimeEl.textContent = formatPercent(data.uptimePercent);
    console.log('📈 Uptime updated:', data.uptimePercent);
  }

  // Update timestamp
  if (data.timestamp) {
    lastCheckedEl.textContent = formatTimestamp(data.timestamp);
    console.log('🕒 Timestamp updated:', data.timestamp);
  }
}

function formatPercent(v){
  return (Number(v) || 0).toFixed(2) + ' %';
}

function formatTimestamp(t){
  const d = new Date(t);
  if (isNaN(d)) return String(t);
  return d.toLocaleString();
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

window.createMonitor = createMonitor;
window.renderMonitorCard = renderMonitorCard;
window.startSSE = startSSE;
window.updateMonitorCard = updateMonitorCard;