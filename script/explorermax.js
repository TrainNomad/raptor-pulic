/* ════════════════════════════════════════════════════════════════════════════
   explorermax.js — Explorer MAX (abonnement TGVmax)
   Carte Leaflet + Canvas overlay — destinations disponibles avec abonnement Max
   ════════════════════════════════════════════════════════════════════════════ */

const map = L.map('map', {
  center: [46.8, 2.5], zoom: 6, minZoom: 4, maxZoom: 14, zoomControl: false,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd', maxZoom: 19,
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

let allDestinations = [], lastResults = [], currentFilter = 'all';
let hoveredDest = null, openPopupDest = null;
let ctx = null, cvs = null, canvasReady = false;
let originMarker = null, leafletPopup = null;

// ─── Couleur selon durée ──────────────────────────────────────────────────────
// Palette centrée sur les durées TGV France : < 3h = vert, 3-5h = orange, > 5h = rouge
function durationColor(minutes) {
  const stops = [
    [0,   [40, 190,  80]],   // vert vif  — < 1h
    [60,  [80, 200,  60]],   // vert      — 1h
    [120, [180,210,  30]],   // jaune-vert — 2h
    [180, [240,180,  20]],   // jaune     — 3h
    [240, [240,120,  20]],   // orange    — 4h
    [300, [220, 50,  30]],   // rouge-orange — 5h
    [420, [150, 10,  10]],   // rouge foncé — 7h+
  ];
  if (minutes <= stops[0][0])               return stops[0][1];
  if (minutes >= stops[stops.length-1][0])  return stops[stops.length-1][1];
  let lo = stops[0], hi = stops[stops.length-1];
  for (let i = 0; i < stops.length-1; i++) {
    if (minutes >= stops[i][0] && minutes <= stops[i+1][0]) { lo = stops[i]; hi = stops[i+1]; break; }
  }
  const t = (minutes - lo[0]) / (hi[0] - lo[0]);
  return lo[1].map((v, j) => Math.round(v + (hi[1][j] - v) * t));
}

function rgbStr([r, g, b], a = 1) { return `rgba(${r},${g},${b},${a})`; }
function dotRadius(zoom) {
  if (zoom <= 4) return 4;
  if (zoom <= 5) return 5;
  if (zoom <= 6) return 6;
  if (zoom <= 7) return 7;
  return 8;
}

// ─── Canvas init + dessin ─────────────────────────────────────────────────────

function initCanvas() {
  cvs = document.createElement('canvas');
  cvs.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:400;';
  map.getContainer().appendChild(cvs);
  ctx = cvs.getContext('2d');
  function resize() { const s = map.getSize(); cvs.width = s.x; cvs.height = s.y; }
  resize();
  map.on('move zoom moveend zoomend resize', () => { resize(); if (lastResults.length) redrawCanvas(); });
  canvasReady = true;
}

function redrawCanvas() {
  if (!ctx || !cvs) return;
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  if (!lastResults.length) return;
  const zoom = map.getZoom(), r = dotRadius(zoom);

  for (const dest of lastResults) {
    const pt  = map.latLngToContainerPoint([dest.lat, dest.lon]);
    dest._px  = pt;
    const rgb = durationColor(dest.journeys[0]?.duration || 0);
    const isHover = dest === hoveredDest;

    // Halo sur hover
    if (isHover) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = rgbStr(rgb, 0.18);
      ctx.fill();
    }

    // Point principal
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isHover ? r * 1.7 : r, 0, Math.PI * 2);
    ctx.fillStyle   = rgbStr(rgb, isHover ? 1 : 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // Mini badge "MAX" sur les gros zooms
    if (zoom >= 8 && isHover) {
      ctx.font      = 'bold 9px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = rgbStr(rgb, 1);
      ctx.textAlign = 'center';
      ctx.fillText('MAX', pt.x, pt.y - r * 2.2);
    }
  }
}

function hitTest(mx, my) {
  if (!lastResults.length) return null;
  const r2 = Math.pow(dotRadius(map.getZoom()) * 3.5, 2);
  let best = null, bestD = Infinity;
  for (const dest of lastResults) {
    const px = dest._px; if (!px) continue;
    const d = (px.x - mx) ** 2 + (px.y - my) ** 2;
    if (d < r2 && d < bestD) { best = dest; bestD = d; }
  }
  return best;
}

function bindCanvasEvents() {
  const container = map.getContainer();
  container.addEventListener('mousemove', e => {
    if (!lastResults.length) return;
    const rect = container.getBoundingClientRect();
    const hit  = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit !== hoveredDest) {
      hoveredDest = hit;
      container.style.cursor = hit ? 'pointer' : '';
      redrawCanvas();
      syncHoverList();
    }
  });
  container.addEventListener('mouseleave', () => {
    if (hoveredDest) { hoveredDest = null; redrawCanvas(); syncHoverList(); }
  });
  container.addEventListener('click', e => {
    if (!lastResults.length) return;
    const rect = container.getBoundingClientRect();
    const hit  = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) {
      openDestPopup(hit);
      const idx = lastResults.indexOf(hit);
      if (idx >= 0) highlightCardByListIdx(idx);
    } else {
      if (leafletPopup) map.closePopup(leafletPopup);
    }
  });
}

