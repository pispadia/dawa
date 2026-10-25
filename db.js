// Base SQLite (module natif node:sqlite, aucune dépendance) + données de démo pour Dakar.
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ici = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR : dossier d'un disque persistant en production (ex. /var/data sur Render).
const dossierData = process.env.DATA_DIR || path.join(ici, 'data');
const fichierDb = path.join(dossierData, 'dawa.db');

// Coordonnées approximatives du centre de chaque quartier.
export const QUARTIERS = {
  'Plateau': [14.6708, -17.4381],
  'Médina': [14.6837, -17.4495],
  'Point E': [14.6930, -17.4630],
  'Mermoz': [14.7065, -17.4760],
  'HLM': [14.7110, -17.4440],
  'Sacré-Cœur': [14.7210, -17.4670],
  'Liberté 6': [14.7270, -17.4600],
  'Ouakam': [14.7230, -17.4940],
  'Grand Yoff': [14.7360, -17.4520],
  'Ngor': [14.7470, -17.5130],
  'Yoff': [14.7560, -17.4800],
  'Parcelles Assainies': [14.7640, -17.4410],
  'Pikine': [14.7550, -17.3920],
  'Guédiawaye': [14.7790, -17.3950],
  'Rufisque': [14.7160, -17.2730],
};

// Façons courantes d'écrire un quartier dans un message (déjà normalisées).
export const ALIAS_QUARTIERS = {
  'parcelles': 'Parcelles Assainies',
  'pa': 'Parcelles Assainies',
  'liberte': 'Liberté 6',
  'sacre coeur': 'Sacré-Cœur',
  'golf': 'Guédiawaye',
  'thiaroye': 'Pikine',
  'almadies': 'Ngor',
  'fann': 'Point E',
  'centre ville': 'Plateau',
};

// Minuscules, sans accents ni tirets : sert à la recherche tolérante (« sacre coeur » = « Sacré-Cœur »).
export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hacherMotDePasse(motDePasse) {
  const sel = randomBytes(16).toString('hex');
  return `${sel}:${scryptSync(motDePasse, sel, 32).toString('hex')}`;
}

