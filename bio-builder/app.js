// ─── PASSWORD GATE ─────────────────────────────────────────────
const PASSWORD_HASH = '763f90da109f3c87d7db257083b856cfd18b317981e91222cf220a1c3933e1c1';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function submitGate() {
  const input = document.getElementById('gateInput');
  const error = document.getElementById('gateError');
  const hash  = await sha256(input.value);

  if (hash === PASSWORD_HASH) {
    sessionStorage.setItem('rmp_auth', '1');
    const gate = document.getElementById('gate');
    gate.classList.add('gate-out');
    gate.addEventListener('animationend', () => gate.remove());
    initApp();
  } else {
    input.value = '';
    error.classList.add('visible');
    input.classList.add('gate-shake');
    input.addEventListener('animationend', () => input.classList.remove('gate-shake'), { once: true });
    input.focus();
  }
}

function initGate() {
  if (sessionStorage.getItem('rmp_auth') === '1') {
    document.getElementById('gate').remove();
    initApp();
    return;
  }
  document.getElementById('gateSubmit').addEventListener('click', submitGate);
  document.getElementById('gateInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitGate();
    document.getElementById('gateError').classList.remove('visible');
  });
  document.getElementById('gateInput').focus();
}

// ─── CONFIGURATION ─────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxtWLCPcmi64VwBP7dEHn677SOzbWezr8HI6Ekm4RFXnMzXaBpIttxdMajeYFYwXf97/exec";
const TABS = ["Film/TV", "Musician", "Digital", "Athlete", "Culinary"];

// ─── STATE ─────────────────────────────────────────────────────
let roster = {};          // { "Film/TV": ["Jane Doe", ...], ... }
let selected = [];        // [{ name, category }, ...]
let activeTab = "Film/TV";
let isGenerating = false; // guard against double-submit
let generateTimer = null;
let generateSeconds = 0;

// ─── DOM REFS ──────────────────────────────────────────────────
const rosterPanels  = document.getElementById('rosterPanels');
const rosterLoading = document.getElementById('rosterLoading');
const rosterFilter  = document.getElementById('rosterFilter');
const tray          = document.getElementById('tray');
const trayEmpty     = document.getElementById('trayEmpty');
const selectionCount= document.getElementById('selectionCount');
const clearAllBtn   = document.getElementById('clearAllBtn');
const generateBtn   = document.getElementById('generateBtn');
const generateMeta  = document.getElementById('generateMeta');
const docTitleInput = document.getElementById('docTitle');
const resultEl      = document.getElementById('result');
const resultTitle   = document.getElementById('resultTitle');
const resultLink    = document.getElementById('resultLink');
const errorEl       = document.getElementById('error');
const footerCount   = document.getElementById('footerCount');

// ─── JSONP HELPER ──────────────────────────────────────────────
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    script.src = `${url}&callback=${callbackName}`;

    window[callbackName] = (data) => {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    script.onerror = () => {
      reject(new Error('Network error — could not reach Apps Script.'));
      delete window[callbackName];
      script.remove();
    };

    document.head.appendChild(script);
  });
}

// ─── FETCH ROSTER ──────────────────────────────────────────────
async function fetchRoster() {
  try {
    const data = await jsonp(`${APPS_SCRIPT_URL}?action=getRoster`);

    if (!data.success) throw new Error(data.error || "Failed to load roster.");

    roster = data.roster;
    renderRoster();
    updateFooterCount();
  } catch (err) {
    rosterLoading.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'roster-error';

    const msg = document.createElement('div');
    msg.className = 'roster-error-msg';
    msg.textContent = `Roster failed to load: ${err.message}`;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'roster-retry';
    retryBtn.textContent = 'Try again';
    retryBtn.addEventListener('click', () => {
      rosterLoading.innerHTML = '';
      const pulse = document.createElement('div');
      pulse.className = 'dot-pulse';
      pulse.innerHTML = '<span></span><span></span><span></span>';
      rosterLoading.appendChild(pulse);
      rosterLoading.appendChild(document.createTextNode('Loading roster from Google Sheets...'));
      rosterFilter.disabled = false;
      generateMeta.textContent = 'Select talent and enter a title to continue';
      fetchRoster();
    });

    wrap.appendChild(msg);
    wrap.appendChild(retryBtn);
    rosterLoading.appendChild(wrap);

    rosterFilter.disabled = true;
    generateMeta.textContent = 'Roster unavailable — generation disabled';
  }
}

