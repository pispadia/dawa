// Espace équipe : collecte et vérification des numéros des structures de santé.
// Protégé par ADMIN_TOKEN (variable d'environnement). Sans elle, un jeton est généré au démarrage.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ErreurMetier } from './services.js';
import {
  TYPES_SOIN, structuresBase, etatNumeros, telFinal, publier, normaliserTel, lirePosition,
} from './structures.js';

export const JETON_ADMIN = process.env.ADMIN_TOKEN || randomBytes(12).toString('hex');

export function estAdmin(req) {
  const recu = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const attendu = Buffer.from(JETON_ADMIN);
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
}

// Réponse non JSON (fichier CSV à télécharger).
export class Fichier {
  constructor(contenu, type, nom) { Object.assign(this, { contenu, type, nom }); }
}

const SOURCES = ['appel', 'ministere', 'district', 'utilisateur', 'osm'];

// --- CSV (séparateur « ; » pour Excel en français) ---------------------------

const cellule = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function lireCsv(texte) {
  const lignes = [];
  let ligne = [], champ = '', guillemets = false;
  const t = texte.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [entete, ...donnees] = lignes.filter((l) => l.some((x) => x.trim()));
  if (!entete) return [];
  const cles = entete.map((x) => x.trim().toLowerCase());
  return donnees.map((l) => Object.fromEntries(cles.map((k, i) => [k, (l[i] ?? '').trim()])));
}

// --- Vue d'ensemble des structures avec leur état de numéro ----------------

function structuresAvecEtat(db) {
  const etat = etatNumeros(db);
  const propositions = new Map(db.prepare("SELECT structure_id, COUNT(*) AS n FROM numeros WHERE statut = 'propose' GROUP BY structure_id")
    .all().map((r) => [r.structure_id, r.n]));
  return structuresBase().filter((s) => TYPES_SOIN.includes(s.t)).map((s) => {
    const { tel, ok } = telFinal(s, etat);
    return {
      id: s.id, n: s.n, t: s.t, r: s.r, v: s.v, la: s.la, lo: s.lo,
      tel_osm: s.tel, tel, etat: ok ? 'verifie' : tel ? 'osm' : 'sans',
      propositions: propositions.get(s.id) || 0,
    };
  });
}

function filtrer(liste, url) {
  const ville = url.searchParams.get('ville');
  const type = url.searchParams.get('type');
  const etat = url.searchParams.get('etat');
  const q = (url.searchParams.get('q') || '').toLowerCase();
  return liste.filter((s) => (!ville || s.r === ville)
    && (!type || (type === 'poste' ? ['poste', 'case'].includes(s.t) : s.t === type))
    && (!etat || s.etat === etat || (etat === 'a_verifier' && s.etat !== 'verifie'))
    && (!q || s.n.toLowerCase().includes(q)));
}

function ajouterVerifie(db, { structure_id, tel, source, note }) {
  if (!structuresBase().some((s) => s.id === structure_id)) throw new ErreurMetier('Structure inconnue.');
  const n = normaliserTel(tel);
  if (!n) throw new ErreurMetier(`Numéro invalide : « ${tel} ». Format attendu : 77 123 45 67 ou 33 123 45 67.`);
  db.prepare(`INSERT INTO numeros (structure_id, tel, statut, source, note, verifie_le)
    VALUES (?, ?, 'verifie', ?, ?, datetime('now'))`)
    .run(structure_id, n, SOURCES.includes(source) ? source : 'appel', String(note ?? '').slice(0, 300) || null);
  return n;
}

// Structure absente d'OpenStreetMap. Le numéro, s'il est donné, est enregistré comme vérifié.
function ajouterStructure(db, { nom, type, position, tel, source }) {
  const n = String(nom ?? '').trim().slice(0, 120);
  if (n.length < 3) throw new ErreurMetier('Indique le nom de la structure.');
  if (!TYPES_SOIN.includes(type)) throw new ErreurMetier(`Type inconnu : « ${type} ». Types possibles : ${TYPES_SOIN.join(', ')}.`);
  const p = lirePosition(position);
  if (!p) throw new ErreurMetier('Position introuvable ou hors du Sénégal. Colle un lien Google Maps ou « 12.89, -14.94 ».');
  // Garde-fou contre les doublons : même nom à moins de 500 m.
  const doublon = structuresBase().find((s) => s.n.toLowerCase() === n.toLowerCase()
    && Math.abs(s.la - p.la) < 0.005 && Math.abs(s.lo - p.lo) < 0.005);
  if (doublon) throw new ErreurMetier(`« ${n} » existe déjà à cet endroit.`);
  if (tel && !normaliserTel(tel)) throw new ErreurMetier(`Numéro invalide : « ${tel} ».`);
  const { lastInsertRowid } = db.prepare('INSERT INTO structures_ajoutees (nom, type, la, lo, source) VALUES (?, ?, ?, ?, ?)')
    .run(n, type, p.la, p.lo, SOURCES.includes(source) ? source : 'appel');
  const id = `d${lastInsertRowid}`;
  publier(db); // pour que la nouvelle structure soit connue avant d'y rattacher le numéro
  if (tel) ajouterVerifie(db, { structure_id: id, tel, source });
  return id;
}

