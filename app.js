'use strict';

const ELIX_BASE_URL = 'https://dico.elix-lsf.fr/dictionnaire/';
const MAX_RECENT = 50;
const STORAGE_KEY = 'mots-lsf.niveaux';

let levels = [];              // Niveaux disponibles (depuis niveaux.json)
let selectedIds = [];         // Niveaux cochés
const levelCache = {};        // id du niveau -> liste de mots (évite de recharger)
let words = [];               // Mots disponibles : [{ mot, niveaux: ['A1.1', ...] }]
let recentWords = [];         // Derniers mots affichés (pour éviter les répétitions)

const $ = id => document.getElementById(id);

// --- Chargement des données -----------------------------------------------------

async function loadLevels() {
    const response = await fetch('niveaux.json');
    if (!response.ok) throw new Error('Impossible de charger niveaux.json');
    levels = await response.json();
}

async function loadLevelWords(level) {
    if (!levelCache[level.id]) {
        const response = await fetch(level.fichier);
        if (!response.ok) throw new Error(`Impossible de charger ${level.fichier}`);
        const text = await response.text();
        levelCache[level.id] = text.split('\n').map(w => w.trim()).filter(w => w.length > 0);
    }
    return levelCache[level.id];
}

// Fusionne les mots des niveaux cochés, sans doublons (un mot présent dans
// plusieurs niveaux garde la liste de ses niveaux pour le badge)
async function buildWordList() {
    const chosen = levels.filter(l => selectedIds.includes(l.id));
    const lists = await Promise.all(chosen.map(loadLevelWords));
    const byKey = new Map();
    chosen.forEach((level, i) => {
        for (const mot of lists[i]) {
            const key = mot.toLocaleLowerCase('fr');
            if (!byKey.has(key)) byKey.set(key, { mot, niveaux: [] });
            const entry = byKey.get(key);
            if (!entry.niveaux.includes(level.nom)) entry.niveaux.push(level.nom);
        }
    });
    words = [...byKey.values()];
    recentWords = [];
}

// --- Choix des niveaux (URL > navigateur > tous) -------------------------------

function initialSelection() {
    const validIds = levels.map(l => l.id);
    const clean = ids => ids.filter(id => validIds.includes(id));
    const param = new URLSearchParams(location.search).get('niveaux');
    if (param) {
        if (param === 'tous') return validIds;
        const ids = clean(param.split(','));
        if (ids.length) return ids;
    }
    try {
        const saved = clean(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
        if (saved.length) return saved;
    } catch (e) { /* valeur invalide : on ignore */ }
    return validIds;
}

function saveSelection() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds)); } catch (e) { /* navigation privée */ }
    const url = new URL(location.href);
    const all = selectedIds.length === levels.length;
    url.searchParams.set('niveaux', all ? 'tous' : selectedIds.join(','));
    history.replaceState(null, '', url);
}

function addToggle(container, id, label, checked, onChange, extraClass) {
    const row = document.createElement('label');
    row.className = 'toggle' + (extraClass ? ' ' + extraClass : '');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'niveau-' + id;
    input.checked = checked;
    input.addEventListener('change', onChange);
    const text = document.createElement('span');
    text.className = 'toggle-label';
    text.textContent = label;
    const track = document.createElement('span');
    track.className = 'toggle-track';
    track.setAttribute('aria-hidden', 'true');
    row.append(text, input, track);
    container.appendChild(row);
}

function renderLevelMenu() {
    const menu = $('levelMenu');
    menu.innerHTML = '';
    const all = selectedIds.length === levels.length;
    addToggle(menu, 'tous', 'Tous les niveaux', all, e => {
        // Décocher « Tous » revient au premier niveau seul (il faut au moins un niveau)
        setSelection(e.target.checked ? levels.map(l => l.id) : [levels[0].id]);
    }, 'toggle-all');
    for (const level of levels) {
        addToggle(menu, level.id, level.nom, selectedIds.includes(level.id), e => {
            const next = e.target.checked
                ? levels.map(l => l.id).filter(id => id === level.id || selectedIds.includes(id))
                : selectedIds.filter(id => id !== level.id);
            if (next.length === 0) { e.target.checked = true; return; } // au moins un niveau
            setSelection(next);
        });
    }
    const summary = all
        ? 'Tous les niveaux'
        : levels.filter(l => selectedIds.includes(l.id)).map(l => l.nom).join(', ');
    // Texte court dans le bouton (petits écrans), texte complet pour l'info-bulle et les lecteurs d'écran
    $('levelButtonText').textContent = all ? 'Tous' : summary;
    $('levelButton').title = 'Niveaux : ' + summary;
    $('levelButton').setAttribute('aria-label', 'Choisir les niveaux (actuellement : ' + summary + ')');
}

async function setSelection(ids) {
    selectedIds = ids;
    saveSelection();
    renderLevelMenu();
    try {
        await buildWordList();
        getRandomWord();
    } catch (error) {
        console.error(error);
        showMessage('Erreur de chargement.');
    }
}

// --- Affichage d'un mot -----------------------------------------------------------

