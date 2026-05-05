/* ── Estado global ─────────────────────────────────────── */
let currentData   = null
let currentFilter = 'all'
let sortCol       = 'plan_seq'
let sortDir       = 'asc'
let mapInstance   = null

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone()
  setupTextarea()
  setupAnalyzeBtn()
  setupReset()
  setupTabsOnce()
  setupSortOnce()
  setupPdfExport()
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

  currentData   = null
  currentFilter = 'all'
  sortCol       = 'plan_seq'
  sortDir       = 'asc'
  if (mapInstance) { mapInstance.remove(); mapInstance = null }
  document.getElementById('tableBody').innerHTML = ''

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
    document.getElementById('resultView').classList.add('hidden')
    document.getElementById('uploadView').classList.remove('hidden')
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
  document.getElementById('btnExportPdf').classList.remove('hidden')

  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0))
  document.getElementById('tabTable').classList.remove('hidden')
  document.getElementById('tabMap').classList.add('hidden')

  document.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.remove('sorted')
    th.querySelector('.sort-icon').textContent = ''
  })
  const thPlan = document.querySelector('th[data-col="plan_seq"]')
  if (thPlan) { thPlan.classList.add('sorted'); thPlan.querySelector('.sort-icon').textContent = ' ↑' }

  renderBanner(data.summary)
  renderMetrics(data.summary)
  renderFilters(data.summary)
  renderTable(data.results)
}

/* ── Banner ─────────────────────────────────────────────── */
function renderBanner(s) {
  const pct   = s.conformidade_pct
  const level = pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad'
  const msgs  = {
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

/* ── Métricas ───────────────────────────────────────────── */
function renderMetrics(s) {
  const cards = [
    { icon: `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`, label: 'Previstas (TMS)', val: s.total_planned,    color: 'var(--t1)' },
    { icon: `<polyline points="20 6 9 17 4 12"/>`,                                                                                               label: 'Em ordem',       val: s.in_order,        color: 'var(--ok)' },
    { icon: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,                      label: 'Fora de ordem',  val: s.out_order,       color: 'var(--danger)' },
    { icon: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,                label: 'Não encontrados',val: s.not_found,       color: 'var(--info)' },
    { icon: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,                                                                              label: 'Desvio médio',   val: `${s.avg_desvio_pos} pos.`, color: 'var(--t2)' },
    { icon: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,                                                             label: 'Janela',         val: s.start_time ? `${s.start_time}–${s.end_time}` : '—', color: 'var(--t2)' },
  ]
  document.getElementById('metricsGrid').innerHTML = cards.map((c, i) => `
    <div class="metric-card fade-${Math.min(i, 3)}">
      <div class="metric-head" style="color:${c.color}">
        <svg viewBox="0 0 24 24">${c.icon}</svg>
        <span style="color:var(--t3)">${c.label}</span>
      </div>
      <div class="metric-val" style="color:${c.color}">${c.val}</div>
    </div>
  `).join('')
}

/* ── Tabela ─────────────────────────────────────────────── */
function renderTable(results) {
  if (!results) return
  const filtered = currentFilter === 'all' ? results : results.filter(r => r.conformidade === currentFilter)
  const sorted   = [...filtered].sort((a, b) => {
    let va = a[sortCol] ?? 9999
    let vb = b[sortCol] ?? 9999
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
  })

  const confLabels = {
    em_ordem:       ['badge-ok',     'Em ordem'],
    fora_de_ordem:  ['badge-danger', 'Fora de ordem'],
    nao_encontrado: ['badge-info',   'Não encontrado'],
  }
  const rowTints = {
    fora_de_ordem:  'row-danger',
    nao_encontrado: 'row-info',
  }

  document.getElementById('tableBody').innerHTML = sorted.map(r => {
    const [bc, bl] = confLabels[r.conformidade] || ['badge-info', '—']
    const rc       = rowTints[r.conformidade] || ''
    const diff     = r.conformidade === 'fora_de_ordem'
      ? `<span class="${r.diff > 0 ? 'td-diff-pos' : 'td-diff-neg'}">${r.diff > 0 ? '+' : ''}${r.diff}</span>`
      : `<span style="color:var(--t3)">—</span>`
    const grupo = r.grupo_size > 1
      ? `<span style="font-size:10px;color:var(--accent2);background:var(--in-bg);border:1px solid var(--in-bd);padding:1px 6px;border-radius:99px;margin-left:4px">${r.grupo_size} obj.</span>`
      : ''
    const janela = r.expected_range && r.expected_range.includes('–')
      ? `<div style="font-size:10px;color:var(--t3)">Janela: ${r.expected_range}</div>`
      : ''
    return `
      <tr class="${rc}">
        <td class="td-num">${r.plan_seq}ª${grupo}</td>
        <td class="td-num">${r.real_seq != null ? r.real_seq + 'ª' : '—'}${janela}</td>
        <td><div class="td-code">${r.code}</div>${r.addr ? `<div class="td-addr">${r.addr}</div>` : ''}</td>
        <td class="td-num">${r.time || '—'}</td>
        <td style="font-size:12px;color:var(--t3)">${r.cep || '—'}</td>
        <td>${diff}</td>
        <td><span class="badge ${bc}">${bl}</span></td>
      </tr>`
  }).join('')

  document.getElementById('tableCount').textContent = `${sorted.length} de ${results.length} registros`
}

/* ── Filtros ────────────────────────────────────────────── */
function renderFilters(s) {
  const filters = [
    { key: 'all',            label: `Todas (${currentData.results.length})` },
    { key: 'em_ordem',       label: `Em ordem (${s.in_order})` },
    { key: 'fora_de_ordem',  label: `Fora de ordem (${s.out_order})` },
    { key: 'nao_encontrado', label: `Não encontrados (${s.not_found})` },
  ]

  const wrap    = document.getElementById('filterPills')
  const newWrap = wrap.cloneNode(false)
  wrap.parentNode.replaceChild(newWrap, wrap)

  newWrap.innerHTML = filters.map(f => `
    <button class="filter-pill${f.key === currentFilter ? ' active' : ''}"
      data-filter="${f.key}">${f.label}</button>
  `).join('')

  newWrap.addEventListener('click', e => {
    const btn = e.target.closest('.filter-pill')
    if (!btn) return
    currentFilter = btn.dataset.filter
    newWrap.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b === btn))
    renderTable(currentData.results)
  })
}

