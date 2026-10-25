// Illustrations des urgences, dessinées en SVG : légères, nettes à toutes les tailles et disponibles hors ligne.
const PEAU = '#8d5524';

const svg = (fond, contenu) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="32" fill="${fond}"/>${contenu}</svg>`;

const DESSINS = {
  // Mère qui tient son bébé
  accouchement: svg('#fde2e4', `
    <path d="M18 27 Q26 21 34 27 L41 55 H13 Z" fill="#c2185b"/>
    <path d="M19 12 Q26 4 33 12 Q33 9 26 8 Q19 9 19 12Z" fill="#6a1b9a"/>
    <circle cx="26" cy="16" r="6" fill="${PEAU}"/>
    <ellipse cx="34" cy="35" rx="10" ry="6.5" fill="#fff"/>
    <circle cx="40" cy="32" r="4.5" fill="${PEAU}"/>
    <path d="M20 32 Q28 44 40 38" stroke="${PEAU}" stroke-width="4" fill="none" stroke-linecap="round"/>`),

  // Voiture accidentée
  accident: svg('#fff3e0', `
    <g transform="rotate(-8 30 38)">
      <path d="M16 31 L21 22 H35 L41 31 Z" fill="#e53935"/>
      <path d="M22 30 L25 24.5 H29 V30 Z M31 30 V24.5 H34 L37 30 Z" fill="#bbdefb"/>
      <rect x="9" y="30" width="38" height="12" rx="4" fill="#e53935"/>
      <circle cx="18" cy="43" r="5" fill="#263238"/><circle cx="18" cy="43" r="2" fill="#90a4ae"/>
      <circle cx="38" cy="43" r="5" fill="#263238"/><circle cx="38" cy="43" r="2" fill="#90a4ae"/>
      <rect x="43" y="33" width="4" height="3" rx="1" fill="#ffe082"/>
    </g>
    <path d="M52 18 L54 24 L60 23 L56 28 L60 33 L54 32 L52 38 L49 32 L43 33 L47 28 L43 23 L49 24 Z" fill="#ffb300"/>`),

  // Personne allongée, étourdie
  malaise: svg('#e3f2fd', `
    <rect x="8" y="47" width="48" height="3" rx="1.5" fill="#90caf9"/>
    <rect x="22" y="38" width="30" height="9" rx="4.5" fill="#1e88e5"/>
    <circle cx="16" cy="41" r="6" fill="${PEAU}"/>
    <path d="M11 26 l1.6 3.4 3.6.4-2.7 2.4.8 3.6-3.3-1.9-3.2 1.9.8-3.6-2.7-2.4 3.6-.4Z" fill="#ffb300"/>
    <path d="M24 20 l1.2 2.6 2.8.3-2.1 1.8.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.8 2.8-.3Z" fill="#ffb300"/>
    <path d="M32 26 q4-6 8 0 q-4 4-6 0" stroke="#1565c0" stroke-width="2" fill="none" stroke-linecap="round"/>`),

  // Goutte de sang et pansement
  saignement: svg('#ffebee', `
    <path d="M30 9 C30 9 14 29 14 39 a16 16 0 0 0 32 0 C46 29 30 9 30 9Z" fill="#d32f2f"/>
    <ellipse cx="23" cy="37" rx="3" ry="6" fill="#fff" opacity=".45"/>
    <g transform="rotate(-35 44 46)">
      <rect x="32" y="41" width="24" height="10" rx="5" fill="#ffcc80"/>
      <rect x="40" y="41" width="8" height="10" fill="#ffe0b2"/>
    </g>`),

  // Serpent dressé
  morsure: svg('#e8f5e9', `
    <path d="M12 50 C12 40 34 44 34 34 C34 25 20 27 22 18" stroke="#2e7d32" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M12 50 C12 40 34 44 34 34 C34 25 20 27 22 18" stroke="#66bb6a" stroke-width="2.5" fill="none" stroke-dasharray="2 5" stroke-linecap="round"/>
    <ellipse cx="25" cy="14" rx="7" ry="5" fill="#2e7d32"/>
    <circle cx="27" cy="12.5" r="1.4" fill="#fff"/>
    <path d="M31 15 L37 16 M37 16 L40 14 M37 16 L40 18" stroke="#e53935" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M42 46 l3 -3 M47 50 l3 -3" stroke="#c62828" stroke-width="2.5" stroke-linecap="round"/>`),

  // Flamme
  brulure: svg('#fff3e0', `
    <path d="M32 8 C34 18 46 22 46 38 A14 14 0 0 1 18 38 C18 30 23 26 25 20 C27 26 30 26 30 26 C29 18 32 8 32 8Z" fill="#f4511e"/>
    <path d="M32 26 C33 32 40 34 40 42 A8 8 0 0 1 24 42 C24 37 28 35 29 31 C30 34 32 34 32 34 C31 30 32 26 32 26Z" fill="#ffca28"/>`),

  // Enfant fiévreux avec thermomètre
  enfant: svg('#fffde7', `
    <circle cx="30" cy="33" r="15" fill="${PEAU}"/>
    <path d="M17 26 Q22 15 33 17 Q43 18 44 27 Q38 21 30 22 Q22 22 17 26Z" fill="#3e2723"/>
    <path d="M23 32 q2.5 2 5 0 M33 32 q2.5 2 5 0" stroke="#3e2723" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="22" cy="38" r="2.6" fill="#ef5350" opacity=".7"/><circle cx="39" cy="38" r="2.6" fill="#ef5350" opacity=".7"/>
    <g transform="rotate(-25 44 42)">
      <rect x="31" y="40" width="22" height="4" rx="2" fill="#eceff1" stroke="#90a4ae"/>
      <circle cx="54" cy="42" r="3.5" fill="#e53935"/>
    </g>
    <path d="M47 14 C47 14 43 19 43 21.5 a4 4 0 0 0 8 0 C51 19 47 14 47 14Z" fill="#4fc3f7"/>`),

  // Téléphone d'alerte
  autre: svg('#ede7f6', `
    <rect x="20" y="10" width="24" height="44" rx="5" fill="#5e35b1"/>
    <rect x="23" y="16" width="18" height="30" rx="2" fill="#fff"/>
    <rect x="30" y="20" width="4" height="15" rx="2" fill="#e53935"/>
    <circle cx="32" cy="40" r="2.4" fill="#e53935"/>
    <circle cx="32" cy="50" r="1.8" fill="#b39ddb"/>
    <path d="M12 22 q-4 10 0 20 M52 22 q4 10 0 20" stroke="#7e57c2" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
};

// Fiches de premiers secours : on réutilise le dessin de l'urgence correspondante.
const PAR_FICHE = {
  inconscient: 'malaise', saignement: 'saignement', accouchement: 'accouchement', serpent: 'morsure',
  brulure: 'brulure', accident: 'accident', fievre: 'enfant', deshydratation: 'enfant',
};

// Pas de dessin : l'emoji dans une pastille, pour garder la même forme partout.
export function illustration(cle, emoji = '') {
  const id = DESSINS[cle] ? cle : PAR_FICHE[cle];
  if (DESSINS[id]) return DESSINS[id];
  return `<span class="pastille-emoji" aria-hidden="true">${emoji}</span>`;
}
