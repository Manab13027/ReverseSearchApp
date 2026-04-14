// public/app.js
'use strict';

const ENGINE_NAMES = ['google', 'yandex', 'tineye', 'bing', 'saucenao', 'baidu'];

const state = {
  files: [],
  engines: {},
  useTor: false,
  activeFile: null,
  activeEngine: null,
  results: {},
  engineStatus: {},
};

async function checkTorStatus() {
  try {
    const { running } = await fetch('/api/tor/status').then(r => r.json());
    const dot = document.getElementById('torDot');
    if (running) {
      dot.className = 'tor-dot tor-up';
      dot.title = 'Tor running';
    } else {
      dot.className = 'tor-dot tor-down';
      dot.title = 'Tor not running';
    }
  } catch (_) {}
}

async function boot() {
  const cfg = await fetch('/api/config/engines').then(r => r.json());
  ENGINE_NAMES.forEach(function(name) {
    state.engines[name] = cfg[name] !== false;
  });
  renderEngineChips(cfg);
  bindEvents();
  checkTorStatus();
  setInterval(checkTorStatus, 5000);
}

function renderEngineChips(cfg) {
  const container = document.getElementById('engineChips');
  container.textContent = '';
  ENGINE_NAMES.forEach(function(name) {
    const hasKey = cfg[name];
    const chip = document.createElement('span');
    chip.className = 'engine-chip ' + (state.engines[name] ? 'on' : 'off') + (hasKey === false ? ' disabled-key' : '');
    chip.dataset.engine = name;
    if (hasKey === false) chip.title = 'API key not configured';
    chip.textContent = (state.engines[name] ? '\u2713 ' : '') + name.toUpperCase();
    if (hasKey !== false) chip.addEventListener('click', function() { toggleEngine(name, cfg); });
    container.appendChild(chip);
  });
}

function toggleEngine(name, cfg) {
  state.engines[name] = !state.engines[name];
  const chip = document.querySelector('.engine-chip[data-engine="' + name + '"]');
  chip.className = 'engine-chip ' + (state.engines[name] ? 'on' : 'off');
  chip.textContent = (state.engines[name] ? '\u2713 ' : '') + name.toUpperCase();
}

function bindTorToggle() {
  document.getElementById('torToggle').addEventListener('click', function(e) {
    const opt = e.target.closest('.pill-opt');
    if (!opt) return;
    state.useTor = opt.dataset.val === 'on';
    document.querySelectorAll('.pill-opt').forEach(function(el) { el.classList.remove('active'); });
    opt.classList.add('active');
    const torStatus = document.getElementById('statusTor');
    torStatus.textContent = '';
    if (state.useTor) {
      const span = document.createElement('span');
      span.className = 'status-tor';
      span.textContent = 'TOR ACTIVE';
      torStatus.appendChild(span);
    }
  });
}

function bindDropZone() {
  const zone = document.getElementById('dropZone');
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
  });
  document.getElementById('browseBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function(e) {
    addFiles(Array.from(e.target.files));
    e.target.value = '';
  });
}

function addFiles(newFiles) {
  newFiles.forEach(function(f) {
    if (!state.files.find(function(x) { return x.name === f.name && x.size === f.size; })) {
      state.files.push(f);
    }
  });
  renderFileQueue();
}

function renderFileQueue() {
  const queue = document.getElementById('fileQueue');
  queue.textContent = '';
  state.files.forEach(function(f, i) {
    const isVideo = /\.(mp4|mov|avi)$/i.test(f.name);
    const chip = document.createElement('div');
    chip.className = 'file-chip';

    const icon = document.createElement('span');
    icon.textContent = isVideo ? '[vid]' : '[img]';

    const name = document.createElement('span');
    name.textContent = f.name;

    const remove = document.createElement('span');
    remove.className = 'chip-remove';
    remove.textContent = 'x';
    remove.dataset.idx = String(i);
    remove.addEventListener('click', function() {
      state.files.splice(Number(remove.dataset.idx), 1);
      renderFileQueue();
    });

    chip.appendChild(icon);
    chip.appendChild(name);
    chip.appendChild(remove);
    queue.appendChild(chip);
  });
}

