// Application d'urgence Dawa : SOS, santé proche, premiers secours, fiche médicale.
// Tout marche hors connexion sauf l'envoi des signalements.
import { t, tFr, changerLangue, langueActuelle } from './i18n.js';
import { FICHES, FICHE_PAR_URGENCE } from './secours.js';
import { echapper, toast } from './commun.js';
import { VILLES } from './villes.js';

const vue = document.getElementById('vue');

// --- Constantes -------------------------------------------------------------

const NUMEROS = [
  { n: '1515', cle: 'samu', icone: '🚑' },
  { n: '18', cle: 'pompiers', icone: '🚒' },
  { n: '17', cle: 'police', icone: '👮' },
];

const TYPES_URGENCE = [
  ['accouchement', '🤱'], ['accident', '🚗'], ['malaise', '😵'], ['saignement', '🩸'],
  ['morsure', '🐍'], ['brulure', '🔥'], ['enfant', '👶'], ['autre', '❗'],
];

// Les pompiers gèrent aussi les secours routiers et les incendies au Sénégal.
const NUMERO_PAR_URGENCE = { accident: '18', brulure: '18' };

const FILTRES = {
  tous: ['hopital', 'centre', 'maternite', 'poste', 'case', 'clinique'],
  urgence: ['hopital', 'centre', 'maternite'],
  poste: ['poste', 'case'],
  clinique: ['clinique', 'cabinet'],
  pharmacie: ['pharmacie'],
};
// Structures à prévenir pendant une alerte (pas les pharmacies ni les cabinets).
const TYPES_SOIN = ['hopital', 'centre', 'maternite', 'poste', 'case', 'clinique'];


// --- Stockage local (toujours protégé : mode privé, mémoire pleine…) ---------

function lire(cle, defaut, stockage = localStorage) {
  try { return JSON.parse(stockage.getItem(cle)) ?? defaut; } catch { return defaut; }
}
function ecrire(cle, valeur, stockage = localStorage) {
  try { stockage.setItem(cle, JSON.stringify(valeur)); return true; } catch { return false; }
}

const FICHE_VIDE = { nom: '', annee: '', groupe: '', allergies: '', maladies: [], traitements: '', notes: '', contacts: [] };
let fiche = { ...FICHE_VIDE, ...lire('dawa.fiche', {}) };

// --- Position ---------------------------------------------------------------

let position = lire('dawa.position', null); // { la, lo, precision, quand }
let villeChoisie = lire('dawa.ville', null);