/* ── Sort ───────────────────────────────────────────────── */
function setupSortOnce() {
  document.getElementById('detailTable').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]')
    if (!th || !currentData) return
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
}

/* ── Tabs ───────────────────────────────────────────────── */
function setupTabsOnce() {
  document.querySelector('.tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn')
    if (!btn) return
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const tab = btn.dataset.tab
    document.getElementById('tabTable').classList.toggle('hidden', tab !== 'table')
    document.getElementById('tabMap').classList.toggle('hidden', tab !== 'map')
    if (tab === 'map' && currentData) renderMap(currentData.results)
  })
}

/* ── Mapa ───────────────────────────────────────────────── */
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

  const bounds     = []
  const confColors = {
    em_ordem:       '#22c98a',
    fora_de_ordem:  '#f05252',
    nao_encontrado: '#4f8ef7',
  }

  const plannedLine = results
    .filter(r => r.plan_lat && r.plan_lon)
    .sort((a, b) => a.plan_seq - b.plan_seq)
    .map(r => [r.plan_lat, r.plan_lon])
  if (plannedLine.length > 1)
    L.polyline(plannedLine, { color: '#4f8ef7', weight: 2, opacity: .4, dashArray: '6 4' })
      .addTo(mapInstance).bindTooltip('Rota prevista (TMS)')

  const actualLine = results
    .filter(r => r.real_lat && r.real_lon)
    .sort((a, b) => (a.real_seq || 0) - (b.real_seq || 0))
    .map(r => [r.real_lat, r.real_lon])
  if (actualLine.length > 1)
    L.polyline(actualLine, { color: '#22c98a', weight: 2, opacity: .5 })
      .addTo(mapInstance).bindTooltip('Rota percorrida')

  results.forEach(r => {
    if (r.conformidade === 'fora_de_ordem' && r.plan_lat && r.real_lat)
      L.polyline([[r.plan_lat, r.plan_lon], [r.real_lat, r.real_lon]],
        { color: '#f05252', weight: 1, opacity: .2, dashArray: '3 3' }).addTo(mapInstance)
  })

  results.forEach(r => {
    const lat = r.real_lat || r.plan_lat
    const lon = r.real_lon || r.plan_lon
    if (!lat || !lon) return
    const color = confColors[r.conformidade] || '#4f8ef7'
    const seq   = r.real_seq || r.plan_seq
    const icon  = L.divIcon({
      html: `<div style="width:26px;height:26px;background:${color};border:2px solid rgba(0,0,0,.3);border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)"><span style="transform:rotate(45deg);font-size:9px;font-weight:700;color:#fff">${seq}</span></div>`,
      className: '', iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
    })
    const confLabel = {
      em_ordem: '✓ Em ordem', fora_de_ordem: '✗ Fora de ordem', nao_encontrado: '? Não encontrado',
    }
    const diffHtml = r.conformidade === 'fora_de_ordem'
      ? `<br><span style="color:${r.diff > 0 ? '#f05252' : '#f5a623'};font-weight:600">${r.diff > 0 ? '+' : ''}${r.diff} posições</span>`
      : ''
    L.marker([lat, lon], { icon }).addTo(mapInstance).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:160px">
        <div style="font-weight:600;font-size:12px;margin-bottom:6px;color:#f0f2f7">${r.code}</div>
        <div style="font-size:11px;color:#8b92a5">TMS: ${r.plan_seq}ª &nbsp;|&nbsp; Real: ${r.real_seq ? r.real_seq + 'ª' : '—'}</div>
        ${r.time ? `<div style="font-size:11px;color:#8b92a5">Horário: ${r.time}</div>` : ''}
        <div style="margin-top:6px;font-size:11px;color:${color};font-weight:500">${confLabel[r.conformidade] || ''}${diffHtml}</div>
      </div>`)
    bounds.push([lat, lon])
  })

  if (bounds.length) mapInstance.fitBounds(bounds, { padding: [40, 40] })
}

/* ── Reset ──────────────────────────────────────────────── */
function setupReset() {
  document.getElementById('btnReset').addEventListener('click', () => {
    currentData   = null
    currentFilter = 'all'
    sortCol       = 'plan_seq'
    sortDir       = 'asc'
    if (mapInstance) { mapInstance.remove(); mapInstance = null }

    document.getElementById('resultView').classList.add('hidden')
    document.getElementById('uploadView').classList.remove('hidden')
    document.getElementById('btnReset').classList.add('hidden')
    document.getElementById('btnExportPdf').classList.add('hidden')
    document.getElementById('fileInput').value = ''
    document.getElementById('actualInput').value = ''
    document.getElementById('actualInput').classList.remove('filled')
    document.getElementById('tableBody').innerHTML = ''
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
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0))
    document.getElementById('tabTable').classList.remove('hidden')
    document.getElementById('tabMap').classList.add('hidden')
  })
}

/* ── PDF Export ─────────────────────────────────────────── */
function setupPdfExport() {
  document.getElementById('btnExportPdf').addEventListener('click', () => {
    if (!currentData) return
    generatePdf(currentData.summary, currentData.results)
  })
}

function generatePdf(s, results) {
  const btn = document.getElementById('btnExportPdf')
  btn.disabled = true
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Gerando...`

  try {
    const { jsPDF } = window.jspdf
    const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pW   = 210
    const pH   = 297
    const mg   = 14
    let   y    = mg

    // ── Cabeçalho ──────────────────────────────────────────
    pdf.setFillColor(10, 12, 16)
    pdf.rect(0, 0, pW, 32, 'F')

    // Ícone logo
    pdf.setFillColor(79, 142, 247)
    pdf.roundedRect(mg, 8, 16, 16, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(255, 255, 255)
    pdf.text('RC', mg + 8, 18, { align: 'center' })

    // Título
    pdf.setFontSize(17)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(240, 242, 247)
    pdf.text('RouteCheck', mg + 20, 15)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(139, 146, 165)
    pdf.text('Relatório de Conformidade de Rotas', mg + 20, 22)

    // Data
    pdf.setFontSize(8)
    pdf.setTextColor(74, 81, 104)
    pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pW - mg, 22, { align: 'right' })

    y = 42

    // ── Banner de conformidade ──────────────────────────────
    const pct   = s.conformidade_pct
    const level = pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad'
    const levelColors = {
      ok:   { bg: [34, 201, 138], text: [20, 80, 50],   label: 'Boa conformidade' },
      warn: { bg: [245, 166, 35], text: [100, 60, 10],  label: 'Conformidade parcial' },
      bad:  { bg: [240, 82,  82], text: [100, 20, 20],  label: 'Rota não seguida' },
    }
    const lc = levelColors[level]
    pdf.setFillColor(...lc.bg)
    pdf.roundedRect(mg, y, pW - mg * 2, 18, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(...lc.text)
    pdf.text(`${lc.label}: ${pct}% das paradas seguiram a sequência prevista`, mg + 6, y + 11)
    pdf.setFontSize(14)
    pdf.text(`${pct}%`, pW - mg - 6, y + 12, { align: 'right' })
    y += 26

    // ── Grid de métricas ────────────────────────────────────
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(240, 242, 247)
    pdf.text('Resumo da análise', mg, y)
    y += 6

    const metrics = [
      { label: 'Previstas (TMS)',  val: String(s.total_planned),              color: [240, 242, 247] },
      { label: 'Em ordem',         val: String(s.in_order),                   color: [34,  201, 138] },
      { label: 'Fora de ordem',    val: String(s.out_order),                  color: [240, 82,  82]  },
      { label: 'Não encontrados',  val: String(s.not_found),                  color: [79,  142, 247] },
      { label: 'Desvio médio',     val: `${s.avg_desvio_pos} posições`,       color: [139, 146, 165] },
      { label: 'Distância total',  val: `${s.total_dist_km} km`,              color: [139, 146, 165] },
      { label: 'Início da rota',   val: s.start_time || '—',                  color: [139, 146, 165] },
      { label: 'Fim da rota',      val: s.end_time || '—',                    color: [139, 146, 165] },
    ]

    const cols  = 4
    const cardW = (pW - mg * 2 - (cols - 1) * 4) / cols
    const cardH = 18

    metrics.forEach((m, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx  = mg + col * (cardW + 4)
      const cy  = y + row * (cardH + 4)

      pdf.setFillColor(22, 27, 38)
      pdf.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F')
      pdf.setDrawColor(46, 53, 70)
      pdf.setLineWidth(0.3)
      pdf.roundedRect(cx, cy, cardW, cardH, 2, 2, 'S')

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(74, 81, 104)
      pdf.text(m.label.toUpperCase(), cx + 5, cy + 6)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.setTextColor(...m.color)
      pdf.text(m.val, cx + 5, cy + 14)
    })

    y += Math.ceil(metrics.length / cols) * (cardH + 4) + 8

    // ── Tabela detalhada ────────────────────────────────────
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(240, 242, 247)
    pdf.text('Detalhamento por objeto', mg, y)
    y += 6

    // Cabeçalho da tabela
    const cols7  = ['Seq. TMS', 'Seq. real', 'Objeto', 'Horário', 'CEP', 'Desvio', 'Conformidade']
    const widths = [20, 20, 44, 18, 22, 18, 44]
    const rowH   = 7.5

    pdf.setFillColor(30, 37, 53)
    pdf.rect(mg, y, pW - mg * 2, rowH, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(74, 81, 104)
    let cx = mg + 3
    cols7.forEach((col, i) => {
      pdf.text(col.toUpperCase(), cx, y + 5)
      cx += widths[i]
    })
    y += rowH

    // Linhas de dados
    const confMeta = {
      em_ordem:       { label: 'Em ordem',       r: 34,  g: 201, b: 138 },
      fora_de_ordem:  { label: 'Fora de ordem',  r: 240, g: 82,  b: 82  },
      nao_encontrado: { label: 'Nao encontrado',  r: 79,  g: 142, b: 247 },
    }

    results.forEach((row, idx) => {
      // Nova página se necessário
      if (y + rowH > pH - mg - 10) {
        // Rodapé da página atual
        _pdfFooter(pdf, pW, pH)
        pdf.addPage()
        y = mg
        // Repetir cabeçalho da tabela na nova página
        pdf.setFillColor(30, 37, 53)
        pdf.rect(mg, y, pW - mg * 2, rowH, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(74, 81, 104)
        let hx = mg + 3
        cols7.forEach((col, i) => { pdf.text(col.toUpperCase(), hx, y + 5); hx += widths[i] })
        y += rowH
      }

      // Fundo alternado
      const isEven = idx % 2 === 0
      pdf.setFillColor(isEven ? 16 : 22, isEven ? 20 : 27, isEven ? 28 : 38)
      pdf.rect(mg, y, pW - mg * 2, rowH, 'F')

      const meta = confMeta[row.conformidade] || confMeta['nao_encontrado']
      const diff = row.conformidade === 'fora_de_ordem'
        ? (row.diff > 0 ? `+${row.diff}` : String(row.diff))
        : '—'

      const cells = [
        { text: `${row.plan_seq}`,                color: [139, 146, 165], bold: false },
        { text: row.real_seq != null ? `${row.real_seq}` : '—', color: [139, 146, 165], bold: false },
        { text: row.code,                          color: [240, 242, 247], bold: true  },
        { text: row.time || '—',                   color: [139, 146, 165], bold: false },
        { text: row.cep || '—',                    color: [74,  81, 104],  bold: false },
        { text: diff,
          color: row.conformidade === 'fora_de_ordem'
            ? (row.diff > 0 ? [240, 82, 82] : [245, 166, 35])
            : [74, 81, 104],
          bold: row.conformidade === 'fora_de_ordem' },
        { text: meta.label, color: [meta.r, meta.g, meta.b], bold: true },
      ]

      let px = mg + 3
      cells.forEach((cell, i) => {
        pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal')
        pdf.setFontSize(7.5)
        pdf.setTextColor(...cell.color)
        // Truncar texto longo para caber na coluna
        const maxW = widths[i] - 4
        let txt = cell.text
        while (txt.length > 3 && pdf.getTextWidth(txt) > maxW) txt = txt.slice(0, -1)
        if (txt !== cell.text) txt = txt.slice(0, -1) + '…'
        pdf.text(txt, px, y + 5)
        px += widths[i]
      })

      // Linha divisória fina
      pdf.setDrawColor(30, 37, 53)
      pdf.setLineWidth(0.2)
      pdf.line(mg, y + rowH, pW - mg, y + rowH)
      y += rowH
    })

    // ── Rodapé em todas as páginas ──────────────────────────
    const totalPages = pdf.internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p)
      _pdfFooter(pdf, pW, pH, p, totalPages)
    }

    // ── Salvar ──────────────────────────────────────────────
    const date = new Date().toISOString().slice(0, 10)
    pdf.save(`RouteCheck_${date}.pdf`)

  } finally {
    btn.disabled = false
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar PDF`
  }
}

function _pdfFooter(pdf, pW, pH, current, total) {
  pdf.setFillColor(10, 12, 16)
  pdf.rect(0, pH - 10, pW, 10, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(74, 81, 104)
  pdf.text('RouteCheck · DFS · Uso interno', 14, pH - 4)
  if (current && total) {
    pdf.text(`Página ${current} de ${total}`, pW - 14, pH - 4, { align: 'right' })
  }
}
