// ─── Config ───────────────────────────────────────────────────────────────────
const API = 'https://raptor-backend-2vdj.onrender.com';

// ─── État global ──────────────────────────────────────────────────────────────
const state = {
  engineReady:       false,
  selectedFrom:      null,
  selectedTo:        null,
  currentTime:       null,
  currentDate:       null,
  nextOffset:        0,
  allJourneys:       [],
  lastDepTime:       0,
  currentCarte:      'Tarif Normal',
  profil:            'Tarif Normal',
  activeTypeFilters: null,
  availableTypes:    [],
  // ── Aller-retour ──────────────────────────────────────────────────────────
  isRoundTrip:       false,   // mode aller-retour activé
  phase:             'aller', // 'aller' | 'retour'
  selectedAller:     null,    // journey sélectionné pour l'aller
};

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function minutesToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function setStatus(type, text) {
  document.getElementById('status-dot').className = `status-dot ${type}`;
  document.getElementById('status-text').textContent = text;
}

function updateSearchBtn() {
  const ok = state.engineReady && state.selectedFrom && state.selectedTo;
  document.getElementById('btn-search').disabled = !ok;
}

// ─── Init moteur ──────────────────────────────────────────────────────────────
async function initEngine() {
  try {
    const res  = await fetch(`${API}/api/meta`);
    if (!res.ok) throw new Error(res.statusText);
    const meta = await res.json();
    state.engineReady = true;

    const today     = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById('input-date');
    if (!dateInput.value) dateInput.value = today;
    if (meta.date_range) {
      dateInput.min = meta.date_range.first;
      dateInput.max = meta.date_range.last;
    }

    const dateInfo = meta.date_range
    setStatus('ok', `Moteur prêt — ${meta.total_stops.toLocaleString('fr-FR')} `);
  } catch (e) {
    setStatus('err', `Moteur inaccessible : ${e.message}`);
  }
  updateSearchBtn();
}

// ─── Autocomplétion ───────────────────────────────────────────────────────────
// (setupAutocomplete et escapeHtml viennent de autocomplete.js)

// ─── Recherche principale ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-search').addEventListener('click', doSearch);

  document.getElementById('input-time').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('btn-search').disabled) doSearch();
  });
});

