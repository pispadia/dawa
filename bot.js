// Bot WhatsApp : reçoit un message texte, renvoie la réponse texte.
// Branché sur /api/whatsapp (format JSON pour le simulateur, format Twilio pour la prod).
import { QUARTIERS, ALIAS_QUARTIERS, normaliser } from './db.js';
import { rechercher, reserver, ErreurMetier } from './services.js';
import { structuresPubliees, TYPES_SOIN } from './structures.js';
import { FICHES } from './public/secours.js';
import { VILLES } from './public/villes.js';
// Au-delà, une structure « joignable » n'aide pas : mieux vaut appeler le 1515.
const DISTANCE_MAX_PREVENIR_KM = 50;
const LIBELLE_TYPE = {
  hopital: 'Hôpital', centre: 'Centre de santé', poste: 'Poste de santé', case: 'Case de santé',
  maternite: 'Maternité', clinique: 'Clinique', cabinet: 'Cabinet', pharmacie: 'Pharmacie',
};

const NUMEROS_URGENCE = [
  '🚨 *Numéros d\'urgence (gratuits)*',
  '🚑 SAMU : *1515*',
  '🚒 Pompiers : *18* (accidents, incendies, noyades)',
  '👮 Police : *17*',
  '',
  '📍 Envoie ta *position* (📎 > Position) pour voir les structures de santé les plus proches.',
  '🩹 Envoie *secours* pour les gestes de premiers secours.',
].join('\n');

function distanceKm(la1, lo1, la2, lo2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function repondreStructuresProches(la, lo, origineTexte) {
  const avecDistance = structuresPubliees().filter((s) => TYPES_SOIN.includes(s.t))
    .map((s) => ({ ...s, km: distanceKm(la, lo, s.la, s.lo) }))
    .sort((a, b) => a.km - b.km);
  if (!avecDistance.length) return 'Désolé, la liste des structures de santé n\'est pas disponible pour le moment. Appelle le *1515*.';
  // Les 3 plus proches, plus la plus proche joignable par téléphone si elle n'y est pas déjà.
  const choix = avecDistance.slice(0, 3);
  const joignable = avecDistance.find((s) => s.tel && s.km <= DISTANCE_MAX_PREVENIR_KM);
  if (joignable && !choix.includes(joignable)) choix.push(joignable);
  const km = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);
  return [
    `🏥 *Structures de santé proches* ${origineTexte}`,
    '',
    ...choix.map((s, i) => [
      `*${i + 1}.* ${s.n || LIBELLE_TYPE[s.t]} (${LIBELLE_TYPE[s.t]}) · ${km(s.km)}`,
      s.tel ? `    📞 ${s.tel}${s.ok ? ' ✔ vérifié' : ''}` : '    📞 numéro inconnu',
      `    🧭 https://www.google.com/maps/dir/?api=1&destination=${s.la},${s.lo}`,
    ].join('\n')),
    '',
    '🚨 Urgence grave : appelle le *1515* (SAMU) ou le *18* (pompiers).',
  ].join('\n');
}

// Mots qu'on écrit vraiment dans un message, vers la bonne fiche.
const MOTS_FICHES = {
  inconscient: ['inconscient', 'evanoui', 'evanouie', 'respire pas', 'malaise', 'xem'],
  etouffement: ['etouffement', 'etouffe', 'avale de travers'],
  saignement: ['saignement', 'saigne', 'hemorragie', 'sang', 'deret'],
  accouchement: ['accouchement', 'accoucher', 'accouche', 'jur'],
  serpent: ['serpent', 'morsure', 'jaan'],
  scorpion: ['scorpion', 'jit'],
  brulure: ['brulure', 'brule', 'brulee', 'lakk'],
  convulsions: ['convulsion', 'convulsions', 'crise'],
  accident: ['accident', 'aksidaa'],
  deshydratation: ['diarrhee', 'deshydratation', 'deshydrate'],
  fievre: ['fievre', 'paludisme', 'palu', 'sibiru'],
};

function trouverFiche(t) {
  const mots = ` ${t} `;
  const id = Object.keys(MOTS_FICHES).find((k) => MOTS_FICHES[k].some((m) => mots.includes(` ${m} `)));
  return FICHES.find((f) => f.id === id) ?? null;
}

