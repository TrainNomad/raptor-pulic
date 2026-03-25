const fs = require('fs');
const path = require('path');

// Chemins absolus pour éviter les erreurs ENOENT
const ROOT_DIR = path.resolve(__dirname, '..');
const README_PATH = path.join(ROOT_DIR, 'README.md');

// Fonction récursive pour scanner TOUS les fichiers et dossiers
function scanFolder(dir, prefix = '') {
    if (!fs.existsSync(dir)) return '';
    
    let structure = '';
    const items = fs.readdirSync(dir);

    items.forEach((item, index) => {
        // On ignore les dossiers inutiles pour le README
        if (item === 'node_modules' || item === '.git' || item === '.DS_Store') return;
        
        const isLast = index === items.length - 1;
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        const isDirectory = stats.isDirectory();
        
        // Ajout visuel à l'arborescence
        structure += `${prefix}${isLast ? '└── ' : '├── '}${item}${isDirectory ? '/' : ''}\n`;
        
        if (isDirectory) {
            structure += scanFolder(fullPath, prefix + (isLast ? '    ' : '│   '));
        }
    });
    return structure;
}

function updateReadme() {
    console.log("🔍 Scan total du projet TrainNomad en cours...");

    // 1. Génération de l'arborescence complète
    const fullTree = scanFolder(ROOT_DIR);

    // 2. Préparation du contenu basé sur tes fichiers
    const today = "25 Mars 2026";
    const content = `# 🚄 TrainNomad - TGV Max & Nomad

Dernière mise à jour : ${today}

## 📊 État Global du Projet
* **Total de destinations** : 36 fichiers JSON détectés[cite: 7].
* **Mise à jour majeure** : Aujourd'hui (Dijon, Montpellier, Toulouse, Nice)[cite: 1].
* **Technologies** : HTML5, CSS3 (Tailwind), JavaScript ES6.

## 🌍 Couverture Géographique [cite: 4, 5, 6]
* 🇫🇷 **France (20)** : De Lille à Marseille, incluant les nouveautés du jour.
* 🇪🇸 **Espagne (5)** : Barcelone, Grenade, Madrid, Malaga, Séville.
* 🇵🇹 **Portugal (3)** : Faro, Lisbonne, Porto.
* 🇪🇺 **Europe (8)** : Italie (2), Allemagne (2), Suisse (2), Pays-Bas (1), Belgique (1).

## 📁 Architecture Complète (Auto-générée)
\`\`\`text
${fullTree}\`\`\`

## 🛠️ Scripts de Maintenance
Le projet inclut des scripts automatisés situés dans \`/script\` :
* \`uptdate-readmd.js\` : Met à jour ce fichier.
* \`explorer.js\` : Gestion de la recherche.
* \`trajetsmax.js\` : Logique spécifique TGV Max.

---
*Document généré automatiquement pour Google SEO et suivi de projet.*
`;

    try {
        fs.writeFileSync(README_PATH, content);
        console.log("✅ Le README.md a été mis à jour avec TOUT le contenu du projet !");
    } catch (err) {
        console.error("❌ Erreur d'écriture :", err);
    }
}

updateReadme();