async function doSearch() {
  if (!state.selectedFrom || !state.selectedTo) return;

  const time  = document.getElementById('input-time').value  || '06:00';
  const date  = document.getElementById('input-date').value  || '';
  const carte = document.getElementById('input-carte').value || 'Tarif Normal';

  const isFilteredRelaunch = state._filterRelaunch;
  const isPhaseSearch      = state._phaseSearch;   // recherche déclenchée par sélection aller-retour
  state._filterRelaunch = false;
  state._phaseSearch    = false;

  state.currentTime  = time;
  state.currentDate  = date;
  state.currentCarte = carte;
  state.nextOffset   = 0;
  state.allJourneys  = [];
  state.lastDepTime  = 0;

  // Si nouvelle recherche MANUELLE en mode aller-retour → reset phase
  // Ne pas resetter si c'est une recherche retour déclenchée par selectJourneyForRoundTrip
  if (!isFilteredRelaunch && !isPhaseSearch && state.phase === 'retour') {
    state.phase = 'aller';
    state.selectedAller = null;
    hidePhaseBanner();
  }

  // Nouvelle recherche utilisateur → reset complet des filtres
  if (!isFilteredRelaunch && !isPhaseSearch) {
    state.activeTypeFilters = null;
    state.availableTypes    = [];
    // Vider la combobox (sera repeuplée après résultats)
    const dropdown = document.getElementById('ms-dropdown');
    if (dropdown) dropdown.querySelectorAll('.ms-item').forEach(el => el.remove());
    const labelEl = document.getElementById('ms-label');
    const countEl = document.getElementById('ms-count');
    if (labelEl) labelEl.textContent = 'Tous les trains';
    if (countEl) countEl.style.display = 'none';
    const allChk = document.getElementById('ms-all');
    if (allChk) { allChk.checked = true; allChk.indeterminate = false; }
  }

  const btn = document.getElementById('btn-search');
  btn.disabled    = true;
  btn.textContent = '…';
  setStatus('loading', 'Calcul en cours…');

  document.getElementById('results').innerHTML =
    '<div class="loading-container"><div class="spinner"></div><p>Chargement des horaires…</p></div>';

  try {
    const dateParam  = state.currentDate ? `&date=${state.currentDate}` : '';
    const fromIds    = (state.selectedFrom.stopIds || [state.selectedFrom.id]).join(',');
    const toIds      = (state.selectedTo.stopIds   || [state.selectedTo.id]).join(',');
    const carteParam = state.currentCarte !== 'Tarif Normal'
      ? `&carte=${encodeURIComponent(state.currentCarte)}` : '';
    // Lors d'un relancement avec filtre, on NE transmet PAS train_types au serveur :
    // le serveur explore librement tous les trains, et on filtre cote client ensuite.
    // Cela evite que RAPTOR s'arrete avant de trouver les trains du type voulu.
    const limitParam = isFilteredRelaunch ? '&limit=32' : '';
    const url = `${API}/api/search?from=${encodeURIComponent(fromIds)}&to=${encodeURIComponent(toIds)}&time=${time}&offset=0${dateParam}${carteParam}${limitParam}`;

    const res  = await fetch(url);
    const data = await res.json();

    const allReceived = data.journeys || [];

    // Filtre cote client selon les types selectionnes
    const filtered = (isFilteredRelaunch && state.activeTypeFilters)
      ? allReceived.filter(j => (j.train_types || []).some(tt => state.activeTypeFilters.has(tt)))
      : allReceived;

    state.allJourneys = filtered;
    const lastFiltered = filtered.length ? Math.max(...filtered.map(j => j.dep_time || 0)) : 0;
    state.nextOffset  = data.next_offset   !== undefined ? data.next_offset  : 7200;
    state.lastDepTime = lastFiltered || (data.last_dep_time !== undefined ? data.last_dep_time : 0);
    state.profil      = data.profil_tarifaire || 'Tarif Normal';

    // Apres une recherche sans filtre -> peupler la combobox avec les types presents
    if (!isFilteredRelaunch) {
      const types = new Set();
      allReceived.forEach(j => (j.train_types || []).forEach(t => types.add(t)));
      state.availableTypes = [...types];
      populateTypeCombobox(state.availableTypes);
    }

    const svcInfo = data.active_services ? ` | ${data.active_services} services actifs` : '';
    setStatus('ok', data.computed_ms !== undefined
      ? `Réponse en ${data.computed_ms} ms${svcInfo}`
      : 'Recherche effectuée');

    renderResults(state.allJourneys, state.selectedFrom.name, state.selectedTo.name, time, true);
    if (state.allJourneys.length > 0) loadTarifs(state.allJourneys, state.profil);

  } catch (e) {
    setStatus('err', `Erreur : ${e.message}`);
    document.getElementById('results').innerHTML =
      `<div class="state-error">⚠ ${escapeHtml(e.message)}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'RECHERCHER';
    updateSearchBtn();
  }
}

// ─── Tarifs en arrière-plan ────────────────────────────────────────────────────
async function loadTarifs(journeys, profil) {
  try {
    const res  = await fetch(API + '/api/tarifs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ journeys, profil, classe: '2' }),
    });
    const data = await res.json();
    if (!data.tarifs) return;

    journeys.forEach((j, i) => { j.tarif = data.tarifs[i]; });

    document.querySelectorAll('.journey-card').forEach((card, idx) => {
      const j = state.allJourneys[idx];
      if (!j || !j.tarif) return;
      const priceBlock = card.querySelector('.card-price-block');
      if (priceBlock) priceBlock.innerHTML = renderTarifBlock(j.tarif);
    });
  } catch (e) {
    console.warn('Erreur chargement tarifs:', e.message);
  }
}

// ─── Voir plus ────────────────────────────────────────────────────────────────
async function loadMore() {
  if (!state.selectedFrom || !state.selectedTo || !state.currentTime) return;

  const btn = document.getElementById('btn-more');
  if (btn) { btn.disabled = true; btn.textContent = 'Chargement…'; }
  setStatus('loading', 'Recherche de trajets supplémentaires…');

  try {
    const dateParam  = state.currentDate ? `&date=${state.currentDate}` : '';
    const fromIds    = (state.selectedFrom.stopIds || [state.selectedFrom.id]).join(',');
    const toIds      = (state.selectedTo.stopIds   || [state.selectedTo.id]).join(',');
    const afterDep   = state.lastDepTime || 0;
    const carteParam = state.currentCarte && state.currentCarte !== 'Tarif Normal'
      ? `&carte=${encodeURIComponent(state.currentCarte)}` : '';
    // loadMore : pas de train_types serveur, on filtre cote client
    const limitMore = state.activeTypeFilters ? '&limit=32' : '&limit=16';
    const url = `${API}/api/search?from=${encodeURIComponent(fromIds)}&to=${encodeURIComponent(toIds)}&time=${state.currentTime}&offset=${state.nextOffset}&after_dep=${afterDep}${limitMore}${dateParam}${carteParam}`;

    const res  = await fetch(url);
    const data = await res.json();
    const allMore = data.journeys || [];
    // Filtre cote client
    const newJourneys = (state.activeTypeFilters)
      ? allMore.filter(j => (j.train_types || []).some(tt => state.activeTypeFilters.has(tt)))
      : allMore;

    const existingKeys = new Set(state.allJourneys.map(j => j.legs.map(l => l.trip_id).join('|')));
    const fresh = newJourneys.filter(j => {
      const key = j.legs.map(l => l.trip_id).join('|');
      return !existingKeys.has(key) && (j.dep_time || 0) > state.lastDepTime;
    });

    if (fresh.length === 0) {
      state.nextOffset += 3600;
      if (btn) { btn.disabled = false; btn.textContent = 'Voir plus de trajets →'; }
      setStatus('ok', 'Aucun nouveau trajet sur cette plage, essayez encore.');
      return;
    }

    state.allJourneys = [...state.allJourneys, ...fresh];
    state.nextOffset  = data.next_offset   !== undefined ? data.next_offset  : state.nextOffset + 7200;
    state.lastDepTime = data.last_dep_time !== undefined ? data.last_dep_time
      : Math.max(...state.allJourneys.map(j => j.dep_time || 0));

    setStatus('ok', `${state.allJourneys.length} trajets chargés — réponse en ${data.computed_ms} ms`);
    renderResults(state.allJourneys, state.selectedFrom.name, state.selectedTo.name, state.currentTime, true);
    if (fresh.length > 0) loadTarifs(fresh, state.profil || 'Tarif Normal');

  } catch (e) {
    setStatus('err', `Erreur : ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Voir plus de trajets →'; }
  }
}

