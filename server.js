// Serveur HTTP de Dawa : API JSON + fichiers statiques. Aucune dépendance externe.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ouvrirDb, QUARTIERS, verifierMotDePasse } from './db.js';
import { rechercher, chercherMedicaments, reserver, enregistrerVente, ErreurMetier } from './services.js';
import { repondre } from './bot.js';
import { chargerBase, publier, structuresBase, normaliserTel } from './structures.js';
import { routesAdmin, estAdmin, Fichier, JETON_ADMIN } from './admin.js';

const PORT = Number(process.env.PORT) || 3000;
const dossierPublic = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const db = ouvrirDb();
chargerBase();
publier(db);

// Jeton -> id de pharmacie. En mémoire : une reconnexion est nécessaire après redémarrage.
const jetons = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};

function json(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corps));
}

async function lireTexte(req, limite = 100_000) {
  let brut = '';
  for await (const morceau of req) {
    brut += morceau;
    if (brut.length > limite) throw new ErreurMetier('Requête trop volumineuse.');
  }
  return brut;
}

async function lireCorps(req) {
  const brut = await lireTexte(req);
  if (!brut) return {};
  if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(brut));
  }
  try {
    return JSON.parse(brut);
  } catch {
    throw new ErreurMetier('JSON invalide.');
  }
}

function pharmacieConnectee(req) {
  const jeton = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return jetons.get(jeton) ?? null;
}

const echapperXml = (s) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

// --- Limite d'envois par adresse IP (contre le spam et les essais de mots de passe) ---------

const HEURE = 60 * 60 * 1000;
const LIMITES = {
  'POST /api/numeros': [10, HEURE],
  'POST /api/signalements': [10, HEURE],
  'POST /api/reservations': [10, HEURE],
  'POST /api/connexion': [10, 15 * 60 * 1000],
  admin_echec: [10, 15 * 60 * 1000],
};
const compteurs = new Map(); // "cle|ip" -> horodatages des derniers envois

function adresseIp(req) {
  // Derrière un hébergeur (Render, Railway…), l'IP réelle est dans X-Forwarded-For.
  if (process.env.TRUST_PROXY) return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  return req.socket.remoteAddress;
}

// Renvoie true si la limite est dépassée ; sinon compte cet envoi.
function limiteDepassee(req, cle) {
  const [max, fenetre] = LIMITES[cle];
  const k = `${cle}|${adresseIp(req)}`;
  const maintenant = Date.now();
  const recents = (compteurs.get(k) || []).filter((t) => maintenant - t < fenetre);
  if (recents.length >= max) {
    compteurs.set(k, recents);
    return true;
  }
  recents.push(maintenant);
  compteurs.set(k, recents);
  return false;
}

// Ménage régulier pour que la mémoire ne grossisse pas.
setInterval(() => {
  const maintenant = Date.now();
  for (const [k, t] of compteurs) if (t.every((x) => maintenant - x > HEURE)) compteurs.delete(k);
}, 10 * 60 * 1000).unref();

// --- Routes publiques -------------------------------------------------------

