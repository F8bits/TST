/* ── LOOKUPS ─────────────────────────────────────────────────────────────── */
const allNodes  = ROADMAP_DATA.flatMap(lv => lv.nodes);
const nodeById  = new Map(allNodes.map(n => [n.id, n]));

/* ── STORAGE ─────────────────────────────────────────────────────────────── */
function readDoneFromStorage() {
  try {
    const raw    = localStorage.getItem('math_done');
    const stored = JSON.parse(raw || '[]');
    if (!Array.isArray(stored)) {
      localStorage.removeItem('math_done');
      return new Set();
    }
    return new Set(stored.filter(id => typeof id === 'string' && nodeById.has(id)));
  } catch {
    localStorage.removeItem('math_done');
    return new Set();
  }
}

function saveDone() {
  try {
    localStorage.setItem('math_done', JSON.stringify([...done]));
    return true;
  } catch {
    showFeedback('Falha ao salvar (armazenamento cheio ou bloqueado).', true);
    return false;
  }
}

const done = readDoneFromStorage();

/* ── BUSINESS RULE: UNLOCK ────────────────────────────────────────────────
   A node is unlocked when ALL its requires are in done.
   Nodes with no requires are always unlocked.
─────────────────────────────────────────────────────────────────────────── */
function isUnlocked(node) {
  return !node.requires || node.requires.every(id => done.has(id));
}

/* ── DOM REFS ────────────────────────────────────────────────────────────── */
const modalOverlay  = document.getElementById('modal');
const modalBox      = document.getElementById('modal-box');
const progressWrap  = document.querySelector('.progress-bar-wrap');
const feedbackEl    = document.getElementById('feedback');
const searchInput   = document.getElementById('search-input');
const pageRoots     = [document.querySelector('header'), document.querySelector('main')];
const supportsInert = 'inert' in HTMLElement.prototype;

let currentNode       = null;
let lastFocusedEl     = null;
let prevBodyOverflow  = '';
let modalFocusables   = [];
let feedbackTimeoutId = null;
let activeFilter      = 'all';

/* ── FEEDBACK ────────────────────────────────────────────────────────────── */
function showFeedback(message, isError = false) {
  feedbackEl.textContent = message;
  feedbackEl.style.color = isError ? 'var(--red)' : 'var(--green)';
  clearTimeout(feedbackTimeoutId);
  feedbackTimeoutId = setTimeout(() => { feedbackEl.textContent = ''; }, 2600);
}

/* ── PROGRESS ────────────────────────────────────────────────────────────── */
function updateProgress() {
  const total     = allNodes.length;
  const n         = done.size;
  const pct       = total === 0 ? 0 : (n / total) * 100;
  const remaining = allNodes
    .filter(nd => !done.has(nd.id))
    .reduce((s, nd) => s + (nd.estimatedHours || 0), 0);

  document.getElementById('pbar').style.width = `${pct}%`;
  document.getElementById('plabel').textContent = `${n} de ${total} tópicos concluídos`;
  document.getElementById('hlabel').textContent =
    remaining > 0 ? `⏱ ~${remaining}h restantes de estudo` : '🎉 Roadmap completo!';
  progressWrap.setAttribute('aria-valuenow', String(n));
  progressWrap.setAttribute('aria-valuemax', String(total));
}

/* ── DEBOUNCE ────────────────────────────────────────────────────────────── */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ── INERT / LOCK ────────────────────────────────────────────────────────── */
function setBackgroundInert(isOpen) {
  pageRoots.forEach(root => {
    if (!root) return;
    if (supportsInert) {
      if (isOpen) root.setAttribute('inert', '');
      else        root.removeAttribute('inert');
    } else {
      if (isOpen) root.setAttribute('aria-hidden', 'true');
      else        root.removeAttribute('aria-hidden');
    }
  });
  document.body.classList.toggle('bg-locked', isOpen && !supportsInert);
}

/* ── SAFE URL ────────────────────────────────────────────────────────────── */
function safeHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {}
  return null;
}

