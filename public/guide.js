// Guidage hors ligne vers une structure de santé : flèche + distance à vol d'oiseau.
// N'utilise que le GPS et la boussole du téléphone : aucune connexion internet nécessaire.
import { t } from './i18n.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distanceM(la1, lo1, la2, lo2) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

// Cap à suivre, en degrés depuis le nord (0 = nord, 90 = est).
export function cap(la1, lo1, la2, lo2) {
  const y = Math.sin(rad(lo2 - lo1)) * Math.cos(rad(la2));
  const x = Math.cos(rad(la1)) * Math.sin(rad(la2)) - Math.sin(rad(la1)) * Math.cos(rad(la2)) * Math.cos(rad(lo2 - lo1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = ['n', 'ne', 'e', 'se', 's', 'so', 'o', 'no'];
export const pointCardinal = (c) => t(`dir_${POINTS[Math.round(c / 45) % 8]}`);

const formatM = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

export function vueGuide(s, nom, liens) {
  return `
    <button class="bouton petit secondaire" data-action="guide-retour">← ${t('retour')}</button>
    <h1 style="margin:14px 0 2px">${nom}</h1>
    <p class="sous-titre" style="margin:0 0 6px">${t(`ty_${s.t}`)}${s.v ? ` · ${s.v}` : ''}</p>
    <section class="guide">
      <div class="boussole" id="boussole">
        <div class="rose" id="rose">
          <span class="cardinal n">N</span><span class="cardinal e">${t('dir_court_e')}</span>
          <span class="cardinal s">S</span><span class="cardinal o">${t('dir_court_o')}</span>
        </div>
        <svg class="fleche" id="fleche" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M50 8 L72 52 L56 46 L56 88 L44 88 L44 46 L28 52 Z" />
        </svg>
      </div>
      <div class="guide-distance" id="guide-distance">…</div>
      <div class="guide-direction" id="guide-direction">${t('gps_attente')}</div>
      <div class="guide-etat" id="guide-etat"></div>
      <button class="bouton secondaire cache" id="activer-boussole" data-action="activer-boussole">🧭 ${t('activer_boussole')}</button>
      <p class="aide-petite">${t('guide_aide')}</p>
    </section>
    <div class="ligne-boutons" style="margin-top:12px">
      ${s.tel ? `<a class="bouton" href="${liens.tel}">📞 ${t('appeler')}</a>` : ''}
      <a class="bouton secondaire" href="${liens.itineraire}" target="_blank" rel="noopener">🗺️ ${t('itineraire_internet')}</a>
    </div>`;
}

// --- Capteurs ----------------------------------------------------------------

let suivi = null;
let cible = null;
let dernierePosition = null;
let orientation = null; // cap du téléphone (0 = il pointe vers le nord), null si pas de boussole
let rotationAffichee = 0;
let roseAffichee = 0;
let minuteurBouton = null;

function surOrientation(e) {
  let c = null;
  if (typeof e.webkitCompassHeading === 'number') c = e.webkitCompassHeading; // iPhone
  else if (e.absolute && typeof e.alpha === 'number') c = 360 - e.alpha; // Android (orientation absolue)
  if (c == null) return;
  // Téléphone tourné en paysage : on corrige de l'angle de l'écran.
  c += screen.orientation?.angle || 0;
  orientation = (c + 360) % 360;
  document.getElementById('activer-boussole')?.classList.add('cache');
  majAffichage();
}

// Rotation la plus courte (évite le tour complet de 359° à 1°).
function tournerVers(actuel, voulu) {
  const delta = ((voulu - actuel) % 360 + 540) % 360 - 180;
  return actuel + delta;
}

function majAffichage() {
  const fleche = document.getElementById('fleche');
  if (!fleche || !cible) return;
  const rose = document.getElementById('rose');
  const etat = document.getElementById('guide-etat');

  if (!dernierePosition) return;
  const { la, lo, precision } = dernierePosition;
  const d = distanceM(la, lo, cible.la, cible.lo);
  const c = cap(la, lo, cible.la, cible.lo);

  document.getElementById('guide-distance').textContent = d < 40 ? `✅ ${t('arrive')}` : formatM(d);
  document.getElementById('guide-direction').textContent = d < 40 ? '' : `${t('vers')} ${pointCardinal(c)} · ${t('vol_oiseau')}`;

  // Avec boussole, la flèche montre la direction réelle ; sans, elle est relative au nord (la rose reste fixe).
  const angleFleche = orientation == null ? c : c - orientation;
  const angleRose = orientation == null ? 0 : -orientation;
  rotationAffichee = tournerVers(rotationAffichee, angleFleche);
  roseAffichee = tournerVers(roseAffichee, angleRose);
  fleche.style.transform = `rotate(${rotationAffichee}deg)`;
  rose.style.transform = `rotate(${roseAffichee}deg)`;

  etat.textContent = [
    orientation == null ? t('boussole_absente') : t('boussole_active'),
    precision > 100 ? t('gps_imprecis', { m: precision }) : '',
  ].filter(Boolean).join(' · ');
}

export function demarrerGuide(s, positionConnue) {
  arreterGuide();
  cible = s;
  dernierePosition = positionConnue || null;
  rotationAffichee = 0;
  roseAffichee = 0;
  if (navigator.geolocation) {
    suivi = navigator.geolocation.watchPosition(
      (p) => {
        dernierePosition = { la: p.coords.latitude, lo: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        majAffichage();
      },
      () => {
        if (!dernierePosition) document.getElementById('guide-direction').textContent = t('position_ko');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  }
  window.addEventListener('deviceorientationabsolute', surOrientation);
  window.addEventListener('deviceorientation', surOrientation);
  // iPhone (et certains Chrome) : la boussole n'envoie rien sans autorisation, donnée par un appui.
  // On ne montre le bouton que si aucune mesure n'arrive toute seule.
  clearTimeout(minuteurBouton);
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    minuteurBouton = setTimeout(() => {
      if (orientation == null) document.getElementById('activer-boussole')?.classList.remove('cache');
    }, 1500);
  }
  majAffichage();
}

export async function activerBoussole() {
  try {
    // Les écouteurs sont déjà en place : l'autorisation suffit pour que les mesures arrivent.
    if ((await DeviceOrientationEvent.requestPermission()) === 'granted') {
      document.getElementById('activer-boussole')?.classList.add('cache');
    }
  } catch {}
}

export function arreterGuide() {
  if (suivi != null) navigator.geolocation.clearWatch(suivi);
  suivi = null;
  cible = null;
  orientation = null;
  clearTimeout(minuteurBouton);
  window.removeEventListener('deviceorientationabsolute', surOrientation);
  window.removeEventListener('deviceorientation', surOrientation);
}