function texteFiche(f) {
  return [
    `${f.icone} *${f.titre.fr}*`,
    `🚨 Appelle d'abord le *${f.numero}*`,
    '',
    '*À faire :*',
    ...f.faire.map((x, i) => `${i + 1}. ${x}`),
    '',
    '*À ne pas faire :*',
    ...f.eviter.map((x) => `✕ ${x}`),
    ...(f.danger ? ['', '*Va vite au poste de santé si :*', ...f.danger.map((x) => `! ${x}`)] : []),
    '',
    '_Conseils généraux, en cours de validation médicale. Ils ne remplacent pas un soignant._',
  ].join('\n');
}

const MENU_SECOURS = [
  '🩹 *Premiers secours* : envoie le mot qui correspond :',
  ...FICHES.map((f) => `${f.icone} ${MOTS_FICHES[f.id][0]}`),
].join('\n');

function trouverVille(t) {
  const mots = ` ${t} `;
  return Object.keys(VILLES).find((v) => mots.includes(` ${normaliser(v)} `)) ?? null;
}

// Conversation en cours par numéro. En mémoire pour le MVP ; à passer en base plus tard.
const sessions = new Map();
const DUREE_SESSION_MS = 30 * 60 * 1000;

const AIDE = [
  '✚ *Dawa* : urgences médicales au Sénégal (gratuit).',
  '',
  '🚨 *urgence* : numéros des secours',
  '📍 Envoie ta *position* (📎 > Position), ou *hôpital* + ta ville (ex. _hôpital kolda_) : structures de santé proches',
  '🩹 *secours* : gestes de premiers secours (ex. _brûlure_, _serpent_, _accouchement_)',
  '💊 Nom d\'un médicament + quartier : pharmacies qui l\'ont (Dakar, démo). Ex. _doliprane parcelles_',
  '',
  '⚠️ En cas de danger grave, appelle tout de suite le *1515* (SAMU) ou le *18* (pompiers).',
].join('\n');

const prix = (n) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`;

// Toutes les écritures possibles d'un quartier, les plus longues d'abord (« grand yoff » avant « yoff »).
const FORMES_QUARTIERS = [
  ...Object.keys(QUARTIERS).map((q) => [normaliser(q), q]),
  ...Object.entries(ALIAS_QUARTIERS),
].sort((a, b) => b[0].length - a[0].length);

function separerQuartier(message) {
  let texte = ` ${normaliser(message)} `;
  let quartier = null;
  const trouve = FORMES_QUARTIERS.find(([forme]) => texte.includes(` ${forme} `));
  if (trouve) {
    quartier = trouve[1];
    texte = texte.replace(` ${trouve[0]} `, ' ');
  }
  texte = texte.replace(/\b(a|vers|sur|aux|au|cote|pres de|dans)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { terme: texte, quartier };
}

function repondreRecherche(db, numero, message) {
  const { terme, quartier } = separerQuartier(message);
  if (terme.length < 2) {
    return quartier
      ? `Quartier noté : *${quartier}*. Quel médicament cherches-tu ?`
      : AIDE;
  }

  const resultats = rechercher(db, { terme, quartier, canal: 'whatsapp' });
  if (resultats.length === 0) {
    return `Je ne connais pas « ${terme} » 🤔\nVérifie l'orthographe ou envoie le nom écrit sur l'ordonnance.`;
  }

  const enStock = resultats.filter((r) => r.pharmacies.length > 0);
  if (enStock.length === 0) {
    return `😔 *${resultats[0].nom}* n'est disponible dans aucune pharmacie partenaire pour le moment.\nRéessaie plus tard ou demande un équivalent à ton médecin.`;
  }

  const med = enStock[0];
  const options = med.pharmacies.slice(0, 3);
  const lignes = [`✅ *${med.nom}* (${med.forme})`];
  if (med.ordonnance) lignes.push('⚠️ Sur ordonnance : présente-la à la pharmacie.');
  lignes.push('');
  options.forEach((p, i) => {
    const dist = p.distance_km != null ? ` · ${p.distance_km} km` : '';
    const garde = p.de_garde ? ' · 🌙 de garde' : '';
    lignes.push(`*${i + 1}.* ${p.nom} (${p.quartier}${dist}${garde})`);
    lignes.push(`    ${prix(p.prix)} · 📞 ${p.telephone}`);
  });
  lignes.push('');
  lignes.push(`Réponds *1*, *2* ou *3* pour réserver.`);
  if (!quartier) lignes.push('📍 Ajoute ton quartier pour voir les plus proches (ex. _doliprane mermoz_).');
  const autres = enStock.slice(1, 4).map((r) => r.nom);
  if (autres.length) lignes.push(`Autres produits trouvés : ${autres.join(', ')}.`);

  sessions.set(numero, { etape: 'choix', medicament: med, options, expire: Date.now() + DUREE_SESSION_MS });
  return lignes.join('\n');
}