// ─── Popup destination ────────────────────────────────────────────────────────

function openDestPopup(dest) {
  const j    = dest.journeys[0];
  const legs = j.legs || [];
  const leg0 = legs[0] || {};
  const legN = legs[legs.length - 1] || {};
  const dur  = formatDuration(j.duration);
  const fromName = explorerState?.from?.name || leg0.from_name || '';

  const p = new URLSearchParams({
    from:     document.getElementById('id-from').value,
    fromName,
    to:       dest.to_id,
    toName:   dest.name,
    date:     document.getElementById('date-input').value,
    time:     '06:00',
  });
  const url = 'trajetsmax.html?' + p.toString();

  const html = `<div class="popup-card">
    <div class="popup-card-city">${escapeHtml(dest.name)}</div>
    <span class="popup-type">🚄 MAX inclus</span>
    <div class="popup-train-row">
      <div>
        <div class="popup-dep">${leg0.dep_str || '--:--'}</div>
        <div class="popup-dur">${escapeHtml(fromName)}</div>
      </div>
      <div style="text-align:center;flex:1">
        <div class="popup-arrow">→</div>
        <div class="popup-dur">${dur}</div>
      </div>
      <div style="text-align:right">
        <div class="popup-arr">${legN.arr_str || '--:--'}</div>
        <div class="popup-dur">${escapeHtml(dest.name)}</div>
      </div>
    </div>
    <a href="${url}" class="popup-book-btn">Voir les trains →</a>
  </div>`;

  if (!leafletPopup) leafletPopup = L.popup({ maxWidth: 280, offset: [0, -4], closeButton: true });
  leafletPopup.setLatLng([dest.lat, dest.lon]).setContent(html).openOn(map);
  openPopupDest = dest;
}

function syncHoverList() {
  document.querySelectorAll('.result-card').forEach((card, i) =>
    card.classList.toggle('hovered', lastResults[i] === hoveredDest));
}

// ─── Score de tri ─────────────────────────────────────────────────────────────
// Pour TGVmax tout est direct, on trie par durée (plus court = mieux)
function scoreDestination(dest) {
  const j   = dest.journeys[0];
  const dur = j?.duration || 999;
  // Score inversement proportionnel à la durée, max 100
  return Math.max(0, 100 - Math.round(dur / 4));
}

// ─── Fetch destinations ───────────────────────────────────────────────────────

async function fetchDestinations(fromIds, dateStr) {
  setProgress(30);
  document.getElementById('status-dot').className  = 'status-dot loading';
  document.getElementById('status-text').textContent = 'Exploration en cours…';

  console.log('[MAX] fetchDestinations — fromIds:', fromIds, 'date:', dateStr);
  console.log('[MAX] explorerState.from:', explorerState?.from);

  const url = `${API_BASE}/api/explore?from=${encodeURIComponent(fromIds)}&date=${encodeURIComponent(dateStr)}`;
  console.log('[MAX] fetch URL:', url);

  const r = await fetch(url);
  console.log('[MAX] HTTP status:', r.status);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  console.log('[MAX] data.journeys.length:', data.journeys?.length, '— premier journey:', data.journeys?.[0]);
  setProgress(70);

  const journeys = data.journeys || [];
  if (!journeys.length) { showNoResults(); return; }
  buildDestinations(journeys);
}

function buildDestinations(journeys) {
  const destMap = {};

  for (const j of journeys) {
    const last = j.legs?.[j.legs.length - 1];
    if (!last) continue;
    const key = last.to_id;
    if (!destMap[key]) destMap[key] = { name: last.to_name || key, to_id: key, journeys: [], lat: null, lon: null };
    destMap[key].journeys.push(j);
    if (!destMap[key].lat) {
      const lat = j.dest_lat || last.lat || 0;
      const lon = j.dest_lon || last.lon || 0;
      if (lat && lon) { destMap[key].lat = lat; destMap[key].lon = lon; }
    }
  }

  const avantFiltre = Object.values(destMap);
  const apresFiltre = avantFiltre.filter(d => d.lat && d.lon);
  console.log('[MAX] destinations avant filtre lat/lon:', avantFiltre.length);
  console.log('[MAX] destinations après filtre lat/lon:', apresFiltre.length);
  if (avantFiltre.length && !apresFiltre.length) {
    console.warn('[MAX] ⚠️ TOUTES les destinations ont lat=0 ! Exemple:', avantFiltre[0]);
  }

  allDestinations = apresFiltre
    .map(d => ({ ...d, score: scoreDestination(d) }))
    .sort((a, b) => (a.journeys[0]?.duration || 999) - (b.journeys[0]?.duration || 999));

  // Centrer la carte sur l'origine
  const s = explorerState?.from;
  console.log('[MAX] explorerState.from pour flyTo:', s);
  if (s?.lat) {
    if (originMarker) map.removeLayer(originMarker);
    const el = document.createElement('div');
    el.className = 'origin-pin';
    originMarker = L.marker([s.lat, s.lon], {
      icon: L.divIcon({ className: '', html: el.outerHTML, iconSize: [18, 18], iconAnchor: [9, 9] }),
      zIndexOffset: 9999,
    }).addTo(map);
    originMarker.bindTooltip(s.name, { permanent: false, direction: 'top' });
    map.flyTo([s.lat, s.lon], 6, { animate: true, duration: 1.2 });
  } else {
    console.warn('[MAX] ⚠️ Pas de lat/lon sur explorerState.from — pas de flyTo');
    // Fallback : centrer sur la France
    if (allDestinations.length) map.flyTo([46.8, 2.5], 6, { animate: true, duration: 1 });
  }

  if (!canvasReady) { initCanvas(); bindCanvasEvents(); }

  document.getElementById('map-hint').classList.add('hidden');
  document.getElementById('filters-bar').classList.add('visible');
  document.getElementById('results-count-label').textContent = 'Destinations MAX :';
  document.getElementById('status-dot').className   = 'status-dot ok';
  document.getElementById('status-text').textContent = `${allDestinations.length} destinations`;

  refreshView();
}