export function verifierMotDePasse(motDePasse, stocke) {
  const [sel, hash] = String(stocke).split(':');
  return scryptSync(motDePasse, sel, 32).toString('hex') === hash;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pharmacies (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  quartier TEXT NOT NULL,
  adresse TEXT NOT NULL,
  telephone TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  de_garde INTEGER NOT NULL DEFAULT 0,
  identifiant TEXT UNIQUE NOT NULL,
  mot_de_passe TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS medicaments (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  dci TEXT NOT NULL,
  forme TEXT NOT NULL,
  ordonnance INTEGER NOT NULL DEFAULT 0,
  recherche TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stocks (
  pharmacie_id INTEGER NOT NULL REFERENCES pharmacies(id),
  medicament_id INTEGER NOT NULL REFERENCES medicaments(id),
  quantite INTEGER NOT NULL DEFAULT 0,
  prix INTEGER NOT NULL,
  seuil INTEGER NOT NULL DEFAULT 5,
  peremption TEXT,
  PRIMARY KEY (pharmacie_id, medicament_id)
);
CREATE TABLE IF NOT EXISTS ventes (
  id INTEGER PRIMARY KEY,
  pharmacie_id INTEGER NOT NULL,
  medicament_id INTEGER NOT NULL,
  quantite INTEGER NOT NULL,
  prix_unitaire INTEGER NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  pharmacie_id INTEGER NOT NULL,
  medicament_id INTEGER NOT NULL,
  quantite INTEGER NOT NULL,
  client_nom TEXT NOT NULL,
  client_tel TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'web',
  statut TEXT NOT NULL DEFAULT 'en_attente',
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS signalements (
  id INTEGER PRIMARY KEY,
  structure_id TEXT NOT NULL,
  nom TEXT,
  message TEXT NOT NULL,
  traite INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Numéros des structures de santé : proposés par les utilisateurs, ajoutés ou vérifiés par l'équipe.
CREATE TABLE IF NOT EXISTS numeros (
  id INTEGER PRIMARY KEY,
  structure_id TEXT NOT NULL,
  tel TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'propose',  -- propose | verifie | rejete
  source TEXT NOT NULL DEFAULT 'utilisateur', -- utilisateur | appel | ministere | district | osm
  note TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  verifie_le TEXT
);
CREATE INDEX IF NOT EXISTS numeros_structure ON numeros (structure_id);
-- Structures absentes d'OpenStreetMap, ajoutées par l'équipe (identifiant public : « d » + id).
CREATE TABLE IF NOT EXISTS structures_ajoutees (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  type TEXT NOT NULL,
  la REAL NOT NULL,
  lo REAL NOT NULL,
  source TEXT,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS recherches (
  id INTEGER PRIMARY KEY,
  terme TEXT NOT NULL,
  quartier TEXT,
  trouve INTEGER NOT NULL,
  canal TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// [nom commercial, DCI, forme, sur ordonnance, prix indicatif FCFA]
const CATALOGUE = [
  ['Doliprane 1000 mg', 'paracétamol', 'comprimés x8', 0, 1100],
  ['Efferalgan 500 mg', 'paracétamol', 'comprimés effervescents x16', 0, 1500],
  ['Paracétamol 500 mg', 'paracétamol', 'comprimés x20 (générique)', 0, 500],
  ['Advil 400 mg', 'ibuprofène', 'comprimés x14', 0, 2600],
  ['Ibuprofène 400 mg', 'ibuprofène', 'comprimés x20 (générique)', 0, 900],
  ['Spasfon', 'phloroglucinol', 'comprimés x30', 0, 2400],
  ['Smecta', 'diosmectite', 'sachets x12', 0, 2900],
  ['SRO', 'sels de réhydratation orale', 'sachets x10', 0, 600],
  ['Coartem 20/120', 'artéméther + luméfantrine', 'comprimés x24', 1, 3500],
  ['Amoxicilline 500 mg', 'amoxicilline', 'gélules x12', 1, 1300],
  ['Augmentin 1 g', 'amoxicilline + acide clavulanique', 'comprimés x8', 1, 6900],
  ['Flagyl 500 mg', 'métronidazole', 'comprimés x14', 1, 2100],
  ['Ciprofloxacine 500 mg', 'ciprofloxacine', 'comprimés x10', 1, 1800],
  ['Ventoline 100 µg', 'salbutamol', 'aérosol', 1, 3800],
  ['Metformine 850 mg', 'metformine', 'comprimés x30', 1, 1500],
  ['Amlodipine 5 mg', 'amlodipine', 'comprimés x30', 1, 2200],
  ['Lasilix 40 mg', 'furosémide', 'comprimés x30', 1, 1700],
  ['Oméprazole 20 mg', 'oméprazole', 'gélules x14', 0, 1900],
  ['Maalox', 'hydroxyde d\'aluminium + magnésium', 'suspension buvable', 0, 2700],
  ['Clamoxyl sirop 250 mg', 'amoxicilline', 'suspension buvable enfant', 1, 2300],
  ['Doliprane sirop 2,4 %', 'paracétamol', 'suspension buvable enfant', 0, 1600],
  ['Fer + acide folique', 'fer + acide folique', 'comprimés x30', 0, 800],
  ['Vitamine C 500 mg', 'acide ascorbique', 'comprimés à croquer x20', 0, 1000],
  ['Polaramine 2 mg', 'dexchlorphéniramine', 'comprimés x20', 0, 1400],
  ['Insuline Actrapid', 'insuline humaine', 'flacon 10 ml', 1, 7500],
];

// Noms fictifs : ce sont des données de démo, pas de vraies pharmacies.
const PHARMACIES = [
  ['Pharmacie du Baobab', 'Plateau', 'Avenue de démo, Plateau', '+221 33 000 00 01', 1],
  ['Pharmacie de la Corniche', 'Médina', 'Rue de démo, Médina', '+221 33 000 00 02', 0],
  ['Pharmacie Teranga', 'Point E', 'Rue de démo, Point E', '+221 33 000 00 03', 0],
  ['Pharmacie des Almadies', 'Ngor', 'Route de démo, Ngor', '+221 33 000 00 04', 0],
  ['Pharmacie Keur Serigne', 'Mermoz', 'Allée de démo, Mermoz', '+221 33 000 00 05', 1],
  ['Pharmacie du Marché', 'HLM', 'Marché de démo, HLM', '+221 33 000 00 06', 0],
  ['Pharmacie Sopi', 'Sacré-Cœur', 'Rue de démo, Sacré-Cœur', '+221 33 000 00 07', 0],
  ['Pharmacie de l\'Espoir', 'Liberté 6', 'Rond-point de démo, Liberté 6', '+221 33 000 00 08', 0],
  ['Pharmacie Diamalaye', 'Grand Yoff', 'Rue de démo, Grand Yoff', '+221 33 000 00 09', 1],
  ['Pharmacie de l\'Aéroport', 'Yoff', 'Route de démo, Yoff', '+221 33 000 00 10', 0],
  ['Pharmacie Unité 17', 'Parcelles Assainies', 'Unité de démo, Parcelles', '+221 33 000 00 11', 0],
  ['Pharmacie Thiaroye', 'Pikine', 'Route de démo, Pikine', '+221 33 000 00 12', 1],
  ['Pharmacie Golf Sud', 'Guédiawaye', 'Avenue de démo, Guédiawaye', '+221 33 000 00 13', 0],
  ['Pharmacie Ouakam Village', 'Ouakam', 'Rue de démo, Ouakam', '+221 33 000 00 14', 0],
  ['Pharmacie de la Gare', 'Rufisque', 'Rue de démo, Rufisque', '+221 33 000 00 15', 0],
];

// Générateur pseudo-aléatoire déterministe : la démo est identique à chaque réinitialisation.
function graine(n) {
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}

function dateDansJours(jours) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

function remplirDemo(db) {
  const hasard = graine(42);
  const insPharma = db.prepare(`INSERT INTO pharmacies
    (nom, quartier, adresse, telephone, lat, lng, de_garde, identifiant, mot_de_passe)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  PHARMACIES.forEach(([nom, quartier, adresse, tel, garde], i) => {
    const [lat, lng] = QUARTIERS[quartier];
    // Identifiants de démo : pharma1 … pharma15, mot de passe « demo1234 ».
    insPharma.run(nom, quartier, adresse, tel,
      lat + (hasard() - 0.5) * 0.006, lng + (hasard() - 0.5) * 0.006,
      garde, `pharma${i + 1}`, hacherMotDePasse('demo1234'));
  });

  const insMed = db.prepare('INSERT INTO medicaments (nom, dci, forme, ordonnance, recherche) VALUES (?, ?, ?, ?, ?)');
  CATALOGUE.forEach(([nom, dci, forme, ordo]) => {
    insMed.run(nom, dci, forme, ordo, normaliser(`${nom} ${dci}`));
  });

  const insStock = db.prepare(`INSERT INTO stocks (pharmacie_id, medicament_id, quantite, prix, seuil, peremption)
    VALUES (?, ?, ?, ?, ?, ?)`);
  PHARMACIES.forEach((_, p) => {
    CATALOGUE.forEach(([, , , , prix], m) => {
      // Environ 1 produit sur 4 n'est pas référencé, et 1 sur 6 est en rupture.
      if (hasard() < 0.25) return;
      const enRupture = hasard() < 0.17;
      const quantite = enRupture ? 0 : Math.floor(hasard() * 40) + 1;
      const ecart = Math.round(prix * (hasard() * 0.16 - 0.08) / 50) * 50;
      const peremption = dateDansJours(Math.floor(hasard() * 500) + 10);
      insStock.run(p + 1, m + 1, quantite, prix + ecart, 5, peremption);
    });
  });
}

export function ouvrirDb({ reinitialiser = false } = {}) {
  if (!existsSync(dossierData)) mkdirSync(dossierData, { recursive: true });
  if (reinitialiser && existsSync(fichierDb)) rmSync(fichierDb);
  const db = new DatabaseSync(fichierDb);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM pharmacies').get();
  if (n === 0) remplirDemo(db);
  return db;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--reset')) {
  ouvrirDb({ reinitialiser: true }).close();
  console.log('Base réinitialisée avec les données de démo.');
}
