/* ════════════════════════════════════════════════════════════════════════════
   explorer.js — Leaflet (tuiles grises CartoDB) + Canvas overlay ultra-rapide
   ════════════════════════════════════════════════════════════════════════════ */

const map = L.map('map', {
  center: [48, 8], zoom: 5, minZoom: 3, maxZoom: 14, zoomControl: false,
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

function durationColor(minutes) {
  const stops = [[0,[40,180,40]],[120,[180,210,30]],[300,[240,200,20]],[480,[230,90,20]],[720,[180,20,20]],[900,[80,0,0]]];
  if (minutes <= stops[0][0]) return stops[0][1];
  if (minutes >= stops[stops.length-1][0]) return stops[stops.length-1][1];
  let lo = stops[0], hi = stops[stops.length-1];
  for (let i=0;i<stops.length-1;i++) { if (minutes>=stops[i][0]&&minutes<=stops[i+1][0]) { lo=stops[i]; hi=stops[i+1]; break; } }
  const t = (minutes-lo[0])/(hi[0]-lo[0]);
  return lo[1].map((v,j) => Math.round(v+(hi[1][j]-v)*t));
}
function rgbStr([r,g,b],a=1) { return `rgba(${r},${g},${b},${a})`; }
function dotRadius(zoom) { if(zoom<=4)return 3.5;if(zoom<=5)return 4.5;if(zoom<=6)return 5.5;if(zoom<=7)return 6;return 7; }

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
  if (!ctx||!cvs) return;
  ctx.clearRect(0,0,cvs.width,cvs.height);
  if (!lastResults.length) return;
  const zoom=map.getZoom(), r=dotRadius(zoom);
  for (const dest of lastResults) {
    const pt=map.latLngToContainerPoint([dest.lat,dest.lon]);
    dest._px=pt;
    const rgb=durationColor(dest.journeys[0]?.duration||0), isHover=dest===hoveredDest;
    if (isHover) { ctx.beginPath(); ctx.arc(pt.x,pt.y,r*2.8,0,Math.PI*2); ctx.fillStyle=rgbStr(rgb,0.2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(pt.x,pt.y,isHover?r*1.7:r,0,Math.PI*2);
    ctx.fillStyle=rgbStr(rgb,isHover?1:0.88); ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1.2;
    ctx.fill(); ctx.stroke();
  }
}

function hitTest(mx,my) {
  if (!lastResults.length) return null;
  const r2=Math.pow(dotRadius(map.getZoom())*3.5,2);
  let best=null, bestD=Infinity;
  for (const dest of lastResults) { const px=dest._px; if(!px) continue; const d=(px.x-mx)**2+(px.y-my)**2; if(d<r2&&d<bestD){best=dest;bestD=d;} }
  return best;
}

function bindCanvasEvents() {
  const container = map.getContainer();
  container.addEventListener('mousemove', e => {
    if (!lastResults.length) return;
    const rect=container.getBoundingClientRect(), hit=hitTest(e.clientX-rect.left,e.clientY-rect.top);
    if (hit!==hoveredDest) { hoveredDest=hit; container.style.cursor=hit?'pointer':''; redrawCanvas(); syncHoverList(); }
  });
  container.addEventListener('mouseleave', () => { if(hoveredDest){hoveredDest=null;redrawCanvas();syncHoverList();} });
  container.addEventListener('click', e => {
    if (!lastResults.length) return;
    const rect=container.getBoundingClientRect(), hit=hitTest(e.clientX-rect.left,e.clientY-rect.top);
    if (hit) { openDestPopup(hit); const idx=lastResults.indexOf(hit); if(idx>=0) highlightCardByListIdx(idx); if(cvs){cvs.style.visibility='hidden'; map.once('popupclose',()=>{cvs.style.visibility='visible';});} }
    else { if(leafletPopup) map.closePopup(leafletPopup); }
  });
}

function openDestPopup(dest) {
  const j    = dest.journeys[0];
  const legs = j.legs || [];
  const leg0 = legs[0] || {};
  const legN = legs[legs.length - 1] || {};
  const dur  = formatDuration(j.duration);
  const fromName = explorerState?.from?.name || leg0.from_name || '';

  // Heures : priorité j.dep_str / j.arr_str (champs directs), fallback sur legs
  const depStr = j.dep_str || leg0.dep_str || leg0.departure_time?.slice(0,5) || '--:--';
  const arrStr = j.arr_str || legN.arr_str || legN.arrival_time?.slice(0,5) || '--:--';

  // Badge type de train (INOUI, OUIGO, TGV, Eurostar…)
  const trainTypes = j.train_types || [];
  const trainT = trainTypes[0] || leg0.train_type || '';
  const trainBadge = trainT ? `<span class="popup-type">${escapeHtml(trainT)}</span>` : '';

  const p = new URLSearchParams({
    from:     document.getElementById('id-from').value,
    fromName,
    to:       dest.to_id,
    toName:   dest.name,
    date:     document.getElementById('date-input').value,
    time:     '06:00',
    carte:    'Tarif Normal',
  });
  const url = 'trajets.html?' + p.toString();

  const html = `<div class="popup-card">
    <div class="popup-card-city">${escapeHtml(dest.name)}</div>
    ${trainBadge}
    <div class="popup-train-row">
      <div>
        <div class="popup-dep">${depStr}</div>
        <div class="popup-dur">${escapeHtml(fromName)}</div>
      </div>
      <div style="text-align:center;flex:1">
        <div class="popup-arrow">→</div>
        <div class="popup-dur">${dur}</div>
      </div>
      <div style="text-align:right">
        <div class="popup-arr">${arrStr}</div>
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
  document.querySelectorAll('.result-card').forEach((card,i) => card.classList.toggle('hovered',lastResults[i]===hoveredDest));
}

function scoreDestination(dest) {
  const j=dest.journeys[0], types=j?.train_types||[], xfers=j?.transfers??2;
  let s=0;
  if(types.includes('FRECCIAROSSA'))s+=90;
  else if(types.includes('LYRIA')||types.includes('ICE'))s+=85;
  else if(types.includes('INOUI'))s+=80;
  else if(types.includes('OUIGO')||types.includes('OUIGO_CLASSIQUE'))s+=65;
  else if(types.includes('IC')||types.includes('IC_NUIT'))s+=50;
  else if(types.some(t=>t?.startsWith('TER')||t==='CAR'))s+=15;
  else s+=25;
  if(xfers===0)s+=30; else s-=xfers*10;
  if((j?.duration||0)>180&&xfers===0)s+=20;
  return Math.max(0,s);
}

async function fetchDestinations(fromIds, dateStr) {
  setProgress(30);
  document.getElementById('status-dot').className='status-dot loading';
  document.getElementById('status-text').textContent='Exploration en cours…';
  const r=await fetch(`${API_BASE}/api/explore?from=${encodeURIComponent(fromIds)}&date=${encodeURIComponent(dateStr)}`);
  if (!r.ok) throw new Error('HTTP '+r.status);
  const data=await r.json();
  setProgress(70);
  const journeys=data.journeys||[];
  if (!journeys.length){showNoResults();return;}
  buildDestinations(journeys);
}

function buildDestinations(journeys) {
  const destMap={};
  for (const j of journeys) {
    const last=j.legs?.[j.legs.length-1]; if(!last) continue;
    const key=last.to_id;
    if(!destMap[key]) destMap[key]={name:last.to_name||key,to_id:key,journeys:[],lat:null,lon:null};
    destMap[key].journeys.push(j);
    if(!destMap[key].lat&&j.dest_lat){destMap[key].lat=j.dest_lat;destMap[key].lon=j.dest_lon;}
  }
  allDestinations=Object.values(destMap).filter(d=>d.lat&&d.lon).map(d=>({...d,score:scoreDestination(d)})).sort((a,b)=>b.score-a.score);

  const s=explorerState?.from;
  if (s?.lat) {
    if(originMarker) map.removeLayer(originMarker);
    const el=document.createElement('div'); el.className='origin-pin';
    originMarker=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'',html:el.outerHTML,iconSize:[18,18],iconAnchor:[9,9]}),zIndexOffset:9999}).addTo(map);
    originMarker.bindTooltip(s.name,{permanent:false,direction:'top'});
    map.flyTo([s.lat,s.lon],5.5,{animate:true,duration:1.2});
  }

  if (!canvasReady){initCanvas();bindCanvasEvents();}
  document.getElementById('map-hint').classList.add('hidden');
  document.getElementById('filters-bar').classList.add('visible');
  document.getElementById('results-count-label').textContent='Destinations trouvées :';
  document.getElementById('status-dot').className='status-dot ok';
  document.getElementById('status-text').textContent=`${allDestinations.length} destinations`;
  refreshView();
}

function refreshView() {
  lastResults=allDestinations.filter(d=>{
    if(currentFilter==='all') return true;
    if(currentFilter==='direct') return d.journeys[0]?.transfers===0;
    const types=d.journeys[0]?.train_types||[];
    return types.some(t=>t?.toUpperCase().includes(currentFilter.toUpperCase()));
  });
  document.getElementById('results-count').textContent=lastResults.length;
  redrawCanvas(); renderList(lastResults);
}

function renderList(destinations) {
  const listEl=document.getElementById('results-list');
  listEl.innerHTML='';
  if (!destinations.length){listEl.innerHTML='<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">Aucune destination pour ce filtre</div>';return;}
  const TYPE_LABEL={'INOUI':'TGV Inoui','OUIGO':'Ouigo','OUIGO_CLASSIQUE':'Ouigo Classique','TER':'TER','IC':'Intercités','IC_NUIT':'IC Nuit','LYRIA':'🇨🇭 Lyria','ICE':'🇩🇪 ICE','EUROSTAR':'🇬🇧 Eurostar','FRECCIAROSSA':'🇮🇹 Frecciarossa','AVE':'🇪🇸 AVE','AVLO':'🇪🇸 AVLO'};
  const frag=document.createDocumentFragment();
  destinations.forEach(dest=>{
    const j=dest.journeys[0], dur=formatDuration(j.duration), xfers=j.transfers||0;
    const trainT=(j.train_types||[])[0]||'', rgb=durationColor(j.duration||0), color=rgbStr(rgb);
    const typeLabel=TYPE_LABEL[trainT]||trainT||'';
    const card=document.createElement('div'); card.className='result-card';
    card.innerHTML=`
      <div class="result-dot-badge" style="background:${color}"></div>
      <div class="result-info">
        <div class="result-city">${escapeHtml(dest.name)}</div>
        <div class="result-meta"><span>${j.dep_str||'--:--'} → ${j.arr_str||'--:--'}</span>${xfers>0?`<span class="dot"></span><span>${xfers} corresp.</span>`:''}</div>
      </div>
      <div class="result-right">
        <div class="result-time">${dur}</div>
        ${xfers===0?'<div class="result-transfers">Direct</div>':''}
        ${typeLabel?`<div class="result-train-type">${typeLabel}</div>`:''}
      </div>`;
    card.addEventListener('mouseenter',()=>{hoveredDest=dest;redrawCanvas();});
    card.addEventListener('mouseleave',()=>{hoveredDest=null;redrawCanvas();});
    card.addEventListener('click',()=>flyTo(dest));
    frag.appendChild(card);
  });
  listEl.appendChild(frag);
}

function flyTo(dest) {
  if (!dest?.lat) return;
  map.flyTo([dest.lat,dest.lon],Math.max(map.getZoom(),8),{animate:true,duration:1});
  openDestPopup(dest);
  const idx=lastResults.indexOf(dest); if(idx>=0) highlightCardByListIdx(idx);
}

function highlightCardByListIdx(idx) {
  document.querySelectorAll('.result-card').forEach((c,i)=>c.classList.toggle('highlighted',i===idx));
  document.querySelectorAll('.result-card')[idx]?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function clearMap() {
  if(ctx&&cvs) ctx.clearRect(0,0,cvs.width,cvs.height);
  if(originMarker){map.removeLayer(originMarker);originMarker=null;}
  if(leafletPopup) map.closePopup(leafletPopup);
  allDestinations=[];lastResults=[];hoveredDest=null;openPopupDest=null;
  document.getElementById('results-list').innerHTML='';
  document.getElementById('results-count').textContent='';
  document.getElementById('results-count-label').textContent='Lancez une recherche';
  document.getElementById('filters-bar').classList.remove('visible');
  document.getElementById('map-hint').classList.remove('hidden');
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  document.querySelector('[data-filter="all"]')?.classList.add('active');
  currentFilter='all';
}

function showNoResults(msg) {
  document.getElementById('map-hint').classList.remove('hidden');
  document.getElementById('map-hint').innerHTML=`<div class="hint-icon">🔍</div><div class="hint-title">Aucun résultat</div><div class="hint-sub">${msg||'Aucun trajet trouvé depuis cette gare pour cette date.'}</div>`;
  document.getElementById('status-dot').className='status-dot err';
  document.getElementById('status-text').textContent='Aucun résultat';
}
function formatDuration(m) { if(!m)return'--'; const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h${mn>0?String(mn).padStart(2,'0'):''}`:mn+'min'; }
function setProgress(pct) { document.getElementById('progress-bar').style.width=pct+'%'; }