function showMessage(text) {
    $('wordDisplay').textContent = text;
    $('levelBadge').textContent = '';
}

function getRandomWord() {
    if (words.length === 0) { showMessage('Aucun mot trouvé.'); return; }
    // On ne peut pas exclure plus de mots qu'il n'en existe (évite une boucle infinie)
    const maxRecent = Math.min(MAX_RECENT, words.length - 1);
    let entry;
    do {
        entry = words[Math.floor(Math.random() * words.length)];
    } while (recentWords.includes(entry.mot));
    recentWords.push(entry.mot);
    while (recentWords.length > maxRecent) recentWords.shift();

    const word = $('wordDisplay');
    word.textContent = entry.mot;
    // Les mots longs passent en taille réduite pour tenir sur mobile
    word.classList.toggle('word-long', entry.mot.length > 12);
    $('levelBadge').textContent = entry.niveaux.join(' · ');

    // Petite animation d'apparition (désactivée si l'utilisateur réduit les animations)
    const card = $('card');
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');

    // Simple lien vers la page du mot sur Le Dico Elix (mots composés encodés dans l'URL)
    const elixLink = $('elixLink');
    elixLink.href = ELIX_BASE_URL + encodeURIComponent(entry.mot);
    elixLink.setAttribute('aria-label', `Voir le signe de « ${entry.mot} » sur Le Dico Elix (nouvel onglet)`);
}

// --- Plein écran (avec repli « immersif » en CSS) -------------------------------
// API standard + préfixes webkit (iPadOS Safari). Sans API (iPhone) ou si la demande
// échoue, la classe .immersive suffit : barre du haut et pied de page masqués, mot agrandi.

const root = document.documentElement;
let keepImmersive = false;    // Sortie volontaire du plein écran réel en gardant le mode immersif

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isImmersive() {
    return root.classList.contains('immersive');
}

function updateFullscreenButton() {
    const on = isImmersive();
    const button = $('fullscreenButton');
    const label = on ? 'Quitter le plein écran' : 'Passer en plein écran';
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', label);
    button.title = label;
}

function setImmersive(on) {
    root.classList.toggle('immersive', on);
    updateFullscreenButton();
}

function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit || !fullscreenElement()) return;
    // exitFullscreen renvoie une promesse, pas webkitExitFullscreen (anciens Safari)
    Promise.resolve(exit.call(document)).catch(() => {});
}

function enterFullscreen() {
    setImmersive(true); // repli immédiat ; le plein écran réel vient en plus si possible
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return;
    try {
        Promise.resolve(request.call(root)).catch(() => {}); // refus : on reste en immersif
    } catch (e) { /* idem */ }
}

function toggleFullscreen() {
    if (!isImmersive()) { enterFullscreen(); return; }
    if (fullscreenElement()) exitFullscreen(); // l'événement de changement retire la classe
    else setImmersive(false);
}

// Sortie par Échap ou par le geste système : on remet le bouton d'aplomb
function onFullscreenChange() {
    if (fullscreenElement()) setImmersive(true);
    else if (keepImmersive) keepImmersive = false;
    else setImmersive(false);
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

// Sur iPadOS, focaliser un champ (les cases de la fenêtre des niveaux) fait sortir
// du plein écran : sur écran tactile, on le quitte d'abord en gardant le mode immersif.
function openLevelDialog() {
    if (fullscreenElement() && matchMedia('(pointer: coarse)').matches) {
        keepImmersive = true;
        exitFullscreen();
    }
    $('levelDialog').showModal();
}

// --- Interactions -----------------------------------------------------------------

document.addEventListener('keydown', event => {
    if ($('levelDialog').open || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target.tagName;
    const onControl = ['BUTTON', 'A', 'INPUT', 'LABEL'].includes(tag);
    if ((event.key === ' ' || event.key === 'Enter') && !onControl) {
        event.preventDefault();
        getRandomWord();
    } else if ((event.key === 'e' || event.key === 'E') && !onControl) {
        window.open($('elixLink').href, '_blank', 'noopener');
    } else if ((event.key === 'f' || event.key === 'F') && tag !== 'INPUT') {
        toggleFullscreen();
    } else if (event.key === 'Escape' && isImmersive() && !fullscreenElement()) {
        setImmersive(false); // en plein écran réel, Échap est géré par le navigateur
    }
});

// Balayage vers la gauche sur la carte = mot suivant (téléphone / tablette)
function enableSwipe(element) {
    let startX = null, startY = null;
    element.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    element.addEventListener('touchend', e => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5) getRandomWord();
        startX = startY = null;
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', async () => {
    const dialog = $('levelDialog');
    $('levelButton').addEventListener('click', openLevelDialog);
    $('fullscreenButton').addEventListener('click', toggleFullscreen);
    updateFullscreenButton();
    // Clic en dehors de la fenêtre = fermer
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    $('nextButton').addEventListener('click', getRandomWord);
    enableSwipe($('card'));
    try {
        await loadLevels();
        await setSelection(initialSelection());
    } catch (error) {
        console.error('Erreur lors du chargement des mots :', error);
        showMessage('Erreur de chargement.');
    }
});