/* ── HASH ────────────────────────────────────────────────────────────────── */
function syncHash(nodeId) {
  const base = `${location.pathname}${location.search}`;
  history.replaceState(null, '', nodeId ? `${base}#${nodeId}` : base);
}

/* ── FOCUS TRAP CACHE ────────────────────────────────────────────────────── */
function recalcFocusables() {
  modalFocusables = [...modalBox.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.getAttribute('aria-hidden') !== 'true');
}

/* ── RENDER: TAGS ────────────────────────────────────────────────────────── */
function renderTags(node) {
  const wrap = document.getElementById('modal-tags');
  wrap.textContent = '';

  const tagSub = document.createElement('span');
  tagSub.className = 'tag';
  tagSub.textContent = `📚 ${node.sub}`;
  wrap.appendChild(tagSub);

  if (node.estimatedHours) {
    const tagH = document.createElement('span');
    tagH.className = 'tag tag-hours';
    tagH.textContent = `⏱ ~${node.estimatedHours}h`;
    wrap.appendChild(tagH);
  }
}

/* ── RENDER: PREREQ BLOCK ────────────────────────────────────────────────── */
function renderPrereq(node) {
  const block = document.getElementById('prereq-block');
  block.className = 'prereq-block';
  block.textContent = '';

  if (!node.requires || node.requires.length === 0) return;

  const pending = node.requires.filter(rid => !done.has(rid));
  const allDone = pending.length === 0;

  if (allDone) {
    block.className = 'prereq-block done-req';
    block.textContent = `✅ Pré-requisito concluído: ${node.requires.map(r => nodeById.get(r)?.title || r).join(', ')}`;
  } else {
    block.className = 'prereq-block pending';
    block.textContent = `⚠️ Pré-requisito pendente: ${pending.map(r => nodeById.get(r)?.title || r).join(', ')}`;
  }
}

/* ── RENDER: MARK BUTTON ─────────────────────────────────────────────────── */
function renderMarkBtn(node) {
  const btn    = document.getElementById('mark-btn');
  const isDone = done.has(node.id);
  const locked = !isUnlocked(node);

  btn.disabled = locked;
  btn.className = `mark-btn${isDone ? ' undone' : ''}`;

  if (locked) {
    const pending = (node.requires || []).filter(r => !done.has(r));
    const names   = pending.map(r => nodeById.get(r)?.title || r).join(', ');
    btn.textContent = `🔒 Conclua primeiro: ${names}`;
  } else {
    btn.textContent = isDone ? '↩ Marcar como não concluído' : '✓ Marcar como concluído';
  }
}

/* ── RENDER: TOPICS ──────────────────────────────────────────────────────── */
function renderTopics(topics) {
  const list = document.getElementById('modal-topics');
  list.textContent = '';
  topics.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    list.appendChild(li);
  });
}

/* ── RENDER: RESOURCES ───────────────────────────────────────────────────── */
function renderResources(resources) {
  const wrap = document.getElementById('modal-resources');
  wrap.textContent = '';
  const defaultRes = [
    { name: 'Khan Academy', url: 'https://pt.khanacademy.org/' },
    { name: 'Professor Ferretto', url: 'https://www.youtube.com/@ProfessorFerretto' },
  ];
  (resources || defaultRes).forEach(r => {
    const safeUrl = safeHttpUrl(r.url);
    if (!safeUrl) return;
    const item = document.createElement('div');
    item.className = 'resource-item';
    const a = document.createElement('a');
    a.href = safeUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = r.name || 'Recurso';
    item.appendChild(a);
    wrap.appendChild(item);
  });
  if (!wrap.children.length) {
    const emp = document.createElement('div');
    emp.className = 'resource-item';
    emp.textContent = 'Sem recursos cadastrados.';
    wrap.appendChild(emp);
  }
}

