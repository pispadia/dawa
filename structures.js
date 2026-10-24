// Structures de santé : base OpenStreetMap + structures ajoutées et numéros vérifiés par l'équipe.
// data/structures-osm.json (base, écrite par import-osm.js) + tables « structures_ajoutees » et « numeros »
//   -> public/data/structures.json (ce que voient l'app et le bot).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VILLES } from './public/villes.js';

const fichierBase = fileURLToPath(new URL('./data/structures-osm.json', import.meta.url));
const fichierPublic = fileURLToPath(new URL('./public/data/structures.json', import.meta.url));

export const TYPES_SOIN = ['hopital', 'centre', 'maternite', 'poste', 'case', 'clinique'];

let base = null;
let ajoutees = [];
let publiees = [];

// Ville de référence la plus proche : sert à répartir le travail par zone.
export function villeProche(la, lo) {
  let meilleure = '';
  let min = Infinity;
  for (const [v, [vla, vlo]] of Object.entries(VILLES)) {
    const d = (vla - la) ** 2 + ((vlo - lo) * Math.cos((la * Math.PI) / 180)) ** 2;
    if (d < min) { min = d; meilleure = v; }
  }
  return meilleure;
}

// Accepte « 12.89, -14.94 », un lien Google Maps (…@12.89,-14.94… ou ?q=12.89,-14.94) ou un plus code décodé.
// Renvoie null si ce n'est pas une position au Sénégal.
export function lirePosition(texte) {
  const m = String(texte ?? '').match(/(-?\d{1,2}\.\d{2,})\s*,\s*(-?\d{1,2}\.\d{2,})/);
  if (!m) return null;
  const la = Number(m[1]);
  const lo = Number(m[2]);
  if (la < 12.2 || la > 16.8 || lo < -17.6 || lo > -11.3) return null;
  return { la: Math.round(la * 1e5) / 1e5, lo: Math.round(lo * 1e5) / 1e5 };
}

function chargerAjoutees(db) {
  ajoutees = db.prepare('SELECT id, nom, type, la, lo FROM structures_ajoutees WHERE actif = 1').all()
    .map((s) => ({ id: `d${s.id}`, n: s.nom, t: s.type, la: s.la, lo: s.lo, tel: '', v: '', u: 0, r: villeProche(s.la, s.lo) }));
}

export function chargerBase() {
  if (!existsSync(fichierBase)) {
    console.warn('data/structures-osm.json introuvable : lance « node import-osm.js ».');
    base = { source: '', mis_a_jour: '', structures: [] };
  } else {
    base = JSON.parse(readFileSync(fichierBase, 'utf8'));
  }
  return base;
}

export const structuresBase = () => [...(base ?? chargerBase()).structures, ...ajoutees];
export const structuresPubliees = () => publiees;

// Pour chaque structure : le dernier numéro vérifié gagne ; un numéro OSM marqué faux est retiré.
export function etatNumeros(db) {
  const lignes = db.prepare(`SELECT structure_id, tel, statut FROM numeros
    WHERE statut IN ('verifie', 'rejete') ORDER BY COALESCE(verifie_le, cree_le), id`).all();
  const verifies = new Map();
  const rejetes = new Map();
  for (const l of lignes) {
    if (l.statut === 'verifie') verifies.set(l.structure_id, l.tel);
    else {
      if (!rejetes.has(l.structure_id)) rejetes.set(l.structure_id, new Set());
      rejetes.get(l.structure_id).add(l.tel);
      // Un numéro rejeté après avoir été vérifié n'est plus valable.
      if (verifies.get(l.structure_id) === l.tel) verifies.delete(l.structure_id);
    }
  }
  return { verifies, rejetes };
}

export function telFinal(s, { verifies, rejetes }) {
  if (verifies.has(s.id)) return { tel: verifies.get(s.id), ok: 1 };
  if (s.tel && !rejetes.get(s.id)?.has(s.tel)) return { tel: s.tel, ok: 0 };
  return { tel: '', ok: 0 };
}

export function publier(db) {
  chargerAjoutees(db);
  const etat = etatNumeros(db);
  publiees = structuresBase().map((s) => {
    const { tel, ok } = telFinal(s, etat);
    const sortie = { ...s, tel };
    if (ok) sortie.ok = 1;
    return sortie;
  });
  writeFileSync(fichierPublic, JSON.stringify({ source: base.source, mis_a_jour: base.mis_a_jour, structures: publiees }));
  return publiees;
}

// « 77 123 45 67 », « 00221 33… » -> « +221771234567 ». Renvoie '' si ce n'est pas un numéro sénégalais plausible.
export function normaliserTel(brut) {
  let n = String(brut ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (/^\d{9}$/.test(n)) n = `+221${n}`;
  if (/^221\d{9}$/.test(n)) n = `+${n}`;
  // Fixes en 33, mobiles en 70/75/76/77/78.
  return /^\+221(3[03]|7[05678])\d{7}$/.test(n) ? n : '';
}