// ─── Rendu des résultats ──────────────────────────────────────────────────────
function renderResults(journeys, fromName, toName, time, showLoadMore = false) {
  const el = document.getElementById('results');

  if (!journeys || !journeys.length) {
    el.innerHTML = '<div class="state-empty"><span class="icon">🔍</span><p>Aucun trajet trouvé pour ces critères.</p></div>';
    return;
  }

  const isAllerPhase  = state.isRoundTrip && state.phase === 'aller';
  const isRetourPhase = state.isRoundTrip && state.phase === 'retour';

  const plural    = journeys.length > 1 ? journeys.length + ' trajets trouvés' : '1 trajet trouvé';
  const dateLabel = state.currentDate ? ' le ' + state.currentDate : '';
  const phaseLabel = isAllerPhase  ? ' — <strong>Choisissez votre trajet aller</strong>'
                   : isRetourPhase ? ' — <strong>Choisissez votre trajet retour</strong>'
                   : '';

  let out = '';

  // ── En phase retour : afficher la récap du trajet aller en haut ──────────
  if (isRetourPhase && state.selectedAller) {
    const a      = state.selectedAller;
    const leg0   = a.legs[0];
    const legEnd = a.legs[a.legs.length - 1];
    const types  = (a.train_types || []).join(' · ') || 'Train';
    const xfers  = a.transfers === 0 ? 'Direct' : a.transfers + ' corresp.';
    out += `
      <div class="aller-recap-wrapper">
        <div class="aller-recap-label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.5" stroke="#4ade80" stroke-width="1.2"/>
            <path d="M4.5 7l2 2 3-3" stroke="#4ade80" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Trajet aller sélectionné
        </div>
        <div class="aller-recap-card">
          <div>
            <div class="aller-recap-times">
              <div>
                <div class="aller-recap-time">${leg0.dep_str}</div>
                <div class="aller-recap-stations">${escapeHtml(leg0.from_name)}</div>
              </div>
              <div class="aller-recap-arrow">
                <div class="aller-recap-arrow-line"></div>
                <div class="aller-recap-dur">${minutesToHHMM(a.duration)}</div>
              </div>
              <div>
                <div class="aller-recap-time">${legEnd.arr_str}</div>
                <div class="aller-recap-stations">${escapeHtml(legEnd.to_name)}</div>
              </div>
            </div>
          </div>
          <div class="aller-recap-meta">
            <div class="aller-recap-badge">${escapeHtml(types)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.45);font-weight:500">${xfers}</div>
            <button class="aller-recap-change-btn" onclick="resetAllerSelection()">Modifier l'aller</button>
          </div>
        </div>
        <div class="retour-section-label">Choisissez votre trajet retour</div>
      </div>`;
  }

  out += '<div class="results-header">'
    + '<div class="results-header-left">'
    + '<div class="results-title">' + escapeHtml(fromName) + ' → ' + escapeHtml(toName) + '</div>'
    + '<div class="results-count">Départ après ' + time + dateLabel + ' — ' + plural + phaseLabel + '</div>'
    + '</div>'
    + '<div class="results-sort"><svg viewBox="0 0 14 14" fill="none" width="14" height="14"><path d="M2 4h10M4 7h6M6 10h2" stroke="#6b7a8d" stroke-width="1.4" stroke-linecap="round"/></svg> Trier par : <span>Heure de départ</span></div>'
    + '</div>';

  // ✅ Tri par heure de départ (dep_time) croissant
  const sortedJourneys = [...journeys].sort((a, b) => (a.dep_time || 0) - (b.dep_time || 0));
  sortedJourneys.forEach((j, i) => { out += renderJourneyCard(j, i, isAllerPhase || isRetourPhase); });

  if (showLoadMore) {
    out += '<div style="text-align:center;padding:28px 0 8px">'
      + '<button id="btn-more" onclick="loadMore()" class="btn-more">Voir plus de trajets →</button>'
      + '</div>';
  }

  el.innerHTML = out;

  el.querySelectorAll('.journey-card').forEach((card, idx) => {
    const btnSelect = card.querySelector('.btn-select-journey');
    if (btnSelect) {
      btnSelect.addEventListener('click', e => {
        e.stopPropagation();
        if (state.isRoundTrip) {
          selectJourneyForRoundTrip(sortedJourneys[idx]);
        } else {
          // Aller simple : sauvegarder le trajet et aller au récap
          selectJourneySimple(sortedJourneys[idx]);
        }
      });
    }
    // Expand au clic sur le résumé (sauf si clic sur le bouton)
    card.querySelector('.card-summary').addEventListener('click', e => {
      if (e.target.closest('.btn-select-journey')) return;
      card.classList.toggle('expanded');
    });
  });
}