export function routesAdmin(db, lireCorps, lireTexte) {
  return {
    'GET /api/admin/stats': () => {
      const liste = structuresAvecEtat(db);
      const compte = (f) => liste.filter(f).length;
      const parVille = {};
      for (const s of liste) {
        parVille[s.r] ??= { total: 0, verifie: 0, osm: 0 };
        parVille[s.r].total++;
        if (s.etat !== 'sans') parVille[s.r][s.etat]++;
      }
      return {
        total: liste.length,
        verifie: compte((s) => s.etat === 'verifie'),
        osm: compte((s) => s.etat === 'osm'),
        sans: compte((s) => s.etat === 'sans'),
        propositions: db.prepare("SELECT COUNT(*) AS n FROM numeros WHERE statut = 'propose'").get().n,
        signalements: db.prepare('SELECT COUNT(*) AS n FROM signalements WHERE traite = 0').get().n,
        par_ville: Object.entries(parVille).map(([ville, v]) => ({ ville, ...v })).sort((a, b) => b.total - a.total),
      };
    },

    'GET /api/admin/structures': (req, url) => filtrer(structuresAvecEtat(db), url).slice(0, 300),

    'GET /api/admin/propositions': () => {
      const noms = new Map(structuresBase().map((s) => [s.id, s]));
      return db.prepare("SELECT id, structure_id, tel, note, cree_le FROM numeros WHERE statut = 'propose' ORDER BY cree_le DESC LIMIT 200")
        .all().map((p) => ({ ...p, structure: noms.get(p.structure_id) ?? null }));
    },

    // L'équipe a appelé le numéro et la structure a confirmé.
    'POST /api/admin/numeros': async (req) => {
      const tel = ajouterVerifie(db, await lireCorps(req));
      publier(db);
      return { tel };
    },

    'POST /api/admin/structures/ajouter': async (req) => {
      const id = ajouterStructure(db, await lireCorps(req));
      publier(db);
      return { id };
    },

    'POST /api/admin/numeros/statut': async (req) => {
      const { id, statut } = await lireCorps(req);
      if (!['verifie', 'rejete'].includes(statut)) throw new ErreurMetier('Statut invalide.');
      const r = db.prepare("UPDATE numeros SET statut = ?, verifie_le = datetime('now') WHERE id = ? AND statut = 'propose'")
        .run(statut, Number(id));
      if (!r.changes) throw new ErreurMetier('Proposition introuvable ou déjà traitée.');
      publier(db);
      return { ok: true };
    },

    // Le numéro actuel (OSM ou vérifié) est faux : on le retire de l'app.
    'POST /api/admin/numeros/faux': async (req) => {
      const { structure_id, tel } = await lireCorps(req);
      if (!tel) throw new ErreurMetier('Aucun numéro à marquer comme faux.');
      db.prepare(`INSERT INTO numeros (structure_id, tel, statut, source, verifie_le)
        VALUES (?, ?, 'rejete', 'appel', datetime('now'))`).run(String(structure_id), String(tel));
      publier(db);
      return { ok: true };
    },

    // Liste d'appels pour les bénévoles : à remplir dans Excel puis à réimporter.
    'GET /api/admin/export.csv': (req, url) => {
      const liste = filtrer(structuresAvecEtat(db), url);
      const entete = ['id', 'nom', 'type', 'zone', 'ville_osm', 'numero_actuel', 'etat', 'carte', 'numero_verifie', 'source', 'note'];
      const lignes = liste.map((s) => [
        s.id, s.n, s.t, s.r, s.v, s.tel, s.etat, `https://www.google.com/maps?q=${s.la},${s.lo}`, '', '', '',
      ]);
      const csv = `﻿${[entete, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`;
      return new Fichier(csv, 'text/csv; charset=utf-8', `dawa-numeros-${url.searchParams.get('ville') || 'senegal'}.csv`);
    },

    // Réimport : seules les lignes avec « numero_verifie » rempli sont prises.
    // Une ligne sans id mais avec nom, type et carte (lien ou « lat, lon ») crée une nouvelle structure.
    'POST /api/admin/import-csv': async (req) => {
      const lignes = lireCsv(await lireTexte(req));
      let ajoutes = 0;
      let structures = 0;
      const erreurs = [];
      for (const [i, l] of lignes.entries()) {
        try {
          if (!l.id && l.nom) {
            ajouterStructure(db, { nom: l.nom, type: l.type, position: l.carte, tel: l.numero_verifie, source: l.source || 'appel' });
            structures++;
            if (l.numero_verifie) ajoutes++;
            continue;
          }
          if (!l.numero_verifie) continue;
          ajouterVerifie(db, { structure_id: l.id, tel: l.numero_verifie, source: l.source || 'appel', note: l.note });
          ajoutes++;
        } catch (e) {
          if (!(e instanceof ErreurMetier)) throw e;
          erreurs.push(`Ligne ${i + 2} (${l.nom || l.id}) : ${e.message}`);
        }
      }
      if (ajoutes || structures) publier(db);
      return { ajoutes, structures, erreurs };
    },

    'GET /api/admin/signalements': () => {
      const noms = new Map(structuresBase().map((s) => [s.id, s]));
      return db.prepare('SELECT * FROM signalements WHERE traite = 0 ORDER BY cree_le DESC LIMIT 200').all()
        .map((s) => ({ ...s, structure: noms.get(s.structure_id) ?? null }));
    },

    'POST /api/admin/signalements/traite': async (req) => {
      const { id } = await lireCorps(req);
      db.prepare('UPDATE signalements SET traite = 1 WHERE id = ?').run(Number(id));
      return { ok: true };
    },
  };
}
