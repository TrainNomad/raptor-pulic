/* ============================================================
   TrainNomad.eu — guide/script/guide.js
   Logique de la page guide/guide.html (page détail d'une ville)
   Dépend de : guide/data/guides.js (GUIDES_DATA chargé avant)
   ============================================================ */

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Paramètre ?ville= dans l'URL ─────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const villeId = params.get('ville') || params.get('city') || 'milan';

// ── Chargement du JSON ────────────────────────────────────────────────────────
let D;
try {
    const res = await fetch(`data/${villeId}.json`);
    if (!res.ok) throw new Error('404');
    D = await res.json();
} catch(e) {
    $('loading-state').style.display = 'none';
    $('error-state').style.display   = 'block';
    throw e;
}

// ── Meta SEO ──────────────────────────────────────────────────────────────────
document.title = `Guide ${D.city} — ${D.excerpt} · TrainNomad.eu`;
$('page-desc').content = `Guide complet pour ${D.excerpt} en train depuis Paris. ${D.tagline}`;

// ── Hero ──────────────────────────────────────────────────────────────────────
const heroImg = $('hero-img');
heroImg.src    = `../assets/guides/${D.hero || D.cover}`;
heroImg.alt    = D.city;
heroImg.onerror = () => { heroImg.style.display = 'none'; };

$('breadcrumb-country').textContent = D.country;
$('breadcrumb-city').textContent    = D.city;
$('hero-title').textContent         = D.excerpt;
$('hero-tagline').textContent       = D.tagline;

$('hero-badges').innerHTML = (D.badges || []).map((b, i) =>
    `<span class="hero-badge ${i === 0 ? 'hero-badge-green' : 'hero-badge-white'}">${b}</span>`
).join('');

// ── Barre infos clés ──────────────────────────────────────────────────────────
const t = D.travel;
const keyInfoItems = [
    { label: '⏱ Durée',            value: t.duration },
    { label: '🚄 Opérateur',        value: t.operator },
    ...(t.correspondance ? [{ label: '🔄 Correspondance', value: t.correspondance }] : []),
    { label: '💶 Dès',              value: t.price_from, green: true },
    { label: '🌤 Meilleure saison', value: t.best_season },
    { label: '🌿 CO₂ économisé',    value: t.co2_saved + ' vs avion', green: true },
];
$('key-info-bar').innerHTML = keyInfoItems.map((item, i) => `
    ${i > 0 ? '<div class="key-info-sep hidden md:block"></div>' : ''}
    <div class="key-info-item">
        <span class="key-info-label">${item.label}</span>
        <span class="key-info-value" ${item.green ? 'style="color:var(--primary)"' : ''}>${item.value}</span>
    </div>
`).join('');

// ── Introduction ──────────────────────────────────────────────────────────────
$('intro-block').innerHTML = `<p>${D.intro}</p>`;

// ── L'essentiel ───────────────────────────────────────────────────────────────
const ESSENTIAL_COLS = [
    { key: 'voir',      label: 'À voir',    icon: 'visibility' },
    { key: 'manger',    label: 'Où manger', icon: 'restaurant' },
    { key: 'transport', label: 'Transport', icon: 'directions_transit' },
];
$('essentials-grid').innerHTML = ESSENTIAL_COLS.map(col => `
    <div class="essential-col">
        <div class="essential-col-title">
            <span class="material-symbols-outlined" style="font-size:13px">${col.icon}</span>
            ${col.label}
        </div>
        ${(D.essentials[col.key] || []).map(item => `
            <div class="essential-item">
                <div class="essential-icon">
                    <span class="material-symbols-outlined">${item.icon}</span>
                </div>
                <div>
                    <div class="essential-item-name">${item.name}</div>
                    <div class="essential-item-note">${item.note}</div>
                </div>
            </div>
        `).join('')}
    </div>
`).join('');