function renderJourneyCard(j, i, showSelectBtn = false) {
  const isDirect = j.transfers === 0;
  const fromLeg  = j.legs[0];
  const toLeg    = j.legs[j.legs.length - 1];

  // ── Overnight indicator ──────────────────────────────────────────────────
  const overnight = toLeg.arr_time - fromLeg.dep_time >= 86400;
  const overnightSup = overnight
    ? `<sup class="card-overnight">+${Math.floor((toLeg.arr_time - fromLeg.dep_time) / 86400)}</sup>`
    : '';

  // ── Summary middle ───────────────────────────────────────────────────────
  const transferLabel = isDirect
    ? `<span class="card-direct">DIRECT</span>`
    : `<span class="card-corresp">${j.transfers} CORRESP.</span>`;

  // ── Train logo (first leg) — affiché dans la timeline étendue uniquement ──
  // (pas dans le résumé de la card)

  // ── Timeline (expanded) ──────────────────────────────────────────────────
  let tlHtml = '<div class="tl-wrap">';

  j.legs.forEach((leg, li) => {
    const isFirst = li === 0;

    // Transfer row between legs
    if (li > 0) {
      const wait = Math.round((leg.dep_time - j.legs[li - 1].arr_time) / 60);
      const waitLabel = wait > 0 ? minutesToHHMM(wait) : 'courte';
      tlHtml += `
        <div class="tl-transfer">
          <div class="tl-node-col">
            <div class="tl-circle tl-circle--xfer"><span class="material-symbols-outlined text-orange-400" style="font-size:14px"><i class="fa-solid fa-person-walking-dashed-line-arrow-right fa-xs"></i></span></div>
            <div class="tl-vline"></div>
          </div>
          <div class="tl-xfer-body">
            <span class="tl-xfer-station">${escapeHtml(leg.from_name)}</span>
            <div class="tl-xfer-sep"></div>
            <span class="tl-xfer-wait">Correspondance : ${waitLabel}</span>
          </div>
        </div>`;
    }

    // Logo du train pour ce leg
    const legLogoFile = TRAIN_TYPE_LOGO[leg.train_type];
    const legLogoHtml = legLogoFile
      ? `<img src="Assets/Icone_logo/${legLogoFile}" alt="${leg.train_type}"
           style="height:18px;max-width:60px;object-fit:contain;vertical-align:middle;"
           onerror="this.style.display='none'">`
      : `<span style="font-size:10px;font-weight:700;color:#94a3b8">${leg.train_type || ''}</span>`;

    tlHtml += `
      <div class="tl-stop">
        <div class="tl-node-col">
          <div class="tl-circle ${isFirst ? 'tl-circle--dep' : 'tl-circle--mid'}"></div>
          <div class="tl-vline"></div>
        </div>
        <div class="tl-body">
          <div class="tl-stop-header">
            <span class="tl-stop-name">${escapeHtml(leg.from_name)}</span>
          </div>
          <span class="tl-stop-time">Départ à ${leg.dep_str}</span>
          <div class="tl-dur-box">
            ${legLogoHtml}
            <span class="tl-dur-ico"><i class="fa-solid fa-clock"></i></span>
            <span class="tl-dur-text">Trajet : ${minutesToHHMM(leg.duration)}</span>
          </div>
        </div>
      </div>`;
  });

  // Final arrival stop
  tlHtml += `
    <div class="tl-stop tl-stop--final">
      <div class="tl-node-col">
        <div class="tl-circle tl-circle--arr"></div>
      </div>
      <div class="tl-body">
        <span class="tl-stop-name">${escapeHtml(toLeg.to_name)}</span>
        <span class="tl-stop-time">Arrivée à ${toLeg.arr_str}${overnightSup}</span>
      </div>
    </div>`;

  tlHtml += '</div>';

  const delay = `animation-delay:${i * 50}ms`;

  return `
    <div class="journey-card" style="${delay}">
      <div class="card-summary">
        <div class="card-dep-block">
          <span class="card-time">${fromLeg.dep_str}</span>
          <span class="card-station-lbl">${escapeHtml(fromLeg.from_name).toUpperCase()}</span>
        </div>
        <div class="card-mid-block">
          <span class="card-dur-lbl">${minutesToHHMM(j.duration)}</span>
          ${transferLabel}
        </div>
        <div class="card-arr-block">
          <span class="card-time">${toLeg.arr_str}${overnightSup}</span>
          <span class="card-station-lbl">${escapeHtml(toLeg.to_name).toUpperCase()}</span>
        </div>
        <div class="card-select-block">
          <button class="btn-select-journey">Sélectionner →</button>
        </div>
      </div>
      <div class="card-legs">${tlHtml}</div>
    </div>`;
}

