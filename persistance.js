// Sauvegarde durable des données de l'équipe (numéros, signalements, structures ajoutées) dans Supabase.
// SQLite reste la base de travail du serveur ; Supabase est la source de vérité :
//   - au démarrage, on recopie Supabase dans SQLite (le disque de Render est effacé à chaque redéploiement) ;
//   - chaque écriture part d'abord dans Supabase, puis est recopiée dans SQLite avec le même id.
// Sans les variables d'environnement, tout reste en local (développement, tests).
const URL_API = process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1` : null;
const CLE = process.env.SUPABASE_KEY;
const SECRET = process.env.DAWA_DB_SECRET;

export const persistanceActive = Boolean(URL_API && CLE && SECRET);

const COLONNES = {
  numeros: ['id', 'structure_id', 'tel', 'statut', 'source', 'note', 'cree_le', 'verifie_le'],
  signalements: ['id', 'structure_id', 'nom', 'message', 'traite', 'cree_le'],
  structures_ajoutees: ['id', 'nom', 'type', 'la', 'lo', 'source', 'actif', 'cree_le'],
};

// Même format que datetime('now') de SQLite : « 2026-10-26 09:15:00 » (UTC).
export const maintenant = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function requete(chemin, { methode = 'GET', corps } = {}) {
  const res = await fetch(`${URL_API}/${chemin}`, {
    method: methode,
    headers: {
      apikey: CLE,
      'x-dawa-secret': SECRET,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`Supabase ${methode} ${chemin} : ${res.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}

function insererLocal(db, table, ligne) {
  const cols = COLONNES[table].filter((c) => ligne[c] !== undefined);
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((c) => ligne[c]));
}

// Remplace le contenu local des trois tables par celui de Supabase.
export async function restaurer(db) {
  if (!persistanceActive) return null;
  const bilan = {};
  for (const table of Object.keys(COLONNES)) {
    const lignes = await requete(`${table}?select=*&order=id`);
    db.exec(`DELETE FROM ${table}`);
    for (const l of lignes) insererLocal(db, table, l);
    bilan[table] = lignes.length;
  }
  return bilan;
}

// Ajoute une ligne et renvoie son id.
export async function inserer(db, table, champs) {
  if (!persistanceActive) {
    const cols = Object.keys(champs);
    const r = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => champs[c]));
    return Number(r.lastInsertRowid);
  }
  const [ligne] = await requete(table, { methode: 'POST', corps: champs });
  insererLocal(db, table, ligne);
  return Number(ligne.id);
}

// Modifie une ligne par son id.
export async function modifier(db, table, id, champs) {
  if (persistanceActive) await requete(`${table}?id=eq.${Number(id)}`, { methode: 'PATCH', corps: champs });
  const cols = Object.keys(champs);
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...cols.map((c) => champs[c]), Number(id));
}
