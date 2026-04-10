/* ── Estado global ─────────────────────────────────────── */
let currentData  = null
let currentFilter = 'all'
let sortCol      = 'plan_seq'
let sortDir      = 'asc'
let mapInstance  = null

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone()
  setupTextarea()
  setupAnalyzeBtn()
})

/* ── Drop zone ─────────────────────────────────────────── */
function setupDropZone() {
  const zone  = document.getElementById('dropZone')
  const input = document.getElementById('fileInput')

  zone.addEventListener('click', () => input.click())
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'))
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag')
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  })
  input.addEventListener('change', e => { if (e.target.files[0]) setFile(e.target.files[0]) })
}

function setFile(file) {
  if (!file.name.match(/\.(kmz|kml)$/i)) {
    showError('Formato inválido. Envie um arquivo .kmz ou .kml')
    return
  }
  const zone = document.getElementById('dropZone')
  zone.classList.add('has-file')
  zone.innerHTML = `
    <div class="check-icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
    <div class="drop-ok">${file.name}</div>
    <div class="drop-ok-sub">${(file.size/1024).toFixed(0)} KB — clique para trocar</div>
  `
  checkReady()
}

/* ── Textarea ──────────────────────────────────────────── */
function setupTextarea() {
  const ta = document.getElementById('actualInput')
  ta.addEventListener('input', () => {
    ta.classList.toggle('filled', ta.value.trim().length > 30)
    checkReady()
  })
}

function checkReady() {
  const hasFile = document.getElementById('dropZone').classList.contains('has-file')
  const hasText = document.getElementById('actualInput').value.trim().length > 30
  document.getElementById('btnAnalyze').disabled = !(hasFile && hasText)
}

/* ── Analyze ───────────────────────────────────────────── */
function setupAnalyzeBtn() {
  document.getElementById('btnAnalyze').addEventListener('click', analyze)
}

async function analyze() {
  const file = document.getElementById('fileInput').files[0]
  const text = document.getElementById('actualInput').value

  hideError()
  setLoading(true)

  const fd = new FormData()
  fd.append('kmz', file)
  fd.append('actual', text)

  try {
    const res  = await fetch('/api/analyze', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro na análise')
    currentData = data
    showResult(data)
  } catch (e) {
    showError(e.message)
  } finally {
    setLoading(false)
  }
}

function setLoading(on) {
  const btn = document.getElementById('btnAnalyze')
  btn.disabled = on
  btn.innerHTML = on
    ? `<div class="spinner"></div> Analisando...`
    : `Analisar conformidade <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`
}

/* ── Erros ─────────────────────────────────────────────── */
function showError(msg) {
  const el = document.getElementById('errorBar')
  el.querySelector('.error-text').textContent = msg
  el.classList.remove('hidden')
}
function hideError() {
  document.getElementById('errorBar').classList.add('hidden')
}

/* ── Resultado ─────────────────────────────────────────── */
function showResult(data) {
  document.getElementById('uploadView').classList.add('hidden')
  document.getElementById('resultView').classList.remove('hidden')
  document.getElementById('btnReset').classList.remove('hidden')

  renderBanner(data.summary)
  renderMetrics(data.summary)
  renderTable(data.results)
  setupTabs()
  setupFilters(data.summary)
  setupSort()
}

/* Banner */
function renderBanner(s) {
  const pct = s.conformidade_pct
  const level = pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad'
  const msgs = {
    ok:   `Boa conformidade: ${pct}% das paradas seguiram a sequência prevista.`,
    warn: `Conformidade parcial: apenas ${pct}% das paradas seguiram a sequência do TMS.`,
    bad:  `Rota não seguida: somente ${pct}% de conformidade na sequência de entregas.`,
  }
  const icons = {
    ok:   `<polyline points="20 6 9 17 4 12"/>`,
    warn: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    bad:  `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
  }
  document.getElementById('alertBanner').className = `alert-banner ${level} fade`
  document.getElementById('alertBanner').innerHTML = `
    <div class="alert-msg">
      <svg viewBox="0 0 24 24">${icons[level]}</svg>
      ${msgs[level]}
    </div>
    <div class="alert-pct">${pct}%</div>
  `
}

/* Métricas */
function renderMetrics(s) {
  const cards = [
    { icon: `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`, label: 'Previstas (TMS)', val: s.total_planned, color: 'var(--t1)' },
    { icon: `<polyline points="20 6 9 17 4 12"/>`, label: 'Em ordem', val: s.in_order, color: 'var(--ok)' },
    { icon: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`, label: 'Fora de ordem', val: s.out_order, color: 'var(--danger)' },
    { icon: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>`, label: 'Não entregues', val: s.not_delivered, color: 'var(--warn)' },
    { icon: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`, label: 'Não encontrados', val: s.not_found, color: 'var(--info)' },
    { icon: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`, label: 'Desvio médio', val: `${s.avg_desvio_pos} pos.`, color: 'var(--t2)' },
    { icon: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`, label: 'Janela', val: s.start_time ? `${s.start_time}–${s.end_time}` : '—', color: 'var(--t2)' },
    { icon: `<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`, label: 'Dist. total', val: `${s.total_dist_km} km`, color: 'var(--t2)' },
  ]
  document.getElementById('metricsGrid').innerHTML = cards.map((c, i) => `
    <div class="metric-card fade-${Math.min(i,3)}">
      <div class="metric-head" style="color:${c.color}">
        <svg viewBox="0 0 24 24">${c.icon}</svg>
        <span style="color:var(--t3)">${c.label}</span>
      </div>
      <div class="metric-val" style="color:${c.color}">${c.val}</div>
    </div>
  `).join('')
}

