'use strict';
// Thème clair / sombre : suit l'OS par défaut, le bouton force un choix (mémorisé).
// Chargé dans <head> sans defer pour éviter un flash de la mauvaise couleur.
(function () {
    const KEY = 'mots-lsf.theme';
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function saved() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }
    function current() {
        return root.dataset.theme || (media.matches ? 'dark' : 'light');
    }
    function updateMeta() {
        const color = current() === 'dark' ? '#14161c' : '#2f5bea';
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
    }
    function updateButton() {
        const button = document.getElementById('themeButton');
        if (!button) return;
        const dark = current() === 'dark';
        button.setAttribute('aria-pressed', String(dark));
        const label = dark ? 'Passer en mode clair' : 'Passer en mode sombre';
        button.setAttribute('aria-label', label);
        button.title = label;
    }
    function apply(theme) {
        if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
        else delete root.dataset.theme;
        updateMeta();
        updateButton();
    }

    apply(saved());

    // Si aucun choix n'est mémorisé, on suit les changements de l'OS en direct
    media.addEventListener('change', () => { if (!saved()) apply(null); });

    document.addEventListener('DOMContentLoaded', () => {
        updateButton();
        const button = document.getElementById('themeButton');
        if (!button) return;
        button.addEventListener('click', () => {
            const next = current() === 'dark' ? 'light' : 'dark';
            // Si le choix revient à celui de l'OS, on oublie la préférence (retour au mode auto)
            const osTheme = media.matches ? 'dark' : 'light';
            try {
                if (next === osTheme) localStorage.removeItem(KEY);
                else localStorage.setItem(KEY, next);
            } catch (e) { /* navigation privée */ }
            apply(next === osTheme ? null : next);
        });
    });
})();
