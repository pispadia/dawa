// Audio wolof des fiches de premiers secours, enregistré par l'équipe depuis /equipe.
// Une copie de travail est gardée dans SQLite ; Supabase (table audio_fiches, en base64) est la source de vérité,
// comme pour les numéros : le serveur la recharge au démarrage.
import { ErreurMetier } from './services.js';
import { FICHES } from './public/secours.js';
import { persistanceActive, requete, maintenant } from './persistance.js';

const IDS_FICHES = new Set(FICHES.map((f) => f.id));
const MIME_OK = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)(;\s*codecs=[\w.,"-]+)?$/;
const TAILLE_MAX = 3_000_000; // octets, environ 5 minutes de voix

function creerTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS audio_fiches (
    fiche_id TEXT PRIMARY KEY, mime TEXT NOT NULL, donnees BLOB NOT NULL, maj TEXT NOT NULL)`);
}

export async function restaurerAudio(db) {
  creerTable(db);
  if (!persistanceActive) return null;
  const lignes = await requete('audio_fiches?select=*');
  db.exec('DELETE FROM audio_fiches');
  const inserer = db.prepare('INSERT INTO audio_fiches (fiche_id, mime, donnees, maj) VALUES (?, ?, ?, ?)');
  for (const l of lignes) inserer.run(l.fiche_id, l.mime, Buffer.from(l.donnees, 'base64'), l.maj);
  return lignes.length;
}

export const fichesAvecAudio = (db) => db.prepare('SELECT fiche_id FROM audio_fiches ORDER BY fiche_id').all().map((r) => r.fiche_id);

export const lireAudio = (db, id) => db.prepare('SELECT mime, donnees, maj FROM audio_fiches WHERE fiche_id = ?').get(id);

function verifierFiche(id) {
  if (!IDS_FICHES.has(id)) throw new ErreurMetier('Fiche inconnue.');
}

export function routesAudio(db, lireTexte) {
  return {
    'GET /api/admin/audio': () => db.prepare('SELECT fiche_id, mime, maj, length(donnees) AS octets FROM audio_fiches').all(),

    // Corps : { fiche_id, mime, donnees } avec donnees en base64.
    'POST /api/admin/audio': async (req) => {
      let corps;
      try { corps = JSON.parse(await lireTexte(req)); } catch { throw new ErreurMetier('JSON invalide.'); }
      const { fiche_id, mime, donnees } = corps;
      verifierFiche(fiche_id);
      if (!MIME_OK.test(String(mime))) throw new ErreurMetier(`Format audio non accepté : ${mime}`);
      const octets = Buffer.from(String(donnees), 'base64');
      if (octets.length < 2000) throw new ErreurMetier('Enregistrement vide ou trop court.');
      if (octets.length > TAILLE_MAX) throw new ErreurMetier('Enregistrement trop long (5 minutes au plus).');
      const maj = maintenant();
      if (persistanceActive) {
        await requete('audio_fiches', {
          methode: 'POST',
          corps: { fiche_id, mime, donnees: octets.toString('base64'), maj },
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
      }
      db.prepare('INSERT OR REPLACE INTO audio_fiches (fiche_id, mime, donnees, maj) VALUES (?, ?, ?, ?)')
        .run(fiche_id, mime, octets, maj);
      return { ok: true, octets: octets.length };
    },

    'POST /api/admin/audio/supprimer': async (req) => {
      let corps;
      try { corps = JSON.parse(await lireTexte(req)); } catch { throw new ErreurMetier('JSON invalide.'); }
      verifierFiche(corps.fiche_id);
      if (persistanceActive) {
        await requete(`audio_fiches?fiche_id=eq.${encodeURIComponent(corps.fiche_id)}`, { methode: 'DELETE', prefer: 'return=minimal' });
      }
      db.prepare('DELETE FROM audio_fiches WHERE fiche_id = ?').run(corps.fiche_id);
      return { ok: true };
    },
  };
}