const publiques = {
  'GET /api/quartiers': () => Object.keys(QUARTIERS),

  'GET /api/suggestions': (req, url) => chercherMedicaments(db, url.searchParams.get('q') || '', 6),

  'GET /api/recherche': (req, url) => {
    const q = url.searchParams.get('q') || '';
    const quartier = QUARTIERS[url.searchParams.get('quartier')] ? url.searchParams.get('quartier') : null;
    return rechercher(db, { terme: q, quartier });
  },

  'POST /api/reservations': async (req) => reserver(db, { ...(await lireCorps(req)), canal: 'web' }),

  // Numéro proposé par un utilisateur : invisible dans l'app tant que l'équipe ne l'a pas vérifié.
  'POST /api/numeros': async (req) => {
    const { structure_id, tel, note } = await lireCorps(req);
    const id = String(structure_id ?? '');
    if (!structuresBase().some((s) => s.id === id)) throw new ErreurMetier('Structure inconnue.');
    const n = normaliserTel(tel);
    if (!n) throw new ErreurMetier('Numéro invalide. Exemple : 77 123 45 67 ou 33 123 45 67.');
    const deja = db.prepare('SELECT 1 FROM numeros WHERE structure_id = ? AND tel = ?').get(id, n);
    if (!deja) {
      db.prepare("INSERT INTO numeros (structure_id, tel, statut, source, note) VALUES (?, ?, 'propose', 'utilisateur', ?)")
        .run(id, n, String(note ?? '').trim().slice(0, 200) || null);
    }
    return { ok: true };
  },

  // Erreur signalée sur une structure de santé (numéro faux, fermée…), à vérifier à la main.
  'POST /api/signalements': async (req) => {
    const { structure_id, nom, message } = await lireCorps(req);
    const id = String(structure_id ?? '').slice(0, 20);
    const texte = String(message ?? '').trim().slice(0, 500);
    if (!/^[nwrd]\d+$/.test(id) || !texte) throw new ErreurMetier('Signalement invalide.');
    db.prepare('INSERT INTO signalements (structure_id, nom, message) VALUES (?, ?, ?)')
      .run(id, String(nom ?? '').slice(0, 120), texte);
    return { ok: true };
  },

  'POST /api/connexion': async (req) => {
    const { identifiant, mot_de_passe } = await lireCorps(req);
    const p = db.prepare('SELECT id, nom, mot_de_passe FROM pharmacies WHERE identifiant = ?')
      .get(String(identifiant ?? '').trim().toLowerCase());
    if (!p || !verifierMotDePasse(String(mot_de_passe ?? ''), p.mot_de_passe)) {
      throw new ErreurMetier('Identifiant ou mot de passe incorrect.');
    }
    const jeton = randomBytes(24).toString('hex');
    jetons.set(jeton, p.id);
    return { jeton, nom: p.nom };
  },
};

// --- Routes pharmacie (connexion requise) ----------------------------------

