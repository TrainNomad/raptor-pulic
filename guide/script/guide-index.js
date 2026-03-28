/* ============================================================
   TrainNomad.eu — guide/script/guide-index.js
   Logique de la page guide/index.html
   Dépend de : guide/data/guides.js (GUIDES_DATA chargé avant)
   ============================================================ */

// ── Config pays : ordre d'affichage + flag local ─────────────────────────────
// Ajoutez une entrée ici quand vous couvrez un nouveau pays.
const COUNTRY_CONFIG = [
    { country: 'Italie',      emoji: '🇮🇹', flag: '../assets/pays/italie.webp' },
    { country: 'Espagne',     emoji: '🇪🇸', flag: '../assets/pays/espagne.webp' },
    { country: 'Portugal',    emoji: '🇵🇹', flag: '../assets/pays/portugal.webp' },
    { country: 'Allemagne',   emoji: '🇩🇪', flag: '../assets/pays/allemagne.webp' },
    { country: 'Suisse',      emoji: '🇨🇭', flag: '../assets/pays/suisse.webp' },
    { country: 'Belgique',    emoji: '🇧🇪', flag: '../assets/pays/belgique.webp' },
    { country: 'Pays-Bas',    emoji: '🇳🇱', flag: '../assets/pays/pays-bas.webp' },
    { country: 'France',      emoji: '🇫🇷', flag: '../assets/pays/france.webp' },
    { country: 'Royaume-Uni', emoji: '🇬🇧', flag: '../assets/pays/royaume-uni.webp' },
];

// ── Génération des filtres pays depuis GUIDES_DATA ────────────────────────────
function buildCountryFilters() {
    const bar = document.querySelector('[style*="scrollbar-width"]') ||
                document.querySelector('.sticky .flex');
    if (!bar) return;

    // Pays réellement présents dans les données
    const presentCountries = new Set(GUIDES_DATA.map(g => g.country));

    COUNTRY_CONFIG.forEach(({ country, emoji, flag }) => {
        if (!presentCountries.has(country)) return;

        // Tag de filtre = nom du pays en minuscules sans accents
        const tag = country.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        const btn = document.createElement('button');
        btn.className = 'filter-pill';
        btn.dataset.filter = tag;
        btn.onclick = function () { setFilter(this); };

        // Image drapeau avec fallback emoji
        const img = document.createElement('img');
        img.src = flag;
        img.alt = '';
        img.loading = 'lazy';
        img.style.cssText = 'width:20px;border-radius:3px;object-fit:cover;flex-shrink:0;';
        img.onerror = function () { this.replaceWith(document.createTextNode(emoji + ' ')); };

        btn.appendChild(img);
        btn.appendChild(document.createTextNode(country));
        bar.appendChild(btn);
    });
}

// ── Rendu d'une carte ─────────────────────────────────────────────────────────
function renderCard(g, delay) {
    const badgesHtml = g.badges.map(b => `<span class="badge ${b.cls}">${b.label}</span>`).join('');
    const imgContent = g.cover
        ? `<img src="../assets/guides/${g.cover}" alt="${g.city}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
    const placeholder = `<div class="guide-card-img-placeholder" style="display:${g.cover ? 'none' : 'flex'};background:linear-gradient(135deg,#1A2B3C,#2d4a63)">${g.emoji}</div>`;

    return `
    <a href="guide.html?ville=${g.id}" class="guide-card fade-up" style="animation-delay:${delay}s" data-tags="${g.tags.join(',')}">
        <div class="guide-card-img">
            ${imgContent}${placeholder}
            <div class="guide-card-badges">${badgesHtml}</div>
            <div class="guide-card-travel">
                <span class="material-symbols-outlined text-sm" style="color:#4ade80">schedule</span>
                ${g.duration}
            </div>
        </div>
        <div class="guide-card-body">
            <div class="guide-card-meta" style="display:flex;align-items:center;gap:6px;">
                ${(()=>{ const c=COUNTRY_CONFIG.find(x=>x.country===g.country); return c?`<img src="${c.flag}" alt="" loading="lazy" style="width:18px;;border-radius:2px;object-fit:cover;flex-shrink:0;" onerror="this.replaceWith(document.createTextNode('${c.emoji}'))">`:''; })()}
                ${g.country} · ${g.city}
            </div>
            <div class="guide-card-title">${g.tagline}</div>
            <div class="guide-card-excerpt">${g.excerpt}</div>
            <div class="guide-card-footer">
                <span class="guide-card-link">
                    Lire le guide <span class="material-symbols-outlined text-base">arrow_forward</span>
                </span>
                <span class="text-xs font-semibold text-slate-400">dès ${g.price}</span>
            </div>
        </div>
    </a>`;
}

// ── Filtrage ──────────────────────────────────────────────────────────────────
let currentFilter = 'tous';
let currentSearch = '';

function setFilter(btn) {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilters();
}

function filterGuides() {
    currentSearch = document.getElementById('search-guides').value.toLowerCase();
    applyFilters();
}

function applyFilters() {
    const filtered = GUIDES_DATA.filter(g => {
        const matchFilter = currentFilter === 'tous' || g.tags.includes(currentFilter);
        const matchSearch = !currentSearch ||
            g.city.toLowerCase().includes(currentSearch) ||
            g.country.toLowerCase().includes(currentSearch) ||
            g.tagline.toLowerCase().includes(currentSearch);
        return matchFilter && matchSearch;
    });

    const grid  = document.getElementById('guides-grid');
    const empty = document.getElementById('empty-state');
    const count = document.getElementById('results-count');

    count.textContent = filtered.length + ' guide' + (filtered.length > 1 ? 's' : '');

    if (!filtered.length) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        grid.innerHTML = filtered.map((g, i) => renderCard(g, i * 0.06)).join('');
    }

    // Compteurs stats — toujours basés sur GUIDES_DATA complet
    const statGuides = document.getElementById('stat-guides');
    const statPays   = document.getElementById('stat-pays');
    if (statGuides) statGuides.textContent = GUIDES_DATA.length;
    if (statPays) {
        statPays.textContent = new Set(GUIDES_DATA.map(g => g.country)).size;
    }
}

// ── Menu mobile ───────────────────────────────────────────────────────────────
function toggleMobileMenu() {
    const nav  = document.getElementById('mobile-nav');
    const icon = document.getElementById('mobile-menu-icon');
    const open = nav.classList.toggle('open');
    icon.textContent = open ? 'close' : 'menu';
}

// ── Init ──────────────────────────────────────────────────────────────────────
buildCountryFilters(); // Injecte les filtres pays depuis GUIDES_DATA
applyFilters();        // Remplit la grille + met à jour les compteurs