// ─── Filtres + affichage liste ────────────────────────────────────────────────

function refreshView() {
  lastResults = allDestinations.filter(d => {
    const xfers = d.journeys[0]?.transfers ?? 0;
    if (currentFilter === 'all')     return true;
    if (currentFilter === 'direct')  return xfers === 0;
    if (currentFilter === 'one')     return xfers === 1;
    if (currentFilter === 'multi')   return xfers >= 2;
    return true;
  });
  document.getElementById('results-count').textContent = lastResults.length;
  redrawCanvas();
  renderList(lastResults);
}

function renderList(destinations) {
  const listEl = document.getElementById('results-list');
  listEl.innerHTML = '';
  if (!destinations.length) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">Aucune destination pour ce filtre</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  destinations.forEach(dest => {
    const j    = dest.journeys[0];
    const dur  = formatDuration(j.duration);
    const rgb  = durationColor(j.duration || 0);
    const color = rgbStr(rgb);

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-dot-badge" style="background:${color}"></div>
      <div class="result-info">
        <div class="result-city">${escapeHtml(dest.name)}</div>
        <div class="result-meta">
          <span>${j.dep_str || '--:--'} → ${j.arr_str || '--:--'}</span>
          <span class="dot"></span>
          <span>Direct</span>
        </div>
      </div>
      <div class="result-right">
        <div class="result-time">${dur}</div>
        <div class="result-max-badge">MAX ✓</div>
      </div>`;

    card.addEventListener('mouseenter', () => { hoveredDest = dest; redrawCanvas(); });
    card.addEventListener('mouseleave', () => { hoveredDest = null; redrawCanvas(); });
    card.addEventListener('click', () => flyTo(dest));
    frag.appendChild(card);
  });
  listEl.appendChild(frag);
}

// ─── Navigation carte ─────────────────────────────────────────────────────────

function flyTo(dest) {
  if (!dest?.lat) return;
  map.flyTo([dest.lat, dest.lon], Math.max(map.getZoom(), 8), { animate: true, duration: 1 });
  openDestPopup(dest);
  const idx = lastResults.indexOf(dest);
  if (idx >= 0) highlightCardByListIdx(idx);
}

function highlightCardByListIdx(idx) {
  document.querySelectorAll('.result-card').forEach((c, i) => c.classList.toggle('highlighted', i === idx));
  document.querySelectorAll('.result-card')[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearMap() {
  if (ctx && cvs) ctx.clearRect(0, 0, cvs.width, cvs.height);
  if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
  if (leafletPopup) map.closePopup(leafletPopup);
  allDestinations = []; lastResults = []; hoveredDest = null; openPopupDest = null;
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('results-count').textContent = '';
  document.getElementById('results-count-label').textContent = 'Lancez une recherche';
  document.getElementById('filters-bar').classList.remove('visible');
  document.getElementById('map-hint').classList.remove('hidden');
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-filter="all"]')?.classList.add('active');
  currentFilter = 'all';
}

function showNoResults(msg) {
  document.getElementById('map-hint').classList.remove('hidden');
  document.getElementById('map-hint').innerHTML = `
    <div class="hint-icon">🔍</div>
    <div class="hint-title">Aucun résultat</div>
    <div class="hint-sub">${msg || 'Aucun billet MAX disponible depuis cette gare pour cette date.'}</div>`;
  document.getElementById('status-dot').className   = 'status-dot err';
  document.getElementById('status-text').textContent = 'Aucun résultat';
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function formatDuration(m) {
  if (!m) return '--';
  const h = Math.floor(m / 60), mn = m % 60;
  return h > 0 ? `${h}h${mn > 0 ? String(mn).padStart(2, '0') : ''}` : mn + 'min';
}

function setProgress(pct) {
  document.getElementById('progress-bar').style.width = pct + '%';
}