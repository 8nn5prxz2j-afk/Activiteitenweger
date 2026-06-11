// ============================================
// Onboarding — toegangscode, profielaanmaak, installeer-hint
// ============================================
//
// Drie localStorage-sleutels:
//   activiteitenweger_access  : '1' = toegang verleend
//   activiteitenweger_profile : JSON { name: string, onboarded: true }
//   activiteitenweger_install_hint : '1' = banner weggetikt
//
// VEILIGHEID: dit is een drempel tegen toevallige bezoekers, GEEN echte
// beveiliging. De hash staat in publieke JS-code; iedereen met devtools
// kan hem omzeilen. Doel: alleen genodigden bereiken de app.
//
// De toegangscode is momenteel 'weger2026'.
// Hash genereren: printf '<code>' | shasum -a 256
// Vervang de ACCESS_HASH-constante door de nieuwe hex-string.

const Onboarding = (() => {
  // SHA-256 hex-hash van 'weger2026'
  // Berekend met: printf 'weger2026' | shasum -a 256
  const ACCESS_HASH = '510df519c26b68a8562d4d232587c649e76c45812a0b1565565f22fb92123c63';

  const KEY_ACCESS        = 'activiteitenweger_access';
  const KEY_PROFILE       = 'activiteitenweger_profile';
  const KEY_INSTALL_HINT  = 'activiteitenweger_install_hint';

  // ---- Hulpfuncties ----

  // Lees profiel uit localStorage, of null als er geen is.
  function _readProfile() {
    try {
      return JSON.parse(localStorage.getItem(KEY_PROFILE) || 'null');
    } catch {
      return null;
    }
  }

  // Sla profiel op.
  function _saveProfile(profile) {
    localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
  }

  // Bereken SHA-256 van een string; geeft de hex-string terug als Promise.
  async function _sha256(text) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Controleer of de app als geïnstalleerde PWA draait.
  function _isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari-vlag
      !!navigator.standalone
    );
  }

  // Detecteer iOS Safari op basis van userAgent.
  function _isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent);
  }

  // ---- Overlay & modal bouwen ----

  // Maak een fullscreen overlay-wrapper die de app volledig bedekt.
  // Geeft het wrapper-div terug; inhoud invullen via .innerHTML of appendChild.
  function _createFullscreenOverlay(id) {
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'ob-fullscreen';
    document.body.appendChild(overlay);
    return overlay;
  }

  // Verwijder een overlay van de DOM.
  function _removeOverlay(id) {
    document.getElementById(id)?.remove();
  }

  // ---- Stap A: bestaande installatie detecteren ----
  // Als er al dagen met data zijn maar nog geen profiel, is dit waarschijnlijk
  // een installatie van vóór het onboarding-systeem. Dan stilzwijgend
  // access verlenen en een standaard-profiel voor Niels aanmaken.
  function _silentGrant() {
    const days = (typeof getSavedDays === 'function') ? getSavedDays() : [];
    if (days.length > 0 && !_readProfile()) {
      localStorage.setItem(KEY_ACCESS, '1');
      _saveProfile({ name: 'Niels', onboarded: true });
    }
  }

  // ---- Stap B: toegangscode-scherm ----
  // Geeft een Promise terug die resolvet zodra de toegangscode is ingevoerd
  // (of meteen als de access-vlag al gezet is).
  function _showAccessGate() {
    return new Promise((resolve) => {
      // crypto.subtle is enkel beschikbaar op https of localhost
      if (!window.crypto || !window.crypto.subtle) {
        const overlay = _createFullscreenOverlay('ob-access');
        overlay.innerHTML = `
          <div class="ob-card">
            <h1 class="ob-title">Activiteitenweger</h1>
            <p class="ob-text ob-error">Open de app via https om toegang te krijgen.</p>
          </div>
        `;
        // Nooit resolven — app blijft geblokkeerd.
        return;
      }

      const overlay = _createFullscreenOverlay('ob-access');
      overlay.innerHTML = `
        <div class="ob-card">
          <h1 class="ob-title">Activiteitenweger</h1>
          <p class="ob-text">Deze app is op uitnodiging. Voer je toegangscode in om verder te gaan.</p>
          <div class="ob-form-group">
            <input
              type="password"
              id="ob-access-input"
              class="ob-input"
              placeholder="Toegangscode"
              autocomplete="off"
              maxlength="64"
            >
            <p class="ob-error-msg" id="ob-access-error" style="display:none">Onjuiste code. Probeer opnieuw.</p>
          </div>
          <button class="btn btn-primary ob-btn-full" id="ob-access-btn">Toegang krijgen</button>
        </div>
      `;

      const input  = document.getElementById('ob-access-input');
      const btn    = document.getElementById('ob-access-btn');
      const errMsg = document.getElementById('ob-access-error');

      // Bevestigen via knop of Enter-toets
      async function _tryAccess() {
        const code = input.value.trim().toLowerCase();
        if (!code) return;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const hash = await _sha256(code);
          if (hash === ACCESS_HASH) {
            localStorage.setItem(KEY_ACCESS, '1');
            _removeOverlay('ob-access');
            resolve();
          } else {
            errMsg.style.display = 'block';
            input.value = '';
            input.focus();
          }
        } finally {
          btn.disabled = false;
          btn.textContent = 'Toegang krijgen';
        }
      }

      btn.addEventListener('click', _tryAccess);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _tryAccess();
        // Foutmelding verbergen bij nieuwe invoer
        if (errMsg.style.display !== 'none') errMsg.style.display = 'none';
      });
      input.focus();
    });
  }

  // ---- Stap C: onboarding — naam + basisniveau ----
  // Geeft een Promise terug die resolvet zodra het profiel is aangemaakt.
  function _showOnboarding() {
    return new Promise((resolve) => {
      const overlay = _createFullscreenOverlay('ob-onboard');
      // Twee schermen; we starten op scherm 1.
      _renderOnboardStep1(overlay, resolve);
    });
  }

  function _renderOnboardStep1(overlay, resolve) {
    overlay.innerHTML = `
      <div class="ob-card">
        <p class="ob-step-indicator">Stap 1 van 2</p>
        <h2 class="ob-subtitle">Hoe heet je?</h2>
        <p class="ob-text">Zo weten we hoe we je moeten aanspreken in de app.</p>
        <div class="ob-form-group">
          <input
            type="text"
            id="ob-name-input"
            class="ob-input"
            placeholder="Voornaam"
            maxlength="30"
            autocomplete="given-name"
          >
          <p class="ob-error-msg" id="ob-name-error" style="display:none">Vul je voornaam in om verder te gaan.</p>
        </div>
        <button class="btn btn-primary ob-btn-full" id="ob-name-btn">Volgende →</button>
      </div>
    `;
    const input  = document.getElementById('ob-name-input');
    const btn    = document.getElementById('ob-name-btn');
    const errMsg = document.getElementById('ob-name-error');

    function _next() {
      const name = input.value.trim();
      if (!name) {
        errMsg.style.display = 'block';
        input.focus();
        return;
      }
      _renderOnboardStep2(overlay, name, resolve);
    }

    btn.addEventListener('click', _next);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _next();
      if (errMsg.style.display !== 'none') errMsg.style.display = 'none';
    });
    input.focus();
  }

  function _renderOnboardStep2(overlay, name, resolve) {
    const DEFAULT_LEVEL = 20;

    overlay.innerHTML = `
      <div class="ob-card">
        <p class="ob-step-indicator">Stap 2 van 2</p>
        <h2 class="ob-subtitle">Wat is je basisniveau?</h2>
        <p class="ob-text">
          Het basisniveau is het aantal energiepunten dat jouw lichaam per dag aankan.
          Iedereen is anders: dit hangt af van je toestand, je herstelpatroon en wat je
          dagelijks kunt doen. Bepaal het bij voorkeur samen met je arts, ergotherapeut
          of op basis van je eigen ervaring.
        </p>
        <p class="ob-baseline-label">Jouw dagelijkse basisniveau (aanpassen naar jouw situatie):</p>
        <div class="ob-stepper-wrap">
          <div class="duration-stepper">
            <button type="button" class="dur-btn" id="ob-base-min" aria-label="1 punt lager">−</button>
            <span class="dur-display" id="ob-base-val">${DEFAULT_LEVEL}</span>
            <button type="button" class="dur-btn" id="ob-base-plus" aria-label="1 punt hoger">+</button>
          </div>
          <span class="ob-unit">punten/dag</span>
        </div>
        <p class="ob-baseline-hint">Standaard: ${DEFAULT_LEVEL} — pas dit aan naar jouw situatie. Je kunt het later altijd wijzigen via ⋯ Meer.</p>
        <button class="btn btn-primary ob-btn-full" id="ob-start-btn">Aan de slag →</button>
      </div>
    `;

    // Stepper
    let level = DEFAULT_LEVEL;
    const valEl = document.getElementById('ob-base-val');

    document.getElementById('ob-base-min').addEventListener('click', () => {
      level = Math.max(5, level - 1);
      valEl.textContent = String(level);
    });
    document.getElementById('ob-base-plus').addEventListener('click', () => {
      level = Math.min(60, level + 1);
      valEl.textContent = String(level);
    });

    document.getElementById('ob-start-btn').addEventListener('click', () => {
      // Profiel opslaan
      _saveProfile({ name, onboarded: true });
      // Basisniveau instellen via bestaande data.js-functie
      if (typeof setBaselineFrom === 'function') {
        setBaselineFrom(level);
      }
      _removeOverlay('ob-onboard');
      resolve();
    });
  }

  // ---- Stap D: installeer-hint ----
  // Toont een dismissbare banner onderaan als de app niet standalone draait.
  function _showInstallHint() {
    if (_isStandalone()) return;
    if (localStorage.getItem(KEY_INSTALL_HINT) === '1') return;

    const isIOS = _isIOS();
    const instruction = isIOS
      ? 'Tik op Deel (□↑) → Zet op beginscherm'
      : 'Open het browsermenu → App installeren / Toevoegen aan startscherm';

    const banner = document.createElement('div');
    banner.id = 'ob-install-banner';
    banner.className = 'ob-install-banner';
    banner.innerHTML = `
      <span class="ob-install-icon">📲</span>
      <span class="ob-install-text">${instruction}</span>
      <button class="ob-install-close" id="ob-install-close" aria-label="Banner sluiten">✕</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('ob-install-close').addEventListener('click', () => {
      localStorage.setItem(KEY_INSTALL_HINT, '1');
      banner.remove();
    });
  }

  // ---- Toon installeer-instructie in een eenvoudige melding ----
  function showInstallInstructions() {
    const isIOS = _isIOS();
    const instruction = isIOS
      ? 'Tik op Deel (□↑) → Zet op beginscherm'
      : 'Open het browsermenu → App installeren / Toevoegen aan startscherm';
    // Gebruik Toast als die beschikbaar is, anders alert
    if (typeof Toast !== 'undefined') {
      Toast.show('📲 ' + instruction, { duration: 7000 });
    } else {
      alert('App installeren:\n' + instruction);
    }
  }

  // ---- Publieke API ----

  return {
    // Voer de volledige onboarding-flow uit.
    // Async: resolvet pas als access verleend is én het profiel bestaat.
    // App.init() mag pas daarna worden aangeroepen.
    async check() {
      // Detecteer bestaande installatie (data zonder profiel = Niels)
      _silentGrant();

      // Is de toegang al verleend?
      if (localStorage.getItem(KEY_ACCESS) !== '1') {
        await _showAccessGate();
      }

      // Is het profiel al aangemaakt?
      if (!_readProfile()) {
        await _showOnboarding();
      }

      // Installeer-hint tonen (niet-blokkerend)
      _showInstallHint();
    },

    // Geeft de naam van de gebruiker, of lege string als er geen profiel is.
    getName() {
      return _readProfile()?.name || '';
    },

    // Naam bijwerken in het bestaande profiel.
    setName(name) {
      const profile = _readProfile() || { onboarded: true };
      profile.name = name;
      _saveProfile(profile);
    },

    // Toon de installeer-instructies (aanroepen vanuit ⋯ Meer-menu).
    showInstallInstructions,
  };
})();