export function repondre(db, numero, message, position = null) {
  const texte = String(message ?? '').trim();
  const t = normaliser(texte);
  let session = sessions.get(numero);
  if (session && session.expire < Date.now()) {
    sessions.delete(numero);
    session = null;
  }

  // Position partagée depuis WhatsApp : c'est la demande la plus urgente, on la traite d'abord.
  if (position && Number.isFinite(position.la) && Number.isFinite(position.lo)) {
    sessions.delete(numero);
    return repondreStructuresProches(position.la, position.lo, 'de toi');
  }

  if (!t || ['aide', 'help', 'menu', 'bonjour', 'salut', 'salam', 'hello', 'nanga def'].includes(t)) {
    sessions.delete(numero);
    return AIDE;
  }
  if (['annuler', 'stop', 'non'].includes(t)) {
    sessions.delete(numero);
    return 'C\'est noté, on recommence. Quel médicament cherches-tu ?';
  }

  if (session?.etape === 'choix' && /^[1-3]$/.test(t)) {
    const choix = session.options[Number(t) - 1];
    if (!choix) return 'Choix invalide. Réponds avec un numéro de la liste.';
    sessions.set(numero, { ...session, etape: 'nom', choix });
    return `Réservation de *${session.medicament.nom}* chez *${choix.nom}*.\nQuel est ton prénom ?`;
  }

  if (session?.etape === 'nom') {
    sessions.delete(numero);
    try {
      const { code } = reserver(db, {
        pharmacie_id: session.choix.id,
        medicament_id: session.medicament.id,
        quantite: 1,
        client_nom: texte,
        client_tel: numero,
        canal: 'whatsapp',
      });
      return [
        `🎉 C'est réservé, ${texte} !`,
        `Code : *${code}*`,
        `${session.medicament.nom} · ${session.choix.nom} (${session.choix.adresse})`,
        `Montre ce code au comptoir. La pharmacie garde le produit jusqu'à la fermeture.`,
      ].join('\n');
    } catch (e) {
      if (e instanceof ErreurMetier) return `😔 ${e.message} Renvoie le nom du médicament pour voir les autres pharmacies.`;
      throw e;
    }
  }

  if (['urgence', 'urgences', 'sos', 'ndimbal', 'numero', 'numeros', 'samu', '1515'].includes(t)) {
    sessions.delete(numero);
    return NUMEROS_URGENCE;
  }
  if (['secours', 'premiers secours', 'gestes'].includes(t)) return MENU_SECOURS;

  // « hôpital kolda », « poste de santé kédougou », « santé ziguinchor »…
  if (/\b(hopital|lopitaan|poste|case|centre|sante|clinique|maternite|dispensaire)\b/.test(t)) {
    const ville = trouverVille(t);
    if (ville) return repondreStructuresProches(...VILLES[ville], `de ${ville}`);
    return '📍 Envoie ta *position* (📎 > Position) ou écris le nom de ta ville après « hôpital » (ex. _hôpital tambacounda_).';
  }

  // Message court qui parle d'un geste de secours : on envoie la fiche.
  if (t.split(' ').length <= 4) {
    const f = trouverFiche(t.replace(/^secours /, ''));
    if (f) return texteFiche(f);
  }

  return repondreRecherche(db, numero, texte);
}