// ─── RENDER ROSTER ─────────────────────────────────────────────
function renderRoster() {
  rosterLoading.remove();

  TABS.forEach((tab, i) => {
    const people = roster[tab] || [];

    // Update tab count badge
    const countEl = document.getElementById(`count-${tab}`);
    if (countEl) countEl.textContent = people.length ? `(${people.length})` : '';

    // Create panel
    const panel = document.createElement('div');
    panel.className = `people-panel${i === 0 ? ' active' : ''}`;
    panel.id = `panel-${tab}`;

    if (people.length === 0) {
      panel.innerHTML = `<div style="font-size:11px;color:var(--ink-muted);padding:20px 0;letter-spacing:0.05em;">No talent in this category yet.</div>`;
    } else {
      const grid = document.createElement('div');
      grid.className = 'people-grid';

      people.forEach(({ name, exclusivity, exclusivitySummary }) => {
        const card = document.createElement('div');
        card.className = 'person-card';
        card.dataset.name = name;
        card.dataset.category = tab;

        const nameEl = document.createElement('div');
        nameEl.className = 'person-name';

        const hasExclusivity = exclusivity || exclusivitySummary;
        if (hasExclusivity) {
          nameEl.textContent = name;
          const asterisk = document.createElement('span');
          asterisk.className = 'exclusivity-asterisk';
          asterisk.textContent = '*';
          nameEl.appendChild(asterisk);

          const tooltip = document.createElement('div');
          tooltip.className = 'exclusivity-tooltip';
          if (exclusivitySummary) {
            const h = document.createElement('div');
            h.className = 'tooltip-heading';
            h.textContent = 'Exclusivity Summary';
            const p = document.createElement('div');
            p.className = 'tooltip-body';
            p.textContent = exclusivitySummary;
            tooltip.appendChild(h);
            tooltip.appendChild(p);
          }
          if (exclusivity) {
            const h = document.createElement('div');
            h.className = 'tooltip-heading';
            h.textContent = 'Exclusivity';
            const p = document.createElement('div');
            p.className = 'tooltip-body';
            p.textContent = exclusivity;
            tooltip.appendChild(h);
            tooltip.appendChild(p);
          }
          card.appendChild(tooltip);
        } else {
          nameEl.textContent = name;
        }

        const catEl = document.createElement('div');
        catEl.className = 'person-category';
        catEl.textContent = tab;
        card.appendChild(nameEl);
        card.appendChild(catEl);
        card.addEventListener('click', () => togglePerson(name, tab, card));
        grid.appendChild(card);
      });

      panel.appendChild(grid);
    }

    rosterPanels.appendChild(panel);
  });
}

// ─── FILTER ROSTER ─────────────────────────────────────────────
function filterRoster() {
  const query = rosterFilter.value.trim().toLowerCase();
  const activePanel = document.getElementById(`panel-${activeTab}`);
  if (!activePanel) return;

  const cards = activePanel.querySelectorAll('.person-card');
  let visibleCount = 0;

  cards.forEach(card => {
    const matches = card.dataset.name.toLowerCase().includes(query);
    card.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  let noResults = activePanel.querySelector('.filter-empty');
  if (visibleCount === 0 && query.length > 0) {
    if (!noResults) {
      noResults = document.createElement('div');
      noResults.className = 'filter-empty';
      activePanel.appendChild(noResults);
    }
    noResults.textContent = `No results for "${rosterFilter.value.trim()}"`;
    noResults.style.display = '';
  } else if (noResults) {
    noResults.style.display = 'none';
  }
}

rosterFilter.addEventListener('input', filterRoster);

// ─── TAB SWITCHING ─────────────────────────────────────────────
document.getElementById('categoryTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;

  const tab = btn.dataset.tab;
  activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.people-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.add('active');

  rosterFilter.value = '';
  filterRoster();
});

// ─── TOGGLE PERSON ─────────────────────────────────────────────
function togglePerson(name, category, card) {
  const idx = selected.findIndex(s => s.name === name && s.category === category);

  if (idx > -1) {
    selected.splice(idx, 1);
    card.classList.remove('selected');
  } else {
    selected.push({ name, category });
    card.classList.add('selected');
  }

  renderTray();
  updateGenerateBtn();
}

// ─── CLEAR ALL ─────────────────────────────────────────────────
function clearAll() {
  selected = [];
  document.querySelectorAll('.person-card.selected').forEach(card => card.classList.remove('selected'));
  renderTray();
  updateGenerateBtn();
}

clearAllBtn.addEventListener('click', clearAll);

// ─── RENDER TRAY ───────────────────────────────────────────────
let dragSrcIndex = null;

function renderTray() {
  tray.querySelectorAll('.tray-chip').forEach(c => c.remove());

  if (selected.length === 0) {
    trayEmpty.style.display = '';
    selectionCount.textContent = '';
    clearAllBtn.style.display = 'none';
  } else {
    trayEmpty.style.display = 'none';
    selectionCount.textContent = `— ${selected.length} selected`;
    clearAllBtn.style.display = 'block';

    selected.forEach(({ name, category }, index) => {
      const chip = document.createElement('div');
      chip.className = 'tray-chip';
      chip.draggable = true;
      chip.dataset.index = index;

      chip.addEventListener('dragstart', e => {
        dragSrcIndex = index;
        chip.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        tray.querySelectorAll('.tray-chip').forEach(c => c.classList.remove('drag-over'));
      });

      chip.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tray.querySelectorAll('.tray-chip').forEach(c => c.classList.remove('drag-over'));
        chip.classList.add('drag-over');
      });

      chip.addEventListener('drop', e => {
        e.preventDefault();
        if (dragSrcIndex === null || dragSrcIndex === index) return;
        const moved = selected.splice(dragSrcIndex, 1)[0];
        selected.splice(index, 0, moved);
        dragSrcIndex = null;
        renderTray();
      });

      const chipLabel = document.createElement('span');
      chipLabel.textContent = name;
      const chipBtn = document.createElement('button');
      chipBtn.title = 'Remove';
      chipBtn.textContent = '×';
      chipBtn.addEventListener('click', () => removePerson(name, category));
      chip.appendChild(chipLabel);
      chip.appendChild(chipBtn);
      tray.appendChild(chip);
    });
  }
}