function bindScan() {
  document.getElementById('scanBtn').addEventListener('click', startScan);
}

async function startScan() {
  if (!state.files.length) return;
  const selectedEngines = ENGINE_NAMES.filter(function(n) { return state.engines[n]; });
  if (!selectedEngines.length) return;

  state.results = {};
  state.engineStatus = {};
  state.activeFile = state.files[0].name;
  state.activeEngine = selectedEngines[0];

  state.files.forEach(function(f) {
    state.results[f.name] = {};
    state.engineStatus[f.name] = {};
    selectedEngines.forEach(function(e) {
      state.results[f.name][e] = [];
      state.engineStatus[f.name][e] = 'loading';
    });
  });

  document.getElementById('scanBtn').disabled = true;
  document.getElementById('resultsContainer').style.display = 'block';
  renderFileTabs();
  renderEngineTabs();
  renderGrid();

  const form = new FormData();
  state.files.forEach(function(f) { form.append('files', f); });
  form.append('engines', JSON.stringify(selectedEngines));
  form.append('useTor', String(state.useTor));

  const res = await fetch('/api/search', { method: 'POST', body: form });
  const { jobId } = await res.json();

  const sse = new EventSource('/api/search/' + jobId + '/stream');

  sse.addEventListener('result', function(e) {
    const r = JSON.parse(e.data);
    if (state.results[r.sourceFile] && state.results[r.sourceFile][r.engine]) {
      state.results[r.sourceFile][r.engine].push(r);
    }
    if (state.activeFile === r.sourceFile && state.activeEngine === r.engine) {
      appendCard(r);
    }
    refreshEngineTabLabel(r.sourceFile, r.engine);
  });

  sse.addEventListener('engineDone', function(e) {
    const { engine } = JSON.parse(e.data);
    state.files.forEach(function(f) {
      if (state.engineStatus[f.name] && state.engineStatus[f.name][engine] === 'loading') {
        state.engineStatus[f.name][engine] = 'done';
      }
    });
    renderEngineTabs();
    updateStatusBar();
  });

  sse.addEventListener('engineError', function(e) {
    const { engine } = JSON.parse(e.data);
    state.files.forEach(function(f) {
      if (state.engineStatus[f.name] && state.engineStatus[f.name][engine]) {
        state.engineStatus[f.name][engine] = 'error';
      }
    });
    renderEngineTabs();
  });

  sse.addEventListener('done', function() {
    sse.close();
    document.getElementById('scanBtn').disabled = false;
  });
}

function renderFileTabs() {
  const container = document.getElementById('fileTabs');
  container.textContent = '';
  state.files.forEach(function(f) {
    const isVideo = /\.(mp4|mov|avi)$/i.test(f.name);
    const tab = document.createElement('div');
    tab.className = 'file-tab' + (state.activeFile === f.name ? ' active' : '');
    tab.dataset.file = f.name;
    tab.textContent = f.name;
    if (isVideo) {
      const badge = document.createElement('span');
      badge.className = 'frame-badge';
      badge.textContent = '[video]';
      tab.appendChild(badge);
    }
    tab.addEventListener('click', function() {
      state.activeFile = f.name;
      const engines = Object.keys(state.engineStatus[f.name] || {});
      if (engines.length) state.activeEngine = engines[0];
      renderFileTabs();
      renderEngineTabs();
      renderGrid();
    });
    container.appendChild(tab);
  });
}

function renderEngineTabs() {
  const container = document.getElementById('engineTabs');
  container.textContent = '';
  const statuses = state.engineStatus[state.activeFile] || {};
  const results = state.results[state.activeFile] || {};

  Object.keys(statuses).forEach(function(engine) {
    const count = (results[engine] || []).length;
    const status = statuses[engine];
    const tab = document.createElement('div');
    tab.className = 'engine-tab' + (state.activeEngine === engine ? ' active' : '') + ' ' + status;
    tab.dataset.engine = engine;
    if (status === 'loading') tab.textContent = engine.toUpperCase() + ' ...';
    else if (status === 'error') tab.textContent = engine.toUpperCase() + ' (err)';
    else tab.textContent = engine.toUpperCase() + ' (' + count + ')';
    tab.addEventListener('click', function() {
      state.activeEngine = engine;
      renderEngineTabs();
      renderGrid();
    });
    container.appendChild(tab);
  });
}

