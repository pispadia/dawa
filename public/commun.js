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

// Remplace window.prompt, bloqué dans certains navigateurs intégrés (WhatsApp, Facebook…).
// Renvoie le texte saisi, ou null si la personne annule.
export function demanderTexte(question, { placeholder = '', type = 'text', valider = 'OK', annuler = 'Annuler' } = {}) {
  return new Promise((resoudre) => {
    const d = document.createElement('dialog');
    d.innerHTML = `
      <form class="modale" method="dialog">
        <label for="demande-texte" style="font-size:1rem;color:var(--texte)">${echapper(question)}</label>
        <input id="demande-texte" name="valeur" type="${type}" placeholder="${echapper(placeholder)}"
          ${type === 'tel' ? 'inputmode="tel"' : ''} autocomplete="off" required>
        <div class="actions">
          <button class="bouton secondaire" type="button" value="annuler">${echapper(annuler)}</button>
          <button class="bouton" type="submit">${echapper(valider)}</button>
        </div>
      </form>`;
    document.body.append(d);
    const champ = d.querySelector('input');
    let resultat = null;
    d.querySelector('form').addEventListener('submit', () => { resultat = champ.value.trim() || null; });
    d.querySelector('[value=annuler]').addEventListener('click', () => d.close());
    d.addEventListener('close', () => { d.remove(); resoudre(resultat); });
    d.showModal();
    champ.focus();
  });
}