/* ── RENDER: QUESTIONS ───────────────────────────────────────────────────── */
function renderQuestions(questions) {
  const wrap = document.getElementById('modal-questions');
  wrap.textContent = '';
  const defaultQ = [{ q: `Explique com suas palavras: ${currentNode?.title}.`, a: 'Resposta pessoal.' }];
  (questions || defaultQ).forEach((q, i) => {
    const details = document.createElement('details');
    details.className = 'question-item';
    const summary = document.createElement('summary');
    summary.textContent = `${i + 1}. ${q.q}`;
    const p = document.createElement('p');
    p.textContent = q.a || 'Sem resposta cadastrada.';
    details.appendChild(summary);
    details.appendChild(p);
    wrap.appendChild(details);
  });
}

/* ── TABS ────────────────────────────────────────────────────────────────── */
function switchTab(tabId, focusTab = true) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
    if (active && focusTab) btn.focus();
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const active = panel.id === `tab-${tabId}`;
    panel.classList.toggle('active', active);
    panel.toggleAttribute('hidden', !active);
  });
  // FIX: recalculate focus trap after tab change (visible elements change)
  recalcFocusables();
}

function getActiveTab() {
  return document.querySelector('.tab-btn.active')?.dataset.tab || 'overview';
}

/* ── MODAL ───────────────────────────────────────────────────────────────── */
function openModal(nodeData, triggerEl = null) {
  const wasOpen  = modalOverlay.classList.contains('open');
  const activeTab = wasOpen ? getActiveTab() : 'overview';
  currentNode = nodeData;

  document.getElementById('modal-icon').textContent = nodeData.icon;
  document.getElementById('modal-title').textContent = nodeData.title;
  document.getElementById('modal-desc').textContent = nodeData.desc;

  renderTags(nodeData);
  renderPrereq(nodeData);
  renderMarkBtn(nodeData);
  renderTopics(nodeData.topics);
  renderResources(nodeData.resources);
  renderQuestions(nodeData.questions);

  if (!wasOpen) {
    lastFocusedEl = triggerEl || document.activeElement;
    modalOverlay.classList.add('open');
    modalOverlay.setAttribute('aria-hidden', 'false');
    setBackgroundInert(true);
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onModalKeydown, true);
  }

  syncHash(nodeData.id);
  switchTab(activeTab, false); // switchTab calls recalcFocusables internally
  document.getElementById('mark-btn').focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalOverlay.setAttribute('aria-hidden', 'true');
  setBackgroundInert(false);
  document.body.style.overflow = prevBodyOverflow;
  document.removeEventListener('keydown', onModalKeydown, true);
  syncHash('');
  currentNode = null;
  if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
}