// ─── Badges types de train ────────────────────────────────────────────────────
// Mapping GTFS route_short_name (Renfe) → train_type backend :
//   'AVE'        → 'AVE'          | 'AVE INT'   → 'AVE_INT'
//   'ALVIA'      → 'ALVIA'        | 'AVLO'      → 'AVLO'
//   'AVANT'      → 'AVANT'        | 'AVANT EXP' → 'AVANT'
//   'EUROMED'    → 'EUROMED'      | 'Intercity' → 'INTERCITY_ES'
//   'MD'         → 'MD'           | 'REGIONAL'  → 'REGIONAL_ES'
//   'REG.EXP.'   → 'REG_EXP'     | 'PROXIMDAD' → 'MD' (ou filtrer)
//   'TRENCELTA'  → 'REGIONAL_ES'
//   OUIGO España → 'OUIGO_ES'
const TRAIN_TYPE_STYLES = {
  // ── France ────────────────────────────────────────────────────────────────
  'INOUI':           { bg: '#c8962e', label: 'TGV Inoui' },
  'OUIGO':           { bg: '#e80082', label: 'Ouigo GV' },
  'OUIGO_CLASSIQUE': { bg: '#9b1c6e', label: 'Ouigo Classique' },
  'TER':             { bg: '#4a6741', label: 'TER' },
  'CAR':             { bg: '#7a7265', label: 'Car TER' },
  'IC':              { bg: '#2a5a8b', label: 'Intercités' },
  'IC_NUIT':         { bg: '#1a2a4a', label: 'IC Nuit' },
  'LYRIA':           { bg: '#d4001a', label: 'Lyria' },
  'TRAMTRAIN':       { bg: '#5a7a3a', label: 'TramTrain' },
  'NAVETTE':         { bg: '#7a6a5a', label: 'Navette' },
  // ── International ─────────────────────────────────────────────────────────
  'ICE':             { bg: '#d40000', label: 'ICE' },
  'EUROSTAR':        { bg: '#00435a', label: 'Eurostar' },
  'FRECCIAROSSA':    { bg: '#c60018', label: 'Frecciarossa' },
  // ── Espagne — Renfe ───────────────────────────────────────────────────────
  'AVE':             { bg: '#8b1a4a', label: 'AVE' },          // Haute vitesse Renfe
  'AVE_INT':         { bg: '#6b1238', label: 'AVE Int.' },     // AVE international
  'ALVIA':           { bg: '#c0392b', label: 'Alvia' },        // Semi-rapide (tilting)
  'AVLO':            { bg: '#e74c3c', label: 'AVLO' },         // Low-cost AVE (≈ Ouigo ES)
  'AVANT':           { bg: '#922b21', label: 'Avant' },        // Courte dist. grande vitesse
  'EUROMED':         { bg: '#1a5276', label: 'Euromed' },      // Barcelone–Valencia–Alicante
  'INTERCITY_ES':    { bg: '#2471a3', label: 'Intercity' },    // Grandes lignes Renfe
  'MD':              { bg: '#27ae60', label: 'Media Distancia' }, // Régional Renfe
  'REGIONAL_ES':     { bg: '#1e8449', label: 'Regional' },     // Omnibus régional Renfe
  'REG_EXP':         { bg: '#196f3d', label: 'Reg. Exprés' },  // Régional express Renfe
  // ── Espagne — OUIGO España ────────────────────────────────────────────────
  'OUIGO_ES':        { bg: '#e80082', label: 'Ouigo España' }, // Partage la couleur OUIGO FR
  // ── Fallback générique ────────────────────────────────────────────────────
  'RENFE':           { bg: '#5e1b43', label: 'Renfe' },        // type non identifié Renfe
  'TRAIN':           { bg: '#3a3a3a', label: 'Train' },
};

// Map train type -> logo filename in Assets/Icone_logo/
const TRAIN_TYPE_LOGO = {
  // ── International ─────────────────────────────────────────────────────────
  'EUROSTAR':        'eurostar.png',

  // ── France (SNCF) ─────────────────────────────────────────────────────────
  'INOUI':           'tgv_inoui.png',
  'OUIGO':           'ouigo.png',
  'OUIGO_CLASSIQUE': 'ouigo-classique.png',
  'TER':             'TER.png',
  'IC':              'intercites.png',
  'IC_NUIT':         'intercites.png',
  'LYRIA':           'lyria.png',
  'ICE':             'ice.png',
  'TRAIN':           'inoui.svg', // Fallback France

  // ── Belgique (SNCB) ───────────────────────────────────────────────────────
  'IC_SNCB':         'sncb.png',
  'NIGHTJET':        'nightjet.png',
  'EC':              'eurocity.png',
  'THALYS_CORRIDOR': 'eurostar.png',

  // ── Allemagne (DB) ────────────────────────────────────────────────────────
  'IC_DB':           'db.png',
  'TRAIN_DB':        'db.png',

  // ── Italie (Trenitalia) ───────────────────────────────────────────────────
  'FRECCIAROSSA':    'frecciarossa.png',

  // ── Royaume-Uni (Avanti / Caledonian) ─────────────────────────────────────
  'AVANTI':          'avanti.png',
  'CALEDONIAN_SLEEPER': 'caledonian.png',
  'UK_RAIL':         'national_rail.png',

  // ── Espagne (Renfe & Ouigo ES) ────────────────────────────────────────────
  'AVE':             'Renfe_ave.png',
  'AVE_INT':         'Renfe_ave.png',
  'ALVIA':           'Renfe_Alvia.png',
  'AVLO':            'Renfe_Alvo.png',
  'AVANT':           'Renfe_Avant.png',
  'EUROMED':         'Renfe_Euromed.png',
  'INTERCITY_ES':    'renfe_Intercity.png',
  'MD':              'renfe_MD.png',
  'REGIONAL_ES':     'Renfe_regionales.png',
  'REG_EXP':         'Renfe_regionales.png',
  'RENFE':           'renfe.png',
  'OUIGO_ES':        'ouigo.png',

  // ── Portugal (CP) ─────────────────────────────────────────────────────────
  'ALFA_PENDULAR':   'Comboios-de-Portugal.png',
  'IC_CP':           'Comboios-de-Portugal.png',
  'IR_CP':           'Comboios-de-Portugal.png',
  'CP':              'Comboios-de-Portugal.png'
};

