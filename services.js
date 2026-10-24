// Logique métier partagée entre l'API web et le bot WhatsApp.
import { randomInt } from 'node:crypto';
import { QUARTIERS, normaliser } from './db.js';

function distanceKm([lat1, lng1], [lat2, lng2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function chercherMedicaments(db, terme, limite = 8) {
  const t = normaliser(terme);
  if (t.length < 2) return [];
  // Chaque mot doit apparaître : « amox 500 » trouve « Amoxicilline 500 mg ».
  const mots = t.split(/\s+/).filter(Boolean).slice(0, 4);
  const clause = mots.map(() => 'recherche LIKE ?').join(' AND ');
  return db.prepare(`SELECT id, nom, dci, forme, ordonnance FROM medicaments WHERE ${clause} ORDER BY nom LIMIT ?`)
    .all(...mots.map((m) => `%${m}%`), limite);
}

// Pour chaque médicament trouvé : les pharmacies qui l'ont en stock, les plus proches d'abord.
export function rechercher(db, { terme, quartier, canal = 'web' }) {
  const medicaments = chercherMedicaments(db, terme);
  const origine = quartier && QUARTIERS[quartier];
  const disponibles = db.prepare(`
    SELECT p.id, p.nom, p.quartier, p.adresse, p.telephone, p.lat, p.lng, p.de_garde,
           s.quantite, s.prix
    FROM stocks s JOIN pharmacies p ON p.id = s.pharmacie_id
    WHERE s.medicament_id = ? AND s.quantite > 0`);

  const resultats = medicaments.map((m) => {
    const pharmacies = disponibles.all(m.id).map((p) => ({
      ...p,
      de_garde: !!p.de_garde,
      distance_km: origine ? Math.round(distanceKm(origine, [p.lat, p.lng]) * 10) / 10 : null,
    }));
    pharmacies.sort((a, b) => (origine ? a.distance_km - b.distance_km : a.prix - b.prix));
    return { ...m, ordonnance: !!m.ordonnance, pharmacies };
  });

  // On garde la trace des recherches : c'est la donnée « quels médicaments manquent, où ».
  if (normaliser(terme).length >= 2) {
    const trouve = resultats.some((r) => r.pharmacies.length > 0) ? 1 : 0;
    db.prepare('INSERT INTO recherches (terme, quartier, trouve, canal) VALUES (?, ?, ?, ?)')
      .run(normaliser(terme).slice(0, 80), quartier || null, trouve, canal);
  }
  return resultats;
}

export class ErreurMetier extends Error {}

export function reserver(db, { pharmacie_id, medicament_id, quantite = 1, client_nom, client_tel, canal = 'web' }) {
  quantite = Number.parseInt(quantite, 10);
  if (!Number.isInteger(quantite) || quantite < 1 || quantite > 10) throw new ErreurMetier('Quantité invalide (1 à 10).');
  const nom = String(client_nom ?? '').trim().slice(0, 60);
  const tel = String(client_tel ?? '').replace(/[^\d+]/g, '').slice(0, 16);
  if (!nom) throw new ErreurMetier('Indique ton nom.');
  if (tel.replace(/\D/g, '').length < 9) throw new ErreurMetier('Numéro de téléphone invalide.');

  const stock = db.prepare('SELECT quantite FROM stocks WHERE pharmacie_id = ? AND medicament_id = ?')
    .get(pharmacie_id, medicament_id);
  if (!stock || stock.quantite < quantite) throw new ErreurMetier('Plus assez de stock dans cette pharmacie.');

  const code = `DW-${randomInt(1000, 10000)}`;
  db.prepare(`INSERT INTO reservations (code, pharmacie_id, medicament_id, quantite, client_nom, client_tel, canal)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(code, pharmacie_id, medicament_id, quantite, nom, tel, canal);
  return { code };
}

// Une vente décrémente le stock ; une réservation retirée passe aussi par ici.
export function enregistrerVente(db, pharmacieId, medicamentId, quantite) {
  quantite = Number.parseInt(quantite, 10);
  if (!Number.isInteger(quantite) || quantite < 1) throw new ErreurMetier('Quantité invalide.');
  const stock = db.prepare('SELECT quantite, prix FROM stocks WHERE pharmacie_id = ? AND medicament_id = ?')
    .get(pharmacieId, medicamentId);
  if (!stock) throw new ErreurMetier('Produit absent de ton stock.');
  if (stock.quantite < quantite) throw new ErreurMetier(`Stock insuffisant (${stock.quantite} restant).`);
  db.prepare('UPDATE stocks SET quantite = quantite - ? WHERE pharmacie_id = ? AND medicament_id = ?')
    .run(quantite, pharmacieId, medicamentId);
  db.prepare('INSERT INTO ventes (pharmacie_id, medicament_id, quantite, prix_unitaire) VALUES (?, ?, ?, ?)')
    .run(pharmacieId, medicamentId, quantite, stock.prix);
  return { restant: stock.quantite - quantite, total: stock.prix * quantite };
}