function onModalKeydown(e) {
  if (!modalOverlay.classList.contains('open')) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab') return;
  if (!modalFocusables.length) return;

  const first = modalFocusables[0];
  const last  = modalFocusables[modalFocusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

/* ── TOGGLE DONE ─────────────────────────────────────────────────────────── */
function toggleDone() {
  if (!currentNode) return;

  // Enforce requires before marking as done
  if (!done.has(currentNode.id) && !isUnlocked(currentNode)) {
    const pending  = (currentNode.requires || []).filter(r => !done.has(r));
    const reqNames = pending.map(r => nodeById.get(r)?.title || r).join(', ');
    showFeedback(`Conclua primeiro: ${reqNames}`, true);
    return;
  }

  if (done.has(currentNode.id)) done.delete(currentNode.id);
  else done.add(currentNode.id);

  saveDone();
  updateProgress();
  buildRoadmap();
  applySearchAndFilter();
  openModal(currentNode);
}

/* ── NODE VISUAL STATE ───────────────────────────────────────────────────── */
function updateNodeVisualState(nodeId) {
  const btn = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!btn) return;
  const nd        = nodeById.get(nodeId);
  const isDone    = done.has(nodeId);
  const isLocked  = !isDone && !isUnlocked(nd);
  btn.className   = `node${isDone ? ' done' : ''}${isLocked ? ' locked' : ''}`;
  btn.setAttribute('aria-label',
    `${nd.title}${isDone ? ' — concluído' : ''}${isLocked ? ' — bloqueado' : ''}`
  );
}

/* ── BUILD DOM ───────────────────────────────────────────────────────────── */
function buildRoadmap() {
  const container = document.getElementById('roadmap');
  container.textContent = '';

  ROADMAP_DATA.forEach((lv, li) => {
    const section = document.createElement('section');
    section.className = `level ${lv.id}`;
    section.dataset.levelId = lv.id;

    // Level header
    const hdr   = document.createElement('div');
    hdr.className = 'level-header';
    const badge = document.createElement('span');
    badge.className = `level-badge ${lv.badge}`;
    badge.textContent = lv.label;
    hdr.appendChild(badge);
    section.appendChild(hdr);

    // Node row
    const row = document.createElement('div');
    row.className = 'nodes-row';

    lv.nodes.forEach(nd => {
      const isCompleted = done.has(nd.id);
      const isLocked    = !isCompleted && !isUnlocked(nd);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `node${isCompleted ? ' done' : ''}${isLocked ? ' locked' : ''}`;
      btn.dataset.nodeId = nd.id;
      btn.setAttribute('aria-label',
        `${nd.title}${isCompleted ? ' — concluído' : ''}${isLocked ? ' — bloqueado' : ''}`
      );
      // A11Y FIX: communicate that button opens a dialog
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-controls', 'modal-box');
      btn.dataset.search = `${nd.title} ${nd.sub} ${nd.desc} ${nd.topics.join(' ')}`.toLowerCase();

      const icon = document.createElement('div');
      icon.className = 'node-icon';
      icon.textContent = nd.icon;
      icon.setAttribute('aria-hidden', 'true');

      const title = document.createElement('div');
      title.className = 'node-title';
      title.textContent = nd.title;

      const sub = document.createElement('div');
      sub.className = 'node-sub';
      sub.textContent = nd.sub;

      const hours = document.createElement('div');
      hours.className = 'node-hours';
      if (nd.estimatedHours) hours.textContent = `⏱ ~${nd.estimatedHours}h`;

      btn.append(icon, title, sub, hours);
      row.appendChild(btn);
    });

    section.appendChild(row);

    if (li < ROADMAP_DATA.length - 1) {
      const conn = document.createElement('div');
      conn.className = 'connector';
      conn.setAttribute('aria-hidden', 'true');
      conn.textContent = '⬇';
      section.appendChild(conn);
    }

    container.appendChild(section);
  });

  updateProgress();
}

/* ── SEARCH + FILTER ─────────────────────────────────────────────────────── */
function applySearchAndFilter() {
  const query      = searchInput.value.trim().toLowerCase();
  const emptyState = document.getElementById('empty-state');
  let totalVisible = 0;

  ROADMAP_DATA.forEach(lv => {
    const section = document.querySelector(`.level.${lv.id}`);
    if (!section) return;

    let lvVisible = 0;
    section.querySelectorAll('[data-node-id]').forEach(btn => {
      const nd = nodeById.get(btn.dataset.nodeId);
      if (!nd) return;

      const matchSearch = !query || btn.dataset.search.includes(query);
      const matchFilter =
        activeFilter === 'all' ||
        (activeFilter === 'done'    &&  done.has(nd.id)) ||
        (activeFilter === 'pending' && !done.has(nd.id));

      const visible = matchSearch && matchFilter;
      btn.style.display = visible ? '' : 'none';
      if (visible) lvVisible++;
    });

    // Hide entire level section when no nodes are visible
    section.classList.toggle('hidden', lvVisible === 0);
    totalVisible += lvVisible;
  });

  if (totalVisible === 0 && (query || activeFilter !== 'all')) {
    document.getElementById('empty-query').textContent = query || activeFilter;
    emptyState.classList.add('visible');
  } else {
    emptyState.classList.remove('visible');
  }

  if (query) {
    showFeedback(
      totalVisible > 0 ? `${totalVisible} tópico(s) encontrado(s).` : '',
      totalVisible === 0
    );
  }
}

const debouncedSearch = debounce(applySearchAndFilter, 250);

/* ── EVENTS ──────────────────────────────────────────────────────────────── */

// Open modal on card click (locked cards still open — show info but button is disabled)
document.getElementById('roadmap').addEventListener('click', e => {
  const target = e.target.closest('[data-node-id]');
  if (!target) return;
  const nd = nodeById.get(target.dataset.nodeId);
  if (!nd) return;
  openModal(nd, target);
});

// Modal close
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.getElementById('close-btn').addEventListener('click', closeModal);

// Mark done / undo
document.getElementById('mark-btn').addEventListener('click', toggleDone);

// Tab keyboard nav (roving tabindex + ArrowLeft/Right/Home/End)
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelector('.modal-tabs').addEventListener('keydown', e => {
  const tabs = [...document.querySelectorAll('.tab-btn')];
  const idx  = tabs.indexOf(document.activeElement);
  if (idx < 0) return;
  let next = null;
  if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
  if (e.key === 'ArrowLeft')  next = (idx - 1 + tabs.length) % tabs.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End')  next = tabs.length - 1;
  if (next === null) return;
  e.preventDefault();
  switchTab(tabs[next].dataset.tab);
});

// Filters — A11Y FIX: aria-pressed reflects active state
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    applySearchAndFilter();
  });
});