const privees = {
  'GET /api/moi': (id) => db.prepare(
    'SELECT id, nom, quartier, adresse, telephone, de_garde FROM pharmacies WHERE id = ?').get(id),

  'POST /api/deconnexion': (id, req) => {
    jetons.delete((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    return { ok: true };
  },

  'POST /api/garde': async (id, req) => {
    const { de_garde } = await lireCorps(req);
    db.prepare('UPDATE pharmacies SET de_garde = ? WHERE id = ?').run(de_garde ? 1 : 0, id);
    return { de_garde: !!de_garde };
  },

  'GET /api/stock': (id) => db.prepare(`
    SELECT m.id AS medicament_id, m.nom, m.dci, m.forme, m.ordonnance,
           s.quantite, s.prix, s.seuil, s.peremption
    FROM stocks s JOIN medicaments m ON m.id = s.medicament_id
    WHERE s.pharmacie_id = ? ORDER BY m.nom`).all(id),

  'GET /api/catalogue': () => db.prepare('SELECT id, nom, dci, forme FROM medicaments ORDER BY nom').all(),

  // Ajoute un produit au stock ou met à jour quantité / prix / seuil / péremption.
  'POST /api/stock': async (id, req) => {
    const b = await lireCorps(req);
    const medId = Number(b.medicament_id);
    const quantite = Number.parseInt(b.quantite, 10);
    const prix = Number.parseInt(b.prix, 10);
    const seuil = Number.parseInt(b.seuil ?? 5, 10);
    const peremption = b.peremption && /^\d{4}-\d{2}-\d{2}$/.test(b.peremption) ? b.peremption : null;
    if (!db.prepare('SELECT 1 FROM medicaments WHERE id = ?').get(medId)) throw new ErreurMetier('Médicament inconnu.');
    if (!(quantite >= 0) || !(prix > 0) || !(seuil >= 0)) throw new ErreurMetier('Quantité, prix ou seuil invalide.');
    db.prepare(`INSERT INTO stocks (pharmacie_id, medicament_id, quantite, prix, seuil, peremption)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (pharmacie_id, medicament_id)
      DO UPDATE SET quantite = excluded.quantite, prix = excluded.prix,
                    seuil = excluded.seuil, peremption = excluded.peremption`)
      .run(id, medId, quantite, prix, seuil, peremption);
    return { ok: true };
  },

  'POST /api/ventes': async (id, req) => {
    const { medicament_id, quantite } = await lireCorps(req);
    return enregistrerVente(db, id, Number(medicament_id), quantite);
  },

  'GET /api/reservations': (id) => db.prepare(`
    SELECT r.id, r.code, r.quantite, r.client_nom, r.client_tel, r.canal, r.statut, r.cree_le,
           m.nom AS medicament, m.id AS medicament_id
    FROM reservations r JOIN medicaments m ON m.id = r.medicament_id
    WHERE r.pharmacie_id = ? ORDER BY r.statut = 'en_attente' DESC, r.cree_le DESC LIMIT 50`).all(id),

  // Retirée = le client est passé : on enregistre la vente. Annulée = rien ne bouge.
  'POST /api/reservations/statut': async (id, req) => {
    const { reservation_id, statut } = await lireCorps(req);
    if (!['retiree', 'annulee'].includes(statut)) throw new ErreurMetier('Statut invalide.');
    const r = db.prepare("SELECT * FROM reservations WHERE id = ? AND pharmacie_id = ? AND statut = 'en_attente'")
      .get(Number(reservation_id), id);
    if (!r) throw new ErreurMetier('Réservation introuvable ou déjà traitée.');
    if (statut === 'retiree') enregistrerVente(db, id, r.medicament_id, r.quantite);
    db.prepare('UPDATE reservations SET statut = ? WHERE id = ?').run(statut, r.id);
    return { ok: true };
  },

  'GET /api/tableau': (id) => {
    const aujourdhui = db.prepare(`SELECT COALESCE(SUM(quantite * prix_unitaire), 0) AS ca, COUNT(*) AS nb
      FROM ventes WHERE pharmacie_id = ? AND date(cree_le) = date('now')`).get(id);
    const ruptures = db.prepare(`SELECT m.nom, s.quantite, s.seuil FROM stocks s JOIN medicaments m ON m.id = s.medicament_id
      WHERE s.pharmacie_id = ? AND s.quantite <= s.seuil ORDER BY s.quantite, m.nom`).all(id);
    const peremptions = db.prepare(`SELECT m.nom, s.quantite, s.peremption FROM stocks s JOIN medicaments m ON m.id = s.medicament_id
      WHERE s.pharmacie_id = ? AND s.quantite > 0 AND s.peremption IS NOT NULL
        AND s.peremption <= date('now', '+60 days') ORDER BY s.peremption`).all(id);
    const enAttente = db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE pharmacie_id = ? AND statut = 'en_attente'").get(id).n;
    // Ce que les patients de la zone cherchent sans le trouver : à commander en priorité.
    const quartier = db.prepare('SELECT quartier FROM pharmacies WHERE id = ?').get(id).quartier;
    const demandes = db.prepare(`SELECT terme, COUNT(*) AS n FROM recherches
      WHERE trouve = 0 AND (quartier = ? OR quartier IS NULL) AND cree_le >= datetime('now', '-30 days')
      GROUP BY terme ORDER BY n DESC LIMIT 5`).all(quartier);
    return { ventes_jour: aujourdhui, ruptures, peremptions, reservations_en_attente: enAttente, demandes_non_servies: demandes };
  },
};

// --- Bot WhatsApp -----------------------------------------------------------

async function routeWhatsapp(req, res) {
  const corps = await lireCorps(req);
  // Twilio envoie From / Body en formulaire et attend du TwiML ; le simulateur envoie du JSON.
  if (corps.Body !== undefined) {
    // Twilio ajoute Latitude / Longitude quand l'utilisateur partage sa position.
    const position = corps.Latitude ? { la: Number(corps.Latitude), lo: Number(corps.Longitude) } : null;
    const reponse = repondre(db, String(corps.From || 'inconnu'), corps.Body, position);
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${echapperXml(reponse)}</Message></Response>`);
    return;
  }
  const position = corps.position ? { la: Number(corps.position.la), lo: Number(corps.position.lo) } : null;
  json(res, 200, { reponse: repondre(db, String(corps.de || 'simulateur'), corps.message, position) });
}

// --- Fichiers statiques ----------------------------------------------------

async function servirFichier(res, chemin) {
  const relatif = chemin === '/' ? 'index.html' : chemin.endsWith('/') ? `${chemin}index.html` : chemin;
  let decode;
  try {
    decode = decodeURIComponent(relatif);
  } catch {
    return json(res, 400, { erreur: 'Adresse invalide' });
  }
  const fichier = path.normalize(path.join(dossierPublic, decode));
  if (!fichier.startsWith(dossierPublic + path.sep)) return json(res, 403, { erreur: 'Interdit' });
  const avecExt = path.extname(fichier) ? fichier : `${fichier}.html`;
  try {
    const contenu = await readFile(avecExt);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(avecExt)] || 'application/octet-stream' });
    res.end(contenu);
  } catch {
    json(res, 404, { erreur: 'Page introuvable' });
  }
}

// L'import CSV peut dépasser la limite des requêtes JSON.
const admin = routesAdmin(db, lireCorps, (req) => lireTexte(req, 3_000_000));

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const cle = `${req.method} ${url.pathname}`;
  // En-têtes de sécurité de base. Pas de CSP stricte : les pages ont des scripts en ligne.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  try {
    if (cle === 'POST /api/whatsapp') return await routeWhatsapp(req, res);
    if (LIMITES[cle] && limiteDepassee(req, cle)) {
      return json(res, 429, { erreur: 'Trop d\'envois en peu de temps. Réessaie plus tard.' });
    }
    if (publiques[cle]) return json(res, 200, await publiques[cle](req, url));
    if (privees[cle]) {
      const id = pharmacieConnectee(req);
      if (!id) return json(res, 401, { erreur: 'Connecte-toi d\'abord.' });
      return json(res, 200, await privees[cle](id, req, url));
    }
    if (admin[cle]) {
      if (!estAdmin(req)) {
        // Seuls les échecs comptent : l'équipe connectée n'est jamais bloquée.
        if (limiteDepassee(req, 'admin_echec')) return json(res, 429, { erreur: 'Trop d\'essais. Réessaie dans 15 minutes.' });
        return json(res, 401, { erreur: 'Jeton équipe invalide.' });
      }
      const r = await admin[cle](req, url);
      if (r instanceof Fichier) {
        res.writeHead(200, { 'Content-Type': r.type, 'Content-Disposition': `attachment; filename="${r.nom}"` });
        return res.end(r.contenu);
      }
      return json(res, 200, r);
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { erreur: 'Route inconnue' });
    // HEAD sert aux aperçus de liens (WhatsApp, Facebook) : Node n'envoie alors que les en-têtes.
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erreur: 'Méthode non autorisée' });
    return await servirFichier(res, url.pathname);
  } catch (e) {
    if (e instanceof ErreurMetier) return json(res, 400, { erreur: e.message });
    console.error(e);
    return json(res, 500, { erreur: 'Erreur serveur' });
  }
});

serveur.listen(PORT, () => {
  console.log(`Dawa tourne sur http://localhost:${PORT}`);
  console.log(`  Urgences     : http://localhost:${PORT}/`);
  console.log(`  Bot WhatsApp : http://localhost:${PORT}/whatsapp`);
  console.log(`  Pharmacie    : http://localhost:${PORT}/pharmacie`);
  console.log(`  Équipe       : http://localhost:${PORT}/equipe`);
  if (!process.env.ADMIN_TOKEN) {
    console.log(`  Jeton équipe (généré, change à chaque démarrage ; fixe-le avec ADMIN_TOKEN) : ${JETON_ADMIN}`);
  }
});