function trainTypeBadge(trainType) {
  const s    = TRAIN_TYPE_STYLES[trainType] || TRAIN_TYPE_STYLES['TRAIN'];
  const logo = TRAIN_TYPE_LOGO[trainType];
  if (logo) {
    return '<span style="display:inline-flex;align-items:center;">'
      + '<img src="Assets/Icone_logo/' + logo + '" alt="' + s.label + '" title="' + s.label + '"'
      + ' style="height:22px;max-width:80px;object-fit:contain;vertical-align:middle;"'
      + ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'\';">'
      + '<span style="display:none;background:' + s.bg + ';color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;letter-spacing:.06em;font-weight:600">' + s.label + '</span>'
      + '</span>';
  }
  return '<span style="background:' + s.bg + ';color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;letter-spacing:.06em;font-weight:600">' + s.label + '</span>';
}

function trainTypeBadgeFallback(trainType) {
  const s = TRAIN_TYPE_STYLES[trainType] || TRAIN_TYPE_STYLES['TRAIN'];
  const span = document.createElement('span');
  span.style.cssText = `background:${s.bg};color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;letter-spacing:.06em;font-weight:600`;
  span.textContent = s.label;
  return span;
}

// Badge simplifié gris pour la timeline (sans logo, juste le label)
function trainTypeSimpleBadge(trainType) {
  const s = TRAIN_TYPE_STYLES[trainType] || TRAIN_TYPE_STYLES['TRAIN'];
  return `<span class="tl-trip-badge">${s.label}</span>`;
}

// ─── Tarifs ───────────────────────────────────────────────────────────────────
function formatPrice(v) {
  return v % 1 === 0 ? v + '€' : v.toFixed(2).replace('.', ',') + '€';
}

function renderTarifBlock(tarif) {
  if (!tarif) return '<div class="price-val price-loading">Chargement…</div>';

  const { totalMin, totalMax, hasTer, allFound } = tarif;

  if (totalMin === 0 && totalMax === 0 && !allFound) {
    return '<span class="price-unavail">—</span>';
  }

  const profil    = state.currentCarte || 'Tarif Normal';
  const labelMap  = {
    'Tarif Normal':                      'TARIF NORMAL',
    'Tarif Avantage':                    'CARTE AVANTAGE',
    'Tarif Elève - Etudiant - Apprenti': 'TARIF ÉTUDIANT',
    'Tarif Réglementé':                  'CARTE LIBERTÉ',
  };
  const priceLabel = labelMap[profil] || profil.toUpperCase();

  // TGVmax = 0€ → green
  const isFree = totalMin === 0 && totalMax === 0 && allFound;
  const colorClass = isFree ? 'price-val--green' : 'price-val--black';

  let valHtml = '';
  if (isFree) {
    valHtml = `<span class="price-val ${colorClass}">0€</span>`;
  } else if (totalMin > 0 || totalMax > 0) {
    const minStr = formatPrice(totalMin);
    valHtml = totalMin === totalMax
      ? `<span class="price-val ${colorClass}">${minStr}</span>`
      : `<span class="price-val ${colorClass}">${minStr}</span>`;
  } else {
    valHtml = `<span class="price-unavail">N/D</span>`;
  }

  const terNote = hasTer && totalMin > 0
    ? `<span class="price-ter">+ trajets partiels</span>` : '';

  return `${valHtml}<span class="price-lbl">${priceLabel}</span>${terNote}`;
}

// ─── Multi-select type de train ───────────────────────────────────────────────
// (TRAIN_TYPE_STYLES déjà déclaré plus haut dans "Badges types de train")

// Priorité d'affichage dans la liste
const TYPE_ORDER = [
  // France
  'INOUI','OUIGO','OUIGO_CLASSIQUE','IC','IC_NUIT','TER','CAR','TRAMTRAIN','NAVETTE','LYRIA',
  // International
  'ICE','EUROSTAR','FRECCIAROSSA',
  // Espagne
  'AVE','AVE_INT','AVLO','OUIGO_ES','ALVIA','AVANT','EUROMED','INTERCITY_ES','MD','REGIONAL_ES','REG_EXP','RENFE',
  // Fallback
  'TRAIN',
];

function populateTypeCombobox(availableTypes) {
  const dropdown = document.getElementById('ms-dropdown');
  const allChk   = document.getElementById('ms-all');
  if (!dropdown || !availableTypes.length) return;

  // Trier selon TYPE_ORDER
  const sorted = [...availableTypes].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Vider les items existants (garder le "tout sélectionner" + divider)
  dropdown.querySelectorAll('.ms-item').forEach(el => el.remove());

  sorted.forEach(key => {
    const s    = TRAIN_TYPE_STYLES[key] || { bg: '#3a3a3a', label: key };
    const item = document.createElement('label');
    item.className = 'ms-item';
    item.innerHTML = `
      <input type="checkbox" class="ms-chk" data-key="${key}" checked>
      <span class="ms-color-dot" style="background:${s.bg}"></span>
      <span class="ms-item-label">${s.label}</span>`;
    dropdown.appendChild(item);
  });

  updateMsLabel();
}