function obtenirPosition() {
  return new Promise((resoudre) => {
    if (!navigator.geolocation) return resoudre(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        position = { la: p.coords.latitude, lo: p.coords.longitude, precision: Math.round(p.coords.accuracy), quand: Date.now() };
        ecrire('dawa.position', position);
        resoudre(position);
      },
      () => resoudre(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}

function origine() {
  if (position) return [position.la, position.lo];
  if (villeChoisie && VILLES[villeChoisie]) return VILLES[villeChoisie];
  return null;
}

function distanceKm([la1, lo1], [la2, lo2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const formatDistance = (km) => (km < 1 ? `${Math.round(km * 1000)} ${t('m')}` : `${km < 10 ? km.toFixed(1) : Math.round(km)} ${t('km')}`);

// --- Structures de santé (fichier mis en cache par le service worker) -------

let structures = null;
async function chargerStructures() {
  if (structures) return structures;
  try {
    const res = await fetch('/data/structures.json');
    structures = (await res.json()).structures;
  } catch {
    structures = [];
  }
  return structures;
}

function plusProches(types, nombre, { avecTel = false } = {}) {
  const o = origine();
  if (!o || !structures) return [];
  return structures
    .filter((s) => types.includes(s.t) && (!avecTel || s.tel))
    .map((s) => ({ ...s, km: distanceKm(o, [s.la, s.lo]) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, nombre);
}

const nomStructure = (s) => s.n || `${t(`ty_${s.t}`)} (${t('sans_nom')})`;
const lienItineraire = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.la},${s.lo}`;
const lienTel = (n) => `tel:${String(n).replace(/[^\d+]/g, '')}`;

function lienSms(numeros, texte) {
  const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?';
  return `sms:${numeros.map((n) => n.replace(/[^\d+]/g, '')).join(',')}${sep}body=${encodeURIComponent(texte)}`;
}

// --- Message d'alerte ---------------------------------------------------------

function resumeMedical() {
  const morceaux = [];
  if (fiche.groupe) morceaux.push(`Groupe ${fiche.groupe}`);
  if (fiche.allergies) morceaux.push(`Allergies : ${fiche.allergies}`);
  if (fiche.maladies.length) morceaux.push(fiche.maladies.map((m) => tFr(`m_${m}`)).join(', '));
  if (fiche.traitements) morceaux.push(`Traitement : ${fiche.traitements}`);
  return morceaux.join('. ');
}

function texteAlerte(alerte) {
  const lignes = [tFr('sms_texte', { type: tFr(`t_${alerte.type}`), nom: fiche.nom || 'Une personne' })];
  const p = alerte.position;
  lignes.push(p
    ? tFr('sms_position', { lien: `https://maps.google.com/?q=${p.la.toFixed(5)},${p.lo.toFixed(5)}`, m: p.precision })
      + (p.ancienne ? ' (dernière position connue)' : '')
    : tFr('sms_sans_position'));
  const med = resumeMedical();
  if (med) lignes.push(med);
  lignes.push(tFr('sms_fin'));
  return lignes.join('\n');
}

// --- Écran SOS -----------------------------------------------------------------
// L'alerte en cours est gardée en sessionStorage : elle survit au passage par l'appli Téléphone.

let etapeSos = lire('dawa.alerte', null, sessionStorage) ? 'alerte' : 'accueil';
let alerte = lire('dawa.alerte', null, sessionStorage);
let minuteurCompte = null;

function vueSos() {
  if (etapeSos === 'types') return vueTypes();
  if (etapeSos === 'compte') return vueCompte();
  if (etapeSos === 'alerte' && alerte) return vueAlerte();
  return `
    <section class="sos-accueil">
      <h1>${t('sos_titre')}</h1>
      <p class="sous-titre" style="margin:0 auto;max-width:34ch">${t('sos_aide')}</p>
      <button class="bouton-sos" data-action="sos" aria-label="SOS">${t('sos_bouton')}</button>
      <div class="titre-section">${t('numeros')}</div>
      ${blocNumeros()}
    </section>`;
}

const blocNumeros = () => `<div class="numeros">${NUMEROS.map((x) => `
  <a class="numero" href="${lienTel(x.n)}"><span>${x.icone}</span><b>${x.n}</b><small>${t(x.cle)}</small></a>`).join('')}</div>`;

function vueTypes() {
  return `
    <button class="bouton petit secondaire" data-action="sos-retour">← ${t('retour')}</button>
    <h1 style="margin-top:14px">${t('quel_type')}</h1>
    <div class="types">${TYPES_URGENCE.map(([type, icone]) => `
      <button class="type-urgence" data-action="choisir-type" data-type="${type}"><span>${icone}</span>${t(`t_${type}`)}</button>`).join('')}
    </div>
    <div class="titre-section">${t('numeros')}</div>
    ${blocNumeros()}`;
}

function vueCompte() {
  return `
    <section class="compte">
      <h1>${t(`t_${alerte.type}`)}</h1>
      <p style="margin:0">${t('envoi_dans')}</p>
      <div class="chiffre" id="chiffre">${alerte.compte}</div>
      <button class="bouton enorme secondaire" data-action="annuler-alerte">${t('annuler')}</button>
    </section>`;
}

function etatPosition() {
  if (alerte.positionStatut === 'attente') return `<div class="etat-position">📡 ${t('position_cherche')}</div>`;
  if (alerte.position) {
    // GPS en échec : on a repris la dernière position connue, il faut le dire.
    if (alerte.position.ancienne) {
      const min = Math.max(1, Math.round((Date.now() - alerte.position.quand) / 60000));
      return `<div class="etat-position ko">📍 ${t('position_ancienne', { min })}
        <button class="bouton petit secondaire" data-action="reessayer-position" style="margin-left:auto">${t('reessayer')}</button></div>`;
    }
    return `<div class="etat-position ok">📍 ${t('position_ok', { m: alerte.position.precision })}</div>`;
  }
  return `<div class="etat-position ko">⚠️ ${t('position_ko')}
    <button class="bouton petit secondaire" data-action="reessayer-position" style="margin-left:auto">${t('reessayer')}</button></div>`;
}

function vueAlerte() {
  const principal = NUMERO_PAR_URGENCE[alerte.type] || '1515';
  const autres = NUMEROS.filter((x) => x.n !== principal);
  const infoPrincipal = NUMEROS.find((x) => x.n === principal);
  const texte = texteAlerte(alerte);
  const contacts = fiche.contacts.filter((c) => c.tel);
  // Une structure joignable à plus de 50 km n'aide pas : on montre alors seulement la plus proche.
  const soin = plusProches(TYPES_SOIN, 1, { avecTel: true }).find((s) => s.km <= 50);
  const plusProche = plusProches(TYPES_SOIN, 1)[0];
  const ficheGeste = FICHES.find((f) => f.id === FICHE_PAR_URGENCE[alerte.type]);

  return `
    <h1>🚨 ${t('alerte_titre')} : ${t(`t_${alerte.type}`)}</h1>
    ${etatPosition()}

    <section class="carte etape">
      <h2><span class="num">1</span>${t('etape_appeler')}</h2>
      <a class="bouton enorme sos" href="${lienTel(principal)}">${infoPrincipal.icone} ${t(infoPrincipal.cle)} : ${principal}</a>
      <div class="ligne-boutons">${autres.map((x) => `<a class="bouton secondaire" href="${lienTel(x.n)}">${x.icone} ${t(x.cle)} ${x.n}</a>`).join('')}</div>
      <p class="aide-petite">${t('appel_gratuit')}</p>
      ${blocPositionADire(plusProche)}
    </section>

    <section class="carte etape">
      <h2><span class="num">2</span>${t('etape_proches')}</h2>
      ${contacts.length ? `
        <a class="bouton enorme" href="${echapper(lienSms(contacts.map((c) => c.tel), texte))}">💬 ${t('envoyer_tous')} (${contacts.length})</a>
        <div class="contacts-alerte">${contacts.map((c) => `
          <div class="contact-alerte">
            <a class="bouton petit secondaire" href="${echapper(lienSms([c.tel], texte))}">💬 ${echapper(c.nom || c.tel)}</a>
            <a class="bouton petit secondaire" href="${lienTel(c.tel)}" aria-label="${t('appeler')} ${echapper(c.nom)}">📞 ${t('appeler')}</a>
          </div>`).join('')}</div>
        <p class="aide-petite">${t('sms_appuie')}</p>`
      : `<p style="margin:0">${t('aucun_proche')}</p><a class="bouton secondaire" href="#fiche">${t('ajouter_proches')}</a>`}
    </section>

    <section class="carte etape">
      <h2><span class="num">3</span>${t('etape_poste')}</h2>
      ${alerte.positionStatut === 'attente' || !structures ? '<p class="aide-petite">…</p>'
        : !origine() || !plusProche ? `<p class="aide-petite">${t('position_ko')}</p><a class="bouton secondaire" href="#proche">🏥 ${t('nav_proche')}</a>`
        // La plus proche d'abord, même sans numéro : c'est là qu'on ira.
        : `<p class="sous-etape">📍 ${t('la_plus_proche')}</p>${carteStructureAlerte(plusProche, texte)}
          ${plusProche.tel ? '' : soin
            ? `<p class="sous-etape">📞 ${t('la_plus_proche_joignable')}</p>${carteStructureAlerte(soin, texte)}`
            : `<p class="aide-petite">${t('aucune_structure_joignable')}</p>`}`}
    </section>

    ${ficheGeste ? `
      <a class="carte etape" href="#secours/${ficheGeste.id}" style="text-decoration:none;color:inherit">
        <h2><span style="font-size:1.4rem">${ficheGeste.icone}</span>${t('gestes')} : ${echapper(ficheGeste.titre[langueActuelle()] || ficheGeste.titre.fr)} →</h2>
      </a>` : ''}

    ${blocFicheSecours()}

    <button class="bouton enorme secondaire" data-action="fin-alerte" style="margin-top:20px">${t('fin_urgence')}</button>`;
}

function carteStructureAlerte(s, texte) {
  return `
    <div class="structure-alerte">
      <div><b>${echapper(nomStructure(s))}</b> <span class="pastille">${t(`ty_${s.t}`)}</span><br>
        <span class="aide-petite">${formatDistance(s.km)}${s.v ? ` · ${echapper(s.v)}` : ''}${s.tel ? ` · ${echapper(s.tel)}` : ` · ${t('pas_de_numero')}`}</span></div>
      <div class="ligne-boutons">
        ${s.tel ? `<a class="bouton" href="${lienTel(s.tel)}">📞 ${t('appeler')}</a>
        <a class="bouton secondaire" href="${echapper(lienSms([s.tel], texte))}">💬 ${t('sms')}</a>` : ''}
        <a class="bouton ${s.tel ? 'secondaire' : ''}" href="${lienItineraire(s)}" target="_blank" rel="noopener">🧭 ${t('itineraire')}</a>
      </div>
    </div>`;
}

// Sans crédit ni internet, l'appel au 1515 reste possible : il faut alors pouvoir dire où on est.
function blocPositionADire(plusProche) {
  const p = alerte.position;
  if (!p) return '';
  const repere = plusProche && plusProche.km <= 3 ? t('pres_de', { lieu: nomStructure(plusProche) }) : '';
  const zone = plusProche?.r ? `${t('zone_de', { ville: plusProche.r })}` : '';
  return `
    <div class="position-a-dire">
      <div class="aide-petite">🗣️ ${t('dire_position')}</div>
      ${repere || zone ? `<div><b>${echapper([repere, zone].filter(Boolean).join(', '))}</b></div>` : ''}
      <div class="coords">${p.la.toFixed(5)}, ${p.lo.toFixed(5)}</div>
    </div>`;
}

function blocFicheSecours() {
  const lignes = [
    [t('nom'), fiche.nom],
    [t('annee'), fiche.annee],
    [t('groupe'), fiche.groupe],
    [t('allergies'), fiche.allergies],
    [t('maladies'), fiche.maladies.map((m) => t(`m_${m}`)).join(', ')],
    [t('traitements'), fiche.traitements],
    [t('notes'), fiche.notes],
  ].filter(([, v]) => v);
  if (!lignes.length) return '';
  return `
    <section class="carte fiche-secours" style="margin-top:14px">
      <h2>🩺 ${t('ma_fiche_secours')}</h2>
      <dl>${lignes.map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`).join('')}</dl>
    </section>`;
}

async function lancerAlerte(type) {
  alerte = { type, compte: 5, position: null, positionStatut: 'attente', debut: Date.now() };
  etapeSos = 'compte';
  rendre();
  // On cherche la position pendant le compte à rebours pour gagner du temps.
  const p = obtenirPosition();
  chargerStructures();
  minuteurCompte = setInterval(() => {
    alerte.compte -= 1;
    const el = document.getElementById('chiffre');
    if (el) el.textContent = alerte.compte;
    if (alerte.compte <= 0) {
      clearInterval(minuteurCompte);
      etapeSos = 'alerte';
      ecrire('dawa.alerte', alerte, sessionStorage);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      rendre();
    }
  }, 1000);
  const trouvee = await p;
  if (!alerte) return;
  // Sans GPS, on se rabat sur la dernière position connue.
  alerte.position = trouvee || (position ? { ...position, ancienne: true } : null);
  alerte.positionStatut = alerte.position ? 'ok' : 'ko';
  if (etapeSos === 'alerte') ecrire('dawa.alerte', alerte, sessionStorage);
  await chargerStructures();
  if (etapeSos === 'alerte' && location.hash.startsWith('#sos')) rendre();
}

function terminerAlerte() {
  clearInterval(minuteurCompte);
  alerte = null;
  etapeSos = 'accueil';
  try { sessionStorage.removeItem('dawa.alerte'); } catch {}
  rendre();
}

// --- Santé proche ------------------------------------------------------------

// Par défaut tous les lieux de soins : en urgence, le plus proche compte plus que le type.
let filtreProche = 'tous';
let rechercheProcheEnCours = false;

function vueProche() {
  const o = origine();
  const liste = o ? plusProches(FILTRES[filtreProche], 25) : [];
  const libelleFiltre = { tous: 'f_tous', urgence: 'f_urgence', poste: 'f_poste', clinique: 'f_clinique', pharmacie: 'f_pharmacie' };
  return `
    <h1>${t('proche_titre')}</h1>
    <p class="sous-titre">${t('proche_aide')}</p>
    <div class="carte position-choix">
      <button class="bouton" data-action="ma-position" ${rechercheProcheEnCours ? 'disabled' : ''}>
        📍 ${rechercheProcheEnCours ? t('position_cherche') : t('ma_position')}</button>
      <div>
        <label for="ville">${t('ou_choisir')}</label>
        <select id="ville" data-action="ville">
          <option value="">—</option>
          ${Object.keys(VILLES).map((v) => `<option ${!position && villeChoisie === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      ${position ? `<p class="aide-petite" style="grid-column:1/-1">${t('position_ok', { m: position.precision })}</p>` : ''}
    </div>
    <div class="filtres" role="group">${Object.keys(FILTRES).map((f) => `
      <button data-action="filtre" data-filtre="${f}" aria-pressed="${f === filtreProche}">${t(libelleFiltre[f])}</button>`).join('')}
    </div>
    ${filtreProche === 'pharmacie' ? `<a class="carte" href="/pharmacies" style="display:block;margin-bottom:10px;text-decoration:none">💊 ${t('pharmacies_garde')} →</a>` : ''}
    <div class="liste-pharmas">${!o ? '' : !structures ? '<p class="vide">…</p>' : liste.map((s) => `
      <article class="carte structure">
        <div class="structure-tete">
          <div>
            <div class="structure-nom">${echapper(nomStructure(s))}</div>
            <div class="pharma-meta"><span class="pastille">${t(`ty_${s.t}`)}</span>${s.v ? `<span>${echapper(s.v)}</span>` : ''}${s.tel ? `<span>${echapper(s.tel)}</span>` : ''}${s.ok ? `<span class="pastille verte">✔ ${t('verifie')}</span>` : ''}</div>
          </div>
          <div class="structure-dist">${formatDistance(s.km)}</div>
        </div>
        <div class="ligne-boutons">
          ${s.tel ? `<a class="bouton petit" href="${lienTel(s.tel)}">📞 ${t('appeler')}</a>`
            : `<button class="bouton petit secondaire" data-action="proposer-numero" data-id="${s.id}">➕ ${t('ajouter_numero')}</button>`}
          <a class="bouton petit secondaire" href="${lienItineraire(s)}" target="_blank" rel="noopener">🧭 ${t('itineraire')}</a>
        </div>
        <button class="lien-discret" data-action="signaler" data-id="${s.id}">${t('signaler')}</button>
      </article>`).join('')}
    </div>
    <p class="aide-petite" style="margin-top:16px;text-align:center">${t('source_osm')}</p>`;
}

// Le numéro proposé n'apparaît qu'après vérification par l'équipe (appel à la structure).
async function proposerNumero(id) {
  const s = structures?.find((x) => x.id === id);
  const tel = window.prompt(t('numero_question', { nom: s ? nomStructure(s) : '' }));
  if (!tel || !tel.trim()) return;
  try {
    const res = await fetch('/api/numeros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structure_id: id, tel }),
    });
    const r = await res.json().catch(() => ({}));
    toast(res.ok ? t('numero_merci') : r.erreur || t('hors_ligne'));
  } catch {
    toast(t('hors_ligne'));
  }
}

async function signaler(id) {
  const s = structures?.find((x) => x.id === id);
  const message = window.prompt(t('signale_question'));
  if (!message || !message.trim()) return;
  try {
    const res = await fetch('/api/signalements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structure_id: id, nom: s ? nomStructure(s) : '', message }),
    });
    if (!res.ok) throw new Error();
    toast(t('signale_merci'));
  } catch {
    toast(t('hors_ligne'));
  }
}

// --- Premiers secours ----------------------------------------------------------

function vueSecours() {
  const l = langueActuelle();
  return `
    <h1>${t('secours_titre')}</h1>
    <p class="sous-titre">${t('secours_aide')}</p>
    <p class="avertissement">⚠️ ${t('a_valider')}</p>
    <div class="liste-fiches">${FICHES.map((f) => `
      <a class="carte-fiche" href="#secours/${f.id}"><span>${f.icone}</span>${echapper(f.titre[l] || f.titre.fr)}</a>`).join('')}
    </div>`;
}

function vueFicheSecours(id) {
  const f = FICHES.find((x) => x.id === id);
  if (!f) return vueSecours();
  const l = langueActuelle();
  const info = NUMEROS.find((x) => x.n === f.numero);
  return `
    <a class="bouton petit secondaire" href="#secours">← ${t('retour')}</a>
    <h1 style="margin-top:14px">${f.icone} ${echapper(f.titre[l] || f.titre.fr)}</h1>
    <a class="bouton enorme sos" href="${lienTel(f.numero)}">${info.icone} ${t('appelle_dabord', { n: f.numero })}</a>
    <div class="ligne-boutons" style="margin-top:10px">
      <button class="bouton secondaire" data-action="ecouter" data-id="${f.id}">🔊 ${t('ecouter')}</button>
    </div>
    ${l === 'wo' ? `<p class="aide-petite" style="margin-top:8px">${t('audio_wolof_bientot')}</p>` : ''}
    <section class="carte bloc"><h2>✅ ${t('a_faire')}</h2><ol class="etapes">${f.faire.map((x) => `<li><span>${echapper(x)}</span></li>`).join('')}</ol></section>
    <section class="carte bloc"><h2>🚫 ${t('a_eviter')}</h2><ul class="liste-eviter">${f.eviter.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul></section>
    ${f.danger ? `<section class="carte bloc"><h2>⚠️ ${t('danger')}</h2><ul class="liste-danger">${f.danger.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul></section>` : ''}
    <p class="avertissement" style="margin-top:16px">⚠️ ${t('a_valider')}</p>`;
}

let lectureEnCours = null;
function ecouter(id, bouton) {
  const f = FICHES.find((x) => x.id === id);
  if (lectureEnCours) {
    lectureEnCours.stop();
    return;
  }
  const finir = () => { lectureEnCours = null; bouton.textContent = `🔊 ${t('ecouter')}`; };
  const lireTexteFrancais = () => {
    if (!('speechSynthesis' in window)) return finir();
    const texte = [f.titre.fr, ...f.faire, t('a_eviter'), ...f.eviter, ...(f.danger || [])].join('. ');
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR';
    u.rate = 0.95;
    u.onend = finir;
    u.onerror = finir;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    lectureEnCours = { stop: () => { speechSynthesis.cancel(); finir(); } };
  };
  bouton.textContent = `⏹ ${t('arreter')}`;
  // Un enregistrement en wolof, s'il a été déposé dans /audio, passe en priorité.
  if (langueActuelle() === 'wo') {
    const audio = new Audio(`/audio/${id}-wo.mp3`);
    audio.onended = finir;
    audio.onerror = lireTexteFrancais;
    audio.play().catch(lireTexteFrancais);
    lectureEnCours = { stop: () => { audio.pause(); finir(); } };
  } else {
    lireTexteFrancais();
  }
}

// --- Ma fiche médicale ---------------------------------------------------------

const MALADIES = ['diabete', 'hypertension', 'drepanocytose', 'asthme', 'epilepsie', 'cardiaque', 'grossesse', 'vih'];
const GROUPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function vueMaFiche() {
  const contacts = fiche.contacts.length ? fiche.contacts : [{ nom: '', tel: '' }];
  return `
    <h1>${t('fiche_titre')}</h1>
    <p class="note-confidentialite">🔒 ${t('fiche_aide')}</p>
    <form id="form-fiche" class="formulaire">
      <div class="carte formulaire">
        <div><label for="f-nom">${t('nom')}</label><input id="f-nom" name="nom" value="${echapper(fiche.nom)}" maxlength="60" autocomplete="name"></div>
        <div class="ligne">
          <div><label for="f-annee">${t('annee')}</label><input id="f-annee" name="annee" inputmode="numeric" maxlength="4" value="${echapper(fiche.annee)}"></div>
          <div><label for="f-groupe">${t('groupe')}</label>
            <select id="f-groupe" name="groupe"><option value="">${t('inconnu')}</option>
              ${GROUPES.map((g) => `<option ${fiche.groupe === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        </div>
        <div><label for="f-allergies">${t('allergies')}</label><input id="f-allergies" name="allergies" placeholder="${t('allergies_ex')}" value="${echapper(fiche.allergies)}" maxlength="120"></div>
        <div><label>${t('maladies')}</label><div class="cases">${MALADIES.map((m) => `
          <label><input type="checkbox" name="maladies" value="${m}" ${fiche.maladies.includes(m) ? 'checked' : ''}> ${t(`m_${m}`)}</label>`).join('')}</div></div>
        <div><label for="f-traitements">${t('traitements')}</label><input id="f-traitements" name="traitements" value="${echapper(fiche.traitements)}" maxlength="120"></div>
        <div><label for="f-notes">${t('notes')}</label><textarea id="f-notes" name="notes" maxlength="300">${echapper(fiche.notes)}</textarea></div>
      </div>
      <div class="carte formulaire">
        <h2 style="margin:0">📇 ${t('contacts')}</h2>
        <div id="contacts" class="formulaire">${contacts.map(ligneContact).join('')}</div>
        <button type="button" class="bouton petit secondaire" data-action="ajouter-contact" style="justify-self:start">+ ${t('ajouter')}</button>
      </div>
      <button class="bouton enorme" type="submit">${t('enregistrer')}</button>
    </form>`;
}

const ligneContact = (c) => `
  <div class="contact-ligne">
    <div class="champ-nom"><label>${t('contact_nom')}</label><input name="c-nom" value="${echapper(c.nom)}" maxlength="40"></div>
    <div><label>${t('contact_tel')}</label><input name="c-tel" value="${echapper(c.tel)}" inputmode="tel" placeholder="77 123 45 67" maxlength="20"></div>
    <button type="button" class="bouton petit danger" data-action="retirer-contact" aria-label="${t('retirer')}">✕</button>
  </div>`;

// « 77 123 45 67 » devient « +221771234567 » pour que le SMS parte même depuis l'étranger.
function normaliserTel(brut) {
  const n = String(brut).replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (/^[1-9]\d{8}$/.test(n)) return `+221${n}`;
  return n;
}

function enregistrerFiche(form) {
  const d = new FormData(form);
  const noms = d.getAll('c-nom');
  const tels = d.getAll('c-tel');
  fiche = {
    nom: String(d.get('nom') || '').trim(),
    annee: String(d.get('annee') || '').replace(/\D/g, ''),
    groupe: String(d.get('groupe') || ''),
    allergies: String(d.get('allergies') || '').trim(),
    maladies: d.getAll('maladies').map(String),
    traitements: String(d.get('traitements') || '').trim(),
    notes: String(d.get('notes') || '').trim(),
    contacts: tels.map((tel, i) => ({ nom: String(noms[i] || '').trim(), tel: normaliserTel(tel) }))
      .filter((c) => c.tel.replace(/\D/g, '').length >= 9)
      .slice(0, 6),
  };
  toast(ecrire('dawa.fiche', fiche) ? t('enregistre') : t('stockage_ko'));
  rendre();
}

// --- Routeur et navigation -----------------------------------------------------

const ONGLETS = [
  ['sos', '🆘', 'nav_sos'],
  ['proche', '🏥', 'nav_proche'],
  ['secours', '🩹', 'nav_secours'],
  ['fiche', '🪪', 'nav_fiche'],
];

function rendre() {
  const [onglet, param] = (location.hash.slice(1) || 'sos').split('/');
  document.getElementById('barre-nav').innerHTML = ONGLETS.map(([id, icone, cle]) => `
    <a href="#${id}" class="${id === 'sos' ? 'nav-sos' : ''}" ${id === onglet ? 'aria-current="page"' : ''}><span>${icone}</span><span>${t(cle)}</span></a>`).join('');
  document.querySelectorAll('[data-langue]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.langue === langueActuelle()));

  if (onglet === 'proche') {
    vue.innerHTML = vueProche();
    if (!structures) chargerStructures().then(() => location.hash.startsWith('#proche') && rendre());
  } else if (onglet === 'secours') {
    vue.innerHTML = param ? vueFicheSecours(param) : vueSecours();
  } else if (onglet === 'fiche') {
    vue.innerHTML = vueMaFiche();
  } else {
    vue.innerHTML = vueSos();
  }
}

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  if (lectureEnCours) lectureEnCours.stop();
  rendre();
});

vue.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT') return;
  const action = el.dataset.action;
  if (action === 'sos') { etapeSos = 'types'; rendre(); }
  else if (action === 'sos-retour') { etapeSos = 'accueil'; rendre(); }
  else if (action === 'choisir-type') lancerAlerte(el.dataset.type);
  else if (action === 'annuler-alerte' || action === 'fin-alerte') terminerAlerte();
  else if (action === 'reessayer-position') {
    alerte.positionStatut = 'attente';
    rendre();
    obtenirPosition().then((p) => {
      if (!alerte) return;
      alerte.position = p || (alerte.position && { ...alerte.position, ancienne: true });
      alerte.positionStatut = alerte.position ? 'ok' : 'ko';
      ecrire('dawa.alerte', alerte, sessionStorage);
      rendre();
    });
  } else if (action === 'ma-position') {
    rechercheProcheEnCours = true;
    rendre();
    Promise.all([obtenirPosition(), chargerStructures()]).then(([p]) => {
      rechercheProcheEnCours = false;
      if (!p) toast(t('position_ko'));
      rendre();
    });
  } else if (action === 'filtre') { filtreProche = el.dataset.filtre; rendre(); }
  else if (action === 'signaler') signaler(el.dataset.id);
  else if (action === 'proposer-numero') proposerNumero(el.dataset.id);
  else if (action === 'ecouter') ecouter(el.dataset.id, el);
  else if (action === 'ajouter-contact') document.getElementById('contacts').insertAdjacentHTML('beforeend', ligneContact({ nom: '', tel: '' }));
  else if (action === 'retirer-contact') el.closest('.contact-ligne').remove();
});

vue.addEventListener('change', (e) => {
  if (e.target.id === 'ville') {
    villeChoisie = e.target.value || null;
    // Choisir une ville remplace la position GPS pour la recherche.
    position = null;
    try { localStorage.removeItem('dawa.position'); } catch {}
    ecrire('dawa.ville', villeChoisie);
    chargerStructures().then(rendre);
  }
});

vue.addEventListener('submit', (e) => {
  if (e.target.id === 'form-fiche') {
    e.preventDefault();
    enregistrerFiche(e.target);
  }
});

document.querySelectorAll('[data-langue]').forEach((b) => b.addEventListener('click', () => {
  changerLangue(b.dataset.langue);
  rendre();
  majHorsLigne();
}));

// --- Hors ligne et installation ------------------------------------------------

const bandeau = document.getElementById('bandeau-hors-ligne');
function majHorsLigne() {
  bandeau.textContent = t('hors_ligne');
  bandeau.classList.toggle('cache', navigator.onLine);
}
window.addEventListener('online', majHorsLigne);
window.addEventListener('offline', majHorsLigne);

let invitationInstall = null;
const boutonInstaller = document.getElementById('installer');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  invitationInstall = e;
  boutonInstaller.textContent = `⬇ ${t('installer')}`;
  boutonInstaller.classList.remove('cache');
});
boutonInstaller.addEventListener('click', async () => {
  if (!invitationInstall) return;
  invitationInstall.prompt();
  await invitationInstall.userChoice;
  invitationInstall = null;
  boutonInstaller.classList.add('cache');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

changerLangue(langueActuelle());
majHorsLigne();
rendre();
// On charge les structures dès l'ouverture : en cas d'alerte, elles sont déjà prêtes.
chargerStructures().then(() => { if (alerte || location.hash.startsWith('#proche')) rendre(); });