// ─── REMOVE PERSON ─────────────────────────────────────────────
function removePerson(name, category) {
  const idx = selected.findIndex(s => s.name === name && s.category === category);
  if (idx > -1) selected.splice(idx, 1);

  const card = document.querySelector(`.person-card[data-name="${CSS.escape(name)}"][data-category="${CSS.escape(category)}"]`);
  if (card) card.classList.remove('selected');

  renderTray();
  updateGenerateBtn();
}

// ─── UPDATE GENERATE BUTTON ────────────────────────────────────
function updateGenerateBtn() {
  const hasTitle = docTitleInput.value.trim().length > 0;
  const hasSelections = selected.length > 0;

  generateBtn.disabled = !(hasTitle && hasSelections);

  if (!hasTitle && !hasSelections) {
    generateMeta.textContent = 'Select talent and enter a title to continue';
  } else if (!hasTitle) {
    generateMeta.textContent = 'Enter a document title to continue';
  } else if (!hasSelections) {
    generateMeta.textContent = 'Select at least one person to continue';
  } else {
    generateMeta.textContent = `Ready — ${selected.length} ${selected.length === 1 ? 'person' : 'people'} selected`;
  }
}

docTitleInput.addEventListener('input', updateGenerateBtn);

// ─── GENERATE DOCUMENT ─────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  if (isGenerating) return;
  const title = docTitleInput.value.trim();
  if (!title || selected.length === 0) return;

  isGenerating = true;

  // Reset UI
  resultEl.style.display = 'none';
  errorEl.style.display = 'none';
  generateBtn.disabled = true;
  generateBtn.querySelector('span').textContent = 'Generating…';
  generateSeconds = 0;
  generateMeta.textContent = 'Building your document… 0:00';
  generateTimer = setInterval(() => {
    generateSeconds++;
    const m = Math.floor(generateSeconds / 60);
    const s = generateSeconds % 60;
    generateMeta.textContent = `Building your document… ${m}:${String(s).padStart(2, '0')}`;
  }, 1000);

  try {
    const payload = encodeURIComponent(JSON.stringify({ title, selections: selected }));
    const data = await jsonp(`${APPS_SCRIPT_URL}?action=generateDocument&payload=${payload}`);

    if (!data.success) throw new Error(data.error || 'Document generation failed.');

    // Show result
    resultTitle.textContent = data.docTitle;
    resultLink.href = data.docUrl;
    resultEl.style.display = 'block';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    generateMeta.textContent = 'Document created successfully.';

  } catch (err) {
    errorEl.textContent = `Something went wrong: ${err.message}`;
    errorEl.style.display = 'block';
    generateMeta.textContent = 'An error occurred. Please try again.';
  } finally {
    clearInterval(generateTimer);
    generateTimer = null;
    isGenerating = false;
    generateBtn.disabled = false;
    generateBtn.querySelector('span').textContent = 'Generate Document';
    updateGenerateBtn();
  }
});

// ─── FOOTER COUNT ──────────────────────────────────────────────
function updateFooterCount() {
  const total = Object.values(roster).reduce((sum, arr) => sum + arr.length, 0);  // arr is now [{name,...}]
  footerCount.textContent = `${total} talent on roster`;
}

// ─── INIT ──────────────────────────────────────────────────────
function initApp() {
  fetchRoster();
}

initGate();