/* Tabela */
function renderTable(results) {
  const filtered = getFiltered(results)
  const sorted   = getSorted(filtered)

  const confLabels = {
    em_ordem:       ['badge-ok',     'Em ordem'],
    fora_de_ordem:  ['badge-danger', 'Fora de ordem'],
    nao_entregue:   ['badge-warn',   'Não entregue'],
    nao_encontrado: ['badge-info',   'Não encontrado'],
  }
  const rowClass = {
    fora_de_ordem:  'row-danger',
    nao_entregue:   'row-warn',
    nao_encontrado: 'row-info',
  }

  const tbody = sorted.map(r => {
    const [bc, bl] = confLabels[r.conformidade] || ['badge-info','—']
    const rc = rowClass[r.conformidade] || ''
    const diff = r.conformidade === 'fora_de_ordem'
      ? `<span class="${r.diff > 0 ? 'td-diff-pos' : 'td-diff-neg'}">${r.diff > 0 ? '+' : ''}${r.diff}</span>`
      : `<span style="color:var(--t3)">—</span>`
    return `
      <tr class="${rc}">
        <td class="td-num">${r.plan_seq}ª</td>
        <td class="td-num">${r.real_seq != null ? r.real_seq + 'ª' : '—'}</td>
        <td><div class="td-code">${r.code}</div>${r.addr ? `<div class="td-addr">${r.addr}</div>` : ''}</td>
        <td class="td-num">${r.time || '—'}</td>
        <td style="font-size:12px;color:var(--t3)">${r.cep || '—'}</td>
        <td>${diff}</td>
        <td><span class="badge ${bc}">${bl}</span></td>
      </tr>`
  }).join('')

  document.getElementById('tableBody').innerHTML = tbody
  document.getElementById('tableCount').textContent = `${sorted.length} de ${results.length} registros`
}

function getFiltered(results) {
  if (currentFilter === 'all') return results
  return results.filter(r => r.conformidade === currentFilter)
}

function getSorted(rows) {
  return [...rows].sort((a, b) => {
    let va = a[sortCol] ?? 9999
    let vb = b[sortCol] ?? 9999
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
  })
}

/* Filtros */
function setupFilters(s) {
  const filters = [
    { key: 'all',            label: `Todas (${currentData.results.length})` },
    { key: 'em_ordem',       label: `Em ordem (${s.in_order})` },
    { key: 'fora_de_ordem',  label: `Fora de ordem (${s.out_order})` },
    { key: 'nao_entregue',   label: `Não entregues (${s.not_delivered})` },
    { key: 'nao_encontrado', label: `Não encontrados (${s.not_found})` },
  ]
  const wrap = document.getElementById('filterPills')
  wrap.innerHTML = filters.map(f => `
    <button class="filter-pill${f.key === currentFilter ? ' active' : ''}"
      data-filter="${f.key}">${f.label}</button>
  `).join('')

  wrap.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter
      wrap.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b === btn))
      renderTable(currentData.results)
    })
  })
}

/* Sort */
function setupSort() {
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc'
      else { sortCol = col; sortDir = 'asc' }
      document.querySelectorAll('th[data-col]').forEach(t => {
        t.classList.toggle('sorted', t.dataset.col === sortCol)
        t.querySelector('.sort-icon').textContent =
          t.dataset.col === sortCol ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
      })
      renderTable(currentData.results)
    })
  })
}

/* Tabs */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const tab = btn.dataset.tab
      document.getElementById('tabTable').classList.toggle('hidden', tab !== 'table')
      document.getElementById('tabMap').classList.toggle('hidden', tab !== 'map')
      if (tab === 'map') renderMap(currentData.results)
    })
  })
}