function refreshEngineTabLabel(file, engine) {
  if (state.activeFile !== file) return;
  const tab = document.querySelector('.engine-tab[data-engine="' + engine + '"]');
  if (!tab || tab.classList.contains('loading')) return;
  const count = (state.results[file] && state.results[file][engine] ? state.results[file][engine].length : 0);
  tab.textContent = engine.toUpperCase() + ' (' + count + ')';
}

function renderGrid() {
  const grid = document.getElementById('resultsGrid');
  grid.textContent = '';
  const list = (state.results[state.activeFile] && state.results[state.activeFile][state.activeEngine])
    ? state.results[state.activeFile][state.activeEngine] : [];
  if (!list.length) {
    const msg = document.createElement('div');
    msg.className = 'no-results';
    const isLoading = state.engineStatus[state.activeFile] && state.engineStatus[state.activeFile][state.activeEngine] === 'loading';
    msg.textContent = isLoading ? 'SCANNING...' : 'NO RESULTS';
    grid.appendChild(msg);
    return;
  }
  list.forEach(function(r) { appendCard(r); });
}

function appendCard(r) {
  if (state.activeFile !== r.sourceFile || state.activeEngine !== r.engine) return;
  const grid = document.getElementById('resultsGrid');
  const placeholder = grid.querySelector('.no-results');
  if (placeholder) placeholder.remove();

  const card = document.createElement('a');
  card.className = 'result-card';
  let safeUrl = '#';
  try {
    const urlObj = new URL(r.url);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') safeUrl = r.url;
  } catch (_) {}
  card.setAttribute('href', safeUrl);
  card.setAttribute('target', '_blank');
  card.setAttribute('rel', 'noopener noreferrer');

  const thumbDiv = document.createElement('div');
  thumbDiv.className = 'card-thumb';
  let safeThumbnail = null;
  if (r.thumbnail) {
    try {
      const tUrl = new URL(r.thumbnail);
      if (tUrl.protocol === 'http:' || tUrl.protocol === 'https:') safeThumbnail = r.thumbnail;
    } catch (_) {}
  }
  if (safeThumbnail) {
    const img = document.createElement('img');
    img.setAttribute('src', safeThumbnail);
    img.setAttribute('alt', '');
    img.setAttribute('loading', 'lazy');
    img.onerror = function() {
      thumbDiv.textContent = '';
      const span = document.createElement('span');
      span.className = 'card-no-thumb';
      span.textContent = '[NO PREVIEW]';
      thumbDiv.appendChild(span);
    };
    thumbDiv.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'card-no-thumb';
    span.textContent = '[NO PREVIEW]';
    thumbDiv.appendChild(span);
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'card-info';

  const urlSpan = document.createElement('span');
  urlSpan.className = 'card-url';
  try { urlSpan.textContent = new URL(r.url).hostname; } catch (_) { urlSpan.textContent = r.url; }
  infoDiv.appendChild(urlSpan);

  if (r.score !== null || r.frameIndex !== null) {
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'card-score';
    scoreDiv.textContent = r.score !== null
      ? ('> ' + Math.round(r.score * 100) + '% match')
      : ('> frame ' + r.frameIndex);
    infoDiv.appendChild(scoreDiv);
  }

  card.appendChild(thumbDiv);
  card.appendChild(infoDiv);
  grid.appendChild(card);
}

function updateStatusBar() {
  const allStatuses = Object.values(state.engineStatus).flatMap(function(f) { return Object.values(f); });
  const done = allStatuses.filter(function(s) { return s === 'done'; }).length;
  const total = allStatuses.length;
  const left = document.getElementById('statusLeft');
  left.textContent = '';
  const span = document.createElement('span');
  span.className = done === total ? 'status-ok' : '';
  span.textContent = done + '/' + total + ' engines complete';
  left.appendChild(span);
}

function bindEvents() {
  bindTorToggle();
  bindDropZone();
  bindScan();
}

boot();
