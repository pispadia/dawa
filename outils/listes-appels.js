// Prépare les listes d'appels d'une ou plusieurs zones pour les bénévoles :
//   - un fichier CSV par zone, au format de l'espace équipe (à réimporter une fois rempli) ;
//   - une page HTML à imprimer (ou à enregistrer en PDF) pour appeler sur papier.
// Usage : node outils/listes-appels.js <dossier de sortie> Podor Richard-Toll Saint-Louis
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chargerBase, structuresBase, TYPES_SOIN } from '../structures.js';

const [sortie, ...zones] = process.argv.slice(2);
if (!sortie || !zones.length) {
  console.error('Usage : node outils/listes-appels.js <dossier> <zone> [zone…]');
  process.exit(1);
}

const LIBELLES = { hopital: 'Hôpital', centre: 'Centre de santé', maternite: 'Maternité', poste: 'Poste de santé', case: 'Case de santé', clinique: 'Clinique' };
// Les structures qui reçoivent les urgences graves passent en premier.
const PRIORITE = ['hopital', 'centre', 'maternite', 'poste', 'case', 'clinique'];
const cellule = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const chiffres = (tel) => String(tel).replace(/\D/g, '').slice(-9);
const majuscule = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lisible = (tel) => chiffres(tel).replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');

chargerBase();
mkdirSync(sortie, { recursive: true });
const pages = [];

for (const zone of zones) {
  const liste = structuresBase()
    .filter((s) => s.r === zone && TYPES_SOIN.includes(s.t))
    .sort((a, b) => Boolean(b.tel) - Boolean(a.tel) || PRIORITE.indexOf(a.t) - PRIORITE.indexOf(b.t) || (a.n || '').localeCompare(b.n || '', 'fr'));
  if (!liste.length) {
    console.error(`Zone inconnue ou vide : ${zone}`);
    continue;
  }

  // Un même numéro peut figurer sur plusieurs structures (doublons OSM, standard commun) : un seul appel suffit.
  const premierAvec = new Map();
  for (const s of liste) if (s.tel && !premierAvec.has(chiffres(s.tel))) premierAvec.set(chiffres(s.tel), s);
  const doublonDe = (s) => {
    const p = s.tel && premierAvec.get(chiffres(s.tel));
    return p && p !== s ? p : null;
  };

  const entete = ['id', 'nom', 'type', 'zone', 'ville_osm', 'numero_actuel', 'etat', 'carte', 'numero_verifie', 'source', 'note', 'meme_numero_que'];
  const lignes = liste.map((s) => [
    s.id, s.n, s.t, s.r, s.v, s.tel, s.tel ? 'osm' : 'sans', `https://www.google.com/maps?q=${s.la},${s.lo}`, '', '', '', doublonDe(s)?.n || '',
  ]);
  const fichier = path.join(sortie, `dawa-appels-${zone.toLowerCase()}.csv`);
  writeFileSync(fichier, `﻿${[entete, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`);

  const avecTel = liste.filter((s) => s.tel);
  const sansTel = liste.filter((s) => !s.tel);
  console.log(`${zone} : ${avecTel.length} numéros à vérifier (${premierAvec.size} appels), ${sansTel.length} sans numéro → ${fichier}`);

  pages.push(`
    <section>
      <h2>${echapper(zone)} : ${premierAvec.size} appels à faire</h2>
      <table>
        <thead><tr><th>#</th><th>Structure</th><th>Numéro à appeler</th><th>Résultat</th><th>Bon numéro (si différent)</th><th>Qui a répondu ?</th></tr></thead>
        <tbody>${avecTel.map((s, i) => {
          const d = doublonDe(s);
          return `<tr${d ? ' class="doublon"' : ''}><td>${i + 1}</td>
            <td><b>${echapper(majuscule(s.n) || '(sans nom)')}</b><br><small>${LIBELLES[s.t]}${s.v ? ` · ${echapper(s.v)}` : ''}</small></td>
            <td class="tel">${d ? `<small>même numéro que<br>« ${echapper(d.n)} »</small>` : lisible(s.tel)}</td>
            <td class="cases">${d ? '' : '☐ Marche  ☐ Faux  ☐ Pas de réponse'}</td><td></td><td></td></tr>`;
        }).join('')}</tbody>
      </table>
      <h3>${sansTel.length} structures sans numéro (à demander au district, à l'infirmier chef de poste ou à la mairie)</h3>
      <p class="sans">${sansTel.map((s) => `${echapper(s.n || '(sans nom)')} <small>(${LIBELLES[s.t]})</small>`).join(' · ')}</p>
    </section>`);
}

writeFileSync(path.join(sortie, 'listes-appels.html'), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Dawa : listes d'appels</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 11px/1.35 system-ui, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 0 0 6px; } h3 { font-size: 12px; margin: 12px 0 4px; }
  .consigne { border: 1.5px solid #0f7b5a; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
  .consigne ol { margin: 4px 0 0; padding-left: 18px; }
  section { page-break-before: always; } section:first-of-type { page-break-before: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #e8f3ef; } tr { page-break-inside: avoid; }
  td:nth-child(1) { width: 22px; } td:nth-child(3) { width: 110px; } td:nth-child(4) { width: 215px; white-space: pre; } td:nth-child(5) { width: 130px; } td:nth-child(6) { width: 130px; }
  .tel { font-size: 14px; font-weight: 700; letter-spacing: .5px; white-space: nowrap; }
  .doublon { color: #777; } .sans { font-size: 10px; color: #333; }
</style></head><body>
  <h1>Dawa : vérification des numéros des structures de santé</h1>
  <div class="consigne"><b>Comment faire :</b><ol>
    <li>Appelle le numéro. Présente-toi : « Bonjour, je suis bénévole pour Dawa, une application gratuite qui aide les gens à joindre la structure de santé la plus proche en cas d'urgence. »</li>
    <li>Demande : « Est-ce bien le poste / centre de santé de … ? Peut-on vous joindre à ce numéro en cas d'urgence, y compris la nuit ? »</li>
    <li>Coche « Marche » seulement si une personne de la structure confirme. Note son nom ou sa fonction (ICP, sage-femme, gardien…).</li>
    <li>Si on te donne un meilleur numéro, écris-le dans « Bon numéro ». Pas de réponse : réessaie un autre jour, à une autre heure.</li>
  </ol></div>
  ${pages.join('')}
</body></html>`);