/* Mapa */
function renderMap(results) {
  if (mapInstance) { mapInstance.remove(); mapInstance = null }

  const valid = results.filter(r => r.real_lat && r.real_lon)
  if (!valid.length) return

  mapInstance = L.map('map', {
    center: [valid[0].real_lat, valid[0].real_lon],
    zoom: 13,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(mapInstance)

  const bounds = []
  const confColors = {
    em_ordem:       '#22c98a',
    fora_de_ordem:  '#f05252',
    nao_entregue:   '#f5a623',
    nao_encontrado: '#4f8ef7',
  }

  // Rota prevista (tracejado azul)
  const plannedLine = results
    .filter(r => r.plan_lat && r.plan_lon)
    .sort((a,b) => a.plan_seq - b.plan_seq)
    .map(r => [r.plan_lat, r.plan_lon])
  if (plannedLine.length > 1)
    L.polyline(plannedLine, { color:'#4f8ef7', weight:2, opacity:.4, dashArray:'6 4' })
      .addTo(mapInstance).bindTooltip('Rota prevista (TMS)')

  // Rota percorrida (sólida verde)
  const actualLine = results
    .filter(r => r.real_lat && r.real_lon)
    .sort((a,b) => (a.real_seq||0) - (b.real_seq||0))
    .map(r => [r.real_lat, r.real_lon])
  if (actualLine.length > 1)
    L.polyline(actualLine, { color:'#22c98a', weight:2, opacity:.5 })
      .addTo(mapInstance).bindTooltip('Rota percorrida')

  // Linhas de desvio
  results.forEach(r => {
    if (r.conformidade === 'fora_de_ordem' && r.plan_lat && r.real_lat)
      L.polyline([[r.plan_lat,r.plan_lon],[r.real_lat,r.real_lon]],
        { color:'#f05252', weight:1, opacity:.2, dashArray:'3 3' }).addTo(mapInstance)
  })

  // Marcadores
  results.forEach(r => {
    const lat = r.real_lat || r.plan_lat
    const lon = r.real_lon || r.plan_lon
    if (!lat || !lon) return
    const color = confColors[r.conformidade]
    const seq   = r.real_seq || r.plan_seq
    const icon  = L.divIcon({
      html: `<div style="width:26px;height:26px;background:${color};border:2px solid rgba(0,0,0,.3);border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)"><span style="transform:rotate(45deg);font-size:9px;font-weight:700;color:#fff">${seq}</span></div>`,
      className:'', iconSize:[26,26], iconAnchor:[13,26], popupAnchor:[0,-28],
    })
    const confLabel = {
      em_ordem:'✓ Em ordem', fora_de_ordem:'✗ Fora de ordem',
      nao_entregue:'— Não entregue', nao_encontrado:'? Não encontrado',
    }
    const diffHtml = r.conformidade === 'fora_de_ordem'
      ? `<br><span style="color:${r.diff>0?'#f05252':'#f5a623'};font-weight:600">${r.diff>0?'+':''}${r.diff} posições</span>`
      : ''
    L.marker([lat,lon], {icon}).addTo(mapInstance).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:160px">
        <div style="font-weight:600;font-size:12px;margin-bottom:6px;color:#f0f2f7">${r.code}</div>
        <div style="font-size:11px;color:#8b92a5">TMS: ${r.plan_seq}ª &nbsp;|&nbsp; Real: ${r.real_seq ? r.real_seq+'ª' : '—'}</div>
        ${r.time ? `<div style="font-size:11px;color:#8b92a5">Horário: ${r.time}</div>` : ''}
        <div style="margin-top:6px;font-size:11px;color:${color};font-weight:500">${confLabel[r.conformidade]||''}${diffHtml}</div>
      </div>`)
    bounds.push([lat,lon])
  })

  if (bounds.length) mapInstance.fitBounds(bounds, { padding:[40,40] })
}

/* ── Reset ─────────────────────────────────────────────── */
document.getElementById('btnReset').addEventListener('click', () => {
  currentData   = null
  currentFilter = 'all'
  sortCol       = 'plan_seq'
  sortDir       = 'asc'
  if (mapInstance) { mapInstance.remove(); mapInstance = null }
  document.getElementById('resultView').classList.add('hidden')
  document.getElementById('uploadView').classList.remove('hidden')
  document.getElementById('btnReset').classList.add('hidden')
  document.getElementById('fileInput').value = ''
  document.getElementById('actualInput').value = ''
  document.getElementById('actualInput').classList.remove('filled')
  document.getElementById('btnAnalyze').disabled = true
  document.getElementById('btnAnalyze').innerHTML = `Analisar conformidade <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`
  const zone = document.getElementById('dropZone')
  zone.className = 'drop-zone'
  zone.innerHTML = `
    <div class="drop-zone-icon"><svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg></div>
    <div class="drop-title">Arraste ou clique</div>
    <div class="drop-sub">Arquivo .kmz ou .kml exportado do TMS</div>
  `
  hideError()
  // Volta para aba tabela
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===0))
  document.getElementById('tabTable').classList.remove('hidden')
  document.getElementById('tabMap').classList.add('hidden')
})