function updateMsLabel() {
  const labelEl  = document.getElementById('ms-label');
  const countEl  = document.getElementById('ms-count');
  const allChk   = document.getElementById('ms-all');
  const dropdown = document.getElementById('ms-dropdown');
  if (!labelEl) return;

  const all     = [...dropdown.querySelectorAll('.ms-chk')];
  const checked = all.filter(c => c.checked);

  // Si rien coché ou tout coché → pas de filtre
  if (checked.length === 0 || checked.length === all.length) {
    // Si rien coché → tout recocher automatiquement
    if (checked.length === 0) all.forEach(c => { c.checked = true; });
    labelEl.textContent      = 'Tous les trains';
    countEl.style.display    = 'none';
    state.activeTypeFilters  = null;
    if (allChk) { allChk.checked = true; allChk.indeterminate = false; }
  } else {
    const names = checked.map(c => {
      const s = TRAIN_TYPE_STYLES[c.dataset.key];
      return s ? s.label : c.dataset.key;
    });
    labelEl.textContent      = checked.length === 1 ? names[0] : `${checked.length} types`;
    countEl.textContent      = checked.length;
    countEl.style.display    = '';
    state.activeTypeFilters  = new Set(checked.map(c => c.dataset.key));
    if (allChk) { allChk.checked = false; allChk.indeterminate = true; }
  }
}

(function initMultiSelect() {
  const btn      = document.getElementById('ms-btn');
  const dropdown = document.getElementById('ms-dropdown');
  const allChk   = document.getElementById('ms-all');
  if (!btn || !dropdown) return;

  // Tout sélectionner / désélectionner
  allChk.addEventListener('change', () => {
    dropdown.querySelectorAll('.ms-chk').forEach(c => { c.checked = allChk.checked; });
    updateMsLabel();
    if (state.allJourneys.length) relaunchWithFilter();
  });

  // Délégation sur les checkboxes individuelles
  dropdown.addEventListener('change', e => {
    if (!e.target.classList.contains('ms-chk')) return;
    updateMsLabel();
    if (state.allJourneys.length) relaunchWithFilter();
  });

  // Ouvrir / fermer
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
  });
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      btn.classList.remove('open');
    }
  });
  dropdown.addEventListener('click', e => e.stopPropagation());
})();

// Relance doSearch avec le filtre actif (reset offset + résultats)
function relaunchWithFilter() {
  state._filterRelaunch = true;
  state.nextOffset  = 0;
  state.allJourneys = [];
  state.lastDepTime = 0;
  doSearch();
}

// ─── Dropdown type de trajet ──────────────────────────────────────────────────
(function () {
  const btn    = document.getElementById('tripTypeBtn');
  const menu   = document.getElementById('tripTypeMenu');
  const label  = document.getElementById('selectedTripType');
  const retour = document.getElementById('return-date-wrapper');

  btn.addEventListener('click', () => {
    menu.classList.toggle('hidden');
    btn.classList.toggle('active');
  });

  menu.querySelectorAll('.trip-type-option').forEach(opt => {
    opt.addEventListener('click', () => {
      menu.querySelectorAll('.trip-type-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const val = opt.dataset.value;
      state.isRoundTrip        = (val === 'roundtrip');
      label.textContent        = val === 'roundtrip' ? 'Aller-retour' : 'Aller simple';
      retour.style.display     = val === 'roundtrip' ? '' : 'none';
      // Reset phase si on change de mode
      state.phase          = 'aller';
      state.selectedAller  = null;
      hidePhaseBanner();
      menu.classList.add('hidden');
      btn.classList.remove('active');
    });
  });

  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
      btn.classList.remove('active');
    }
  });
})();

// ─── Aller-retour : sélection d'un trajet ────────────────────────────────────
function selectJourneyForRoundTrip(journey) {
  if (state.phase === 'aller') {
    // Sauvegarder le trajet aller et passer en phase retour
    state.selectedAller = journey;
    state.phase = 'retour';

    // ✅ Mémoriser la date ALLER avant de l'écraser
    state.allerDate = document.getElementById('input-date').value || '';

    // Inverser from/to
    const tmpFrom = state.selectedFrom;
    state.selectedFrom = state.selectedTo;
    state.selectedTo   = tmpFrom;

    // Mettre à jour les champs visuels
    document.getElementById('input-from').value = state.selectedFrom.name || '';
    document.getElementById('id-from').value    = (state.selectedFrom.stopIds || []).join(',');
    document.getElementById('input-to').value   = state.selectedTo.name || '';
    document.getElementById('id-to').value      = (state.selectedTo.stopIds || []).join(',');

    // Date retour : utiliser le champ dédié (obligatoire pour éviter doublon)
    const retInput   = document.getElementById('return-date');
    const returnDate = (retInput && retInput.value) ? retInput.value : '';

    if (!returnDate) {
      // L'utilisateur n'a pas saisi de date retour → on la lui demande
      const saisie = prompt(
        'Veuillez saisir la date de retour (format YYYY-MM-DD) :',
        state.allerDate || ''
      );
      if (!saisie) {
        // Annulation → on remet la phase aller
        state.phase         = 'aller';
        state.selectedAller = null;
        hidePhaseBanner();
        return;
      }
      if (retInput) retInput.value = saisie;
      document.getElementById('input-date').value = saisie;
      state.retourDate = saisie;
    } else {
      document.getElementById('input-date').value = returnDate;
      state.retourDate = returnDate;
    }

    // Heure : repartir de 06:00
    document.getElementById('input-time').value = '02:00';

    showPhaseBanner('retour', journey);
    state.allJourneys       = [];
    state.nextOffset        = 0;
    state.lastDepTime       = 0;
    state.activeTypeFilters = null;
    state._phaseSearch      = true;  // empêche doSearch de resetter la phase
    doSearch();

  } else if (state.phase === 'retour') {
    // Les deux trajets sont sélectionnés → récap
    const aller  = state.selectedAller;
    const retour = journey;

    // ✅ Utiliser les dates mémorisées pour éviter toute confusion
    sessionStorage.setItem('recap_aller',       JSON.stringify(aller));
    sessionStorage.setItem('recap_retour',      JSON.stringify(retour));
    sessionStorage.setItem('recap_from',        JSON.stringify(state.selectedTo));   // inversé
    sessionStorage.setItem('recap_to',          JSON.stringify(state.selectedFrom)); // inversé
    sessionStorage.setItem('recap_date_aller',  state.allerDate  || '');
    sessionStorage.setItem('recap_date_retour', state.retourDate || document.getElementById('input-date').value || '');
    sessionStorage.setItem('recap_is_simple',   'false');

    window.location.href = 'recap.html';
  }
}

