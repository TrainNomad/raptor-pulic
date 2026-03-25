const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://trainnomad.eu';
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'guide', 'data'); // Dossier contenant tes 36 JSON
const SITEMAP_PATH = path.join(ROOT_DIR, 'sitemap.xml');

function generateSitemap() {
    console.log("🌐 Génération du sitemap SEO pour TrainNomad...");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Pages Statiques (Priorité Haute)
    const statics = [
        { url: '/', priority: '1.0' },
        { url: '/explorermax.html', priority: '0.9' },
        { url: '/outilstgvmax.html', priority: '0.8' },
        { url: '/guide/index.html', priority: '0.8' }
    ];

    statics.forEach(page => {
        xml += `  <url>\n    <loc>${BASE_URL}${page.url}</loc>\n    <priority>${page.priority}</priority>\n  </url>\n`;
    });

    // 2. Pages Dynamiques (Tes 36 destinations)
    if (fs.existsSync(DATA_DIR)) {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

        files.forEach(file => {
            const cityName = path.basename(file, '.json');
            const stats = fs.statSync(path.join(DATA_DIR, file));
            const lastMod = stats.mtime.toISOString().split('T')[0]; // Récupère la date réelle du fichier

            xml += `  <url>\n`;
            xml += `    <loc>${BASE_URL}/guide/guide.html?ville=${cityName}</loc>\n`;
            xml += `    <lastmod>${lastMod}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.7</priority>\n`;
            xml += `  </url>\n`;
        });
    }

    xml += `</urlset>`;

    fs.writeFileSync(SITEMAP_PATH, xml);
    console.log(`✅ Sitemap créé avec ${statics.length} pages fixes et ${fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).length} destinations.`);
}

generateSitemap();