// ── Jours / Itinéraire ────────────────────────────────────────────────────────
$('days-container').innerHTML = (D.days || []).map(day => `
    <div class="day-block">
        <div class="day-header">
            <div class="day-number" style="background:${day.color};color:${day.color === '#4ade80' ? '#1A2B3C' : 'white'}">J${day.day}</div>
            <div class="day-title">${day.title}</div>
        </div>
        <div class="timeline">
            ${(day.points || []).map(p => `
                <div class="timeline-item">
                    <div class="timeline-dot" style="background:${day.color}"></div>
                    <div class="timeline-time">${p.time}</div>
                    <div>
                        <div class="timeline-content-title">${p.title}</div>
                        <div class="timeline-content-desc">${p.desc}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
`).join('');

// ── Tips ──────────────────────────────────────────────────────────────────────
$('tips-grid').innerHTML = (D.tips || []).map(tip => `
    <div class="tip-card">
        <div class="tip-icon"><span class="material-symbols-outlined">${tip.icon}</span></div>
        <div class="tip-text">${tip.text}</div>
    </div>
`).join('');

// ── Sidebar CTA ───────────────────────────────────────────────────────────────
$('sidebar-cta').href             = `../trajets.html?to=${encodeURIComponent(t.to_id || '')}&toName=${encodeURIComponent(t.arrival_station || D.city)}`;
$('sidebar-cta-text').textContent = `Paris → ${D.city}`;
$('sidebar-cta-sub').textContent  = `Dès ${t.price_from} · ${t.operator}`;

// ── Sidebar stats ─────────────────────────────────────────────────────────────
const stats = [
    { label: 'Départ',           value: t.from },
    { label: 'Arrivée',          value: t.arrival_station || D.city },
    { label: 'Durée',            value: t.duration },
    { label: 'Correspondance',   value: t.correspondance || 'Direct', green: !t.correspondance },
    { label: 'Opérateur',        value: t.operator },
    { label: 'Meilleure saison', value: t.best_season },
    { label: 'CO₂ économisé',    value: t.co2_saved + ' vs avion', green: true },
];
$('travel-stats').innerHTML = stats.map(s => `
    <div class="travel-stat">
        <span class="travel-stat-label">${s.label}</span>
        <span class="travel-stat-value" ${s.green ? 'style="color:var(--primary)"' : ''}>${s.value}</span>
    </div>
`).join('');

// ── Guides liés — générés dynamiquement depuis GUIDES_DATA ───────────────────
// GUIDES_DATA est chargé via data/guides.js avant ce script
const related = (D.related || []).slice(0, 3);
if (related.length && typeof GUIDES_DATA !== 'undefined') {
    $('related-list').innerHTML = related.map(id => {
        // Chercher les infos dans GUIDES_DATA plutôt qu'un objet hardcodé
        const g = GUIDES_DATA.find(x => x.id === id);
        const emoji = g ? (g.emoji || '🚄') : '🚄';
        const meta  = g ? `${g.duration} · ${g.badges?.[0]?.label || ''}` : '';
        const name  = g ? g.city : id.charAt(0).toUpperCase() + id.slice(1);
        return `
        <a href="guide.html?ville=${id}" class="related-card">
            <div class="related-card-emoji">${emoji}</div>
            <div>
                <div class="related-card-name">${name}</div>
                <div class="related-card-meta">${meta}</div>
            </div>
            <span class="material-symbols-outlined text-slate-300 ml-auto" style="font-size:16px">arrow_forward</span>
        </a>`;
    }).join('');
} else {
    $('related-card').style.display = 'none';
}

// ── Afficher le contenu ───────────────────────────────────────────────────────
$('loading-state').style.display = 'none';
$('guide-content').style.display = 'block';

// ── Scroll reveal ─────────────────────────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── Progress bar ──────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
    const el  = document.documentElement;
    const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
    $('reading-progress').style.width = pct + '%';
});

// ── Menu mobile ───────────────────────────────────────────────────────────────
window.toggleMobileMenu = function() {
    const nav  = $('mobile-nav');
    const icon = $('mobile-menu-icon');
    nav.classList.toggle('open');
    icon.textContent = nav.classList.contains('open') ? 'close' : 'menu';
};