// Search
searchInput.addEventListener('input', debouncedSearch);

// Clear progress
document.getElementById('clear-btn').addEventListener('click', () => {
  if (!confirm('Deseja remover todo o progresso salvo neste navegador?')) return;
  done.clear();
  saveDone();
  buildRoadmap();
  applySearchAndFilter();
  updateProgress();
  showFeedback('Progresso limpo com sucesso.');
});

// Share link
document.getElementById('share-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    showFeedback('Link copiado!');
  } catch {
    const ok = prompt('Copie o link abaixo:', location.href);
    showFeedback(ok === null ? 'Cópia cancelada.' : 'Link exibido para cópia manual.', ok === null);
  }
});

// Next unlocked & pending topic
document.getElementById('next-btn').addEventListener('click', () => {
  // FIX: respects requires — skip locked nodes
  const next = allNodes.find(nd => !done.has(nd.id) && isUnlocked(nd));
  if (!next) {
    showFeedback('Parabéns! Todos os tópicos disponíveis foram concluídos. 🎉');
    return;
  }
  const trigger = document.querySelector(`[data-node-id="${next.id}"]`);
  if (trigger) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    trigger.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }
  openModal(next, trigger || document.getElementById('next-btn'));
});

// Export
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), done: [...done] }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = 'math-roadmap-progress.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showFeedback('Progresso exportado.');
});

// Import
const importFile = document.getElementById('import-file');
document.getElementById('import-btn').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data  = JSON.parse(await file.text());
    const ids   = Array.isArray(data) ? data : data.done;
    if (!Array.isArray(ids)) throw new Error('invalid');
    const valid = ids.filter(id => typeof id === 'string' && nodeById.has(id));
    done.clear();
    valid.forEach(id => done.add(id));
    saveDone();
    buildRoadmap();
    applySearchAndFilter();
    updateProgress();
    showFeedback(`Importação concluída: ${valid.length} tópicos.`);
  } catch {
    showFeedback('Arquivo inválido para importação.', true);
  } finally {
    importFile.value = '';
  }
});

// Deep link via hash
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (!id) { if (modalOverlay.classList.contains('open')) closeModal(); return; }
  const nd = nodeById.get(id);
  if (nd) openModal(nd, document.querySelector(`[data-node-id="${id}"]`) || document.body);
});

/* ── INIT ────────────────────────────────────────────────────────────────── */
buildRoadmap();

// Set initial aria-pressed on filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.setAttribute('aria-pressed', btn.dataset.filter === 'all' ? 'true' : 'false');
});

// Open from deep link
const hashId = location.hash.slice(1);
if (hashId && nodeById.has(hashId)) {
  openModal(nodeById.get(hashId), document.querySelector(`[data-node-id="${hashId}"]`) || document.body);
}
