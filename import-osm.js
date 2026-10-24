// Importe les structures de santé du Sénégal depuis OpenStreetMap vers data/structures-osm.json,
// puis republie public/data/structures.json avec les numéros vérifiés (voir structures.js).
// Usage : node import-osm.js            (télécharge depuis l'API Overpass)
//         node import-osm.js fichier.json (convertit un export Overpass déjà téléchargé)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ouvrirDb } from './db.js';
import { chargerBase, publier, villeProche } from './structures.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const sortie = path.join(ici, 'data', 'structures-osm.json');

const REQUETE = `[out:json][timeout:90];
area["ISO3166-1"="SN"][admin_level=2]->.sn;
(
  nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](area.sn);
  nwr["healthcare"~"^(hospital|clinic|centre|doctor|birthing_centre|pharmacy)$"](area.sn);
);
out center tags;`;

async function telecharger() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'Dawa/0.2 (import structures de sante)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: REQUETE }),
  });
  if (!res.ok) throw new Error(`Overpass a répondu ${res.status}`);
  return res.json();
}

// Le type sert au tri (« hôpital le plus proche ») et au choix de qui prévenir.
function classer(tags, nomAffiche) {
  const nom = nomAffiche.toLowerCase();
  const a = tags.amenity, h = tags.healthcare;
  if (a === 'pharmacy' || h === 'pharmacy') return 'pharmacie';
  // « cas+e » rattrape la faute de frappe fréquente « Casse de santé ».
  if (/cas+e\s+de\s+sant/.test(nom)) return 'case';
  if (/poste\s+de\s+sant/.test(nom)) return 'poste';
  if (/centre\s+de\s+sant|\bcs\b/.test(nom) || h === 'centre') return 'centre';
  // Le nom l'emporte sur l'étiquette : beaucoup de cliniques privées sont étiquetées « hospital ».
  if (/clinique|polyclinique|dispensaire/.test(nom)) return 'clinique';
  if (a === 'hospital' || h === 'hospital' || /h[oô]pital|\bchu\b|\bchr\b|\beps\b/.test(nom)) return 'hopital';
  if (h === 'birthing_centre' || /maternit/.test(nom)) return 'maternite';
  if (a === 'doctors' || h === 'doctor' || /cabinet/.test(nom)) return 'cabinet';
  return 'clinique';
}

function telephone(tags) {
  const brut = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || tags['contact:mobile'] || '';
  const premier = brut.split(/[;,/]/)[0].trim();
  const chiffres = premier.replace(/[^\d+]/g, '');
  if (chiffres.replace(/\D/g, '').length < 9) return '';
  // Numéros sénégalais à 9 chiffres : on ajoute l'indicatif pour que l'appel marche partout.
  return /^\d{9}$/.test(chiffres) ? `+221${chiffres}` : chiffres.replace(/^00/, '+');
}

function convertir(osm) {
  const vus = new Set();
  const structures = [];
  for (const el of osm.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const t = el.tags || {};
    // Quelques entrées OSM sont du vandalisme ou de la publicité.
    if (/^[#@]|https?:|www\./i.test(t.name || '')) continue;
    const cle = `${el.type[0]}${el.id}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const nom = (t.name || t['name:fr'] || '').trim();
    const type = classer(t, nom);
    structures.push({
      id: cle,
      n: nom,
      t: type,
      la: Math.round(lat * 1e5) / 1e5,
      lo: Math.round(lng * 1e5) / 1e5,
      tel: telephone(t),
      v: t['addr:city'] || t['addr:town'] || t['addr:village'] || t['is_in:city'] || '',
      u: t.emergency === 'yes' ? 1 : 0,
    });
  }
  return structures;
}

const fichier = process.argv[2];
const osm = fichier ? JSON.parse(await readFile(fichier, 'utf8')) : await telecharger();
const structures = convertir(osm).map((s) => ({ ...s, r: villeProche(s.la, s.lo) }));
await mkdir(path.dirname(sortie), { recursive: true });
await writeFile(sortie, JSON.stringify({
  source: '© les contributeurs d\'OpenStreetMap (ODbL)',
  mis_a_jour: (osm.osm3s?.timestamp_osm_base || new Date().toISOString()).slice(0, 10),
  structures,
}));

// On republie tout de suite le fichier public, avec les numéros déjà vérifiés par l'équipe.
const db = ouvrirDb();
chargerBase();
publier(db);
db.close();

const parType = structures.reduce((acc, s) => ({ ...acc, [s.t]: (acc[s.t] || 0) + 1 }), {});
const avecTel = structures.filter((s) => s.tel).length;
console.log(`${structures.length} structures écrites dans data/structures-osm.json (et publiées)`);
console.log('Par type :', parType);
console.log(`Avec numéro de téléphone : ${avecTel} (${Math.round((avecTel / structures.length) * 100)} %)`);