function selectJourneySimple(journey) {
  const dateAller = document.getElementById('input-date').value || '';
  // On nettoie complètement le sessionStorage avant d'écrire
  sessionStorage.removeItem('recap_retour');
  sessionStorage.removeItem('recap_date_retour');
  sessionStorage.setItem('recap_aller',      JSON.stringify(journey));
  sessionStorage.setItem('recap_from',       JSON.stringify(state.selectedFrom));
  sessionStorage.setItem('recap_to',         JSON.stringify(state.selectedTo));
  sessionStorage.setItem('recap_date_aller', dateAller);
  sessionStorage.setItem('recap_is_simple',  'true');
  window.location.href = 'recap.html';
}

function showPhaseBanner(phase, allerJourney) {
  // La carte aller est maintenant injectée dans renderResults — rien à faire ici
}

function hidePhaseBanner() {
  const banner = document.getElementById('phase-banner');
  if (banner) banner.remove();
}

function resetAllerSelection() {
  // Remettre l'état aller
  state.phase         = 'aller';
  state.selectedAller = null;

  // Ré-inverser from/to
  const tmpFrom      = state.selectedFrom;
  state.selectedFrom = state.selectedTo;
  state.selectedTo   = tmpFrom;

  document.getElementById('input-from').value = state.selectedFrom.name || '';
  document.getElementById('id-from').value    = (state.selectedFrom.stopIds || []).join(',');
  document.getElementById('input-to').value   = state.selectedTo.name || '';
  document.getElementById('id-to').value      = (state.selectedTo.stopIds || []).join(',');

  // Remettre la date aller
  if (state.allerDate) document.getElementById('input-date').value = state.allerDate;

  state.allJourneys  = [];
  state.nextOffset   = 0;
  state.lastDepTime  = 0;
  state._phaseSearch = true;
  doSearch();
}

// ─── Pré-remplissage depuis les paramètres URL ────────────────────────────────
function initFromURL() {
  const p        = new URLSearchParams(window.location.search);
  const from     = p.get('from');
  const fromName = p.get('fromName');
  const to       = p.get('to');
  const toName   = p.get('toName');

  if (!from || !to) return;

  document.getElementById('input-from').value = fromName || from;
  document.getElementById('id-from').value    = from;
  state.selectedFrom = { name: fromName || from, id: from, stopIds: from.split(',') };

  document.getElementById('input-to').value = toName || to;
  document.getElementById('id-to').value    = to;
  state.selectedTo   = { name: toName || to, id: to, stopIds: to.split(',') };

  const time = p.get('time');
  if (time) document.getElementById('input-time').value = time;

  const date = p.get('date');
  if (date) document.getElementById('input-date').value = date;

  const carte = p.get('carte');
  if (carte) document.getElementById('input-carte').value = carte;

  // ✅ Restaurer le type de trajet aller-retour et la date retour depuis l'URL
  const tripType   = p.get('tripType');
  const returnDate = p.get('returnDate');
  if (tripType === 'roundtrip') {
    state.isRoundTrip = true;
    // Activer visuellement le sélecteur
    const menu          = document.getElementById('tripTypeMenu');
    const label         = document.getElementById('selectedTripType');
    const retourWrapper = document.getElementById('return-date-wrapper');
    if (menu) {
      menu.querySelectorAll('.trip-type-option').forEach(o => o.classList.remove('selected'));
      const rtOpt = menu.querySelector('[data-value="roundtrip"]');
      if (rtOpt) rtOpt.classList.add('selected');
    }
    if (label)         label.textContent      = 'Aller-retour';
    if (retourWrapper) retourWrapper.style.display = '';
    if (returnDate) {
      const retInput = document.getElementById('return-date');
      if (retInput) retInput.value = returnDate;
    }
  }

  updateSearchBtn();
}

// ─── Init autocomplétion ──────────────────────────────────────────────────────
setupAutocomplete('input-from', 'ac-from', 'id-from', 'selectedFrom', state, updateSearchBtn);
setupAutocomplete('input-to',   'ac-to',   'id-to',   'selectedTo',   state, updateSearchBtn);

// ─── Lancement ────────────────────────────────────────────────────────────────
initFromURL();

initEngine().then(() => {
  if (state.selectedFrom && state.selectedTo) {
    history.replaceState(null, '', window.location.pathname);
    doSearch();
  }
});