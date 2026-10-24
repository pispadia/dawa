// Petits utilitaires partagés par les pages.
export const fcfa = (n) => `${Number(n).toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`;

export function echapper(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function api(chemin, { methode = 'GET', corps, jeton } = {}) {
  const entetes = {};
  if (corps) entetes['Content-Type'] = 'application/json';
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const res = await fetch(chemin, { method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined });
  const donnees = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(donnees.erreur || 'Erreur réseau');
    err.statut = res.status;
    throw err;
  }
  return donnees;
}

let minuteurToast;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.remove('cache');
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => el.classList.add('cache'), 3000);
}

export function lienWhatsapp(telephone, texte) {
  return `https://wa.me/${telephone.replace(/\D/g, '')}?text=${encodeURIComponent(texte)}`;
}
