// ============================================
// Firebase Sync — Real-time sync between devices
// ============================================
//
// SYNC-CODES & SECURITY
// ---------------------
// Codes zijn 14 tekens uit alfabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (32^14 ≈ 8,5·10^20),
// gegenereerd met crypto.getRandomValues — niet enumereerbaar.
// Data staat onder rooms/<code>. Korte (6-teken) legacy-codes worden bij init
// éénmalig automatisch gemigreerd naar een nieuwe 14-teken-code (push-dan-pas-verwijderen).
//
// FIREBASE RULES DEPLOY — TWEE-STAPS (door hoofdsessie, via CLI)
// --------------------------------------------------------------
// De repo bevat:
//   database.rules.transitional.json  — staat 6- én 14-teken-rooms toe (migratie kan oude room lezen)
//   database.rules.json               — STRIKT: alleen 14-teken-rooms
//   firebase.json / .firebaserc       — wijzen naar de strikte rules + project-id
//
// Volgorde (belangrijk, anders breekt de migratie of de live app):
//   1. Deploy TRANSITIONAL rules eerst:
//        npx firebase-tools login
//        # firebase.json tijdelijk laten wijzen naar database.rules.transitional.json
//        # OF: npx firebase-tools deploy --only database  na firebase.json aan te passen
//      (Simpelst: kopieer transitional → database.rules.json, deploy, herstel daarna.)
//   2. Rol de app-update uit (deze sync.js): bestaande toestellen migreren naar 14-teken-codes.
//   3. Wacht tot alle toestellen gemigreerd zijn, deploy dan de STRIKTE rules:
//        npx firebase-tools deploy --only database
//   RTDB rules-JSON ondersteunt geen comments — houd de .json-bestanden puur JSON.

const Sync = {
  db: null,
  syncCode: null,
  listeners: [],
  enabled: false,
  lastWrite: 0,
  debounceTimer: null,
  errored: false,
  migrating: false,
  _expiredNotified: false,

  SYNC_CODE_KEY: 'activiteitenweger_sync_code',
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  CODE_LEN: 14,

  init() {
    // Initialize Firebase
    const firebaseConfig = {
      apiKey: "AIzaSyASrzEmmNgZIII77w4aZmIQeL3fYNgW1XE",
      authDomain: "activiteitenweger-9125d.firebaseapp.com",
      databaseURL: "https://activiteitenweger-9125d-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "activiteitenweger-9125d",
      storageBucket: "activiteitenweger-9125d.firebasestorage.app",
      messagingSenderId: "304128182040",
      appId: "1:304128182040:web:152a2d9671c7d4c25a006d",
    };

    if (typeof firebase === 'undefined') return;

    firebase.initializeApp(firebaseConfig);
    this.db = firebase.database();

    // Check if we have a saved sync code
    this.syncCode = localStorage.getItem(this.SYNC_CODE_KEY);
    if (this.syncCode) {
      this.enabled = true;
      // Korte (legacy) code → automatische migratie naar veilige 14-teken-code.
      if (this.syncCode.length < this.CODE_LEN) {
        this.migrateLegacyCode();
      } else {
        this.startListening();
      }
    }

    this.updateUI();
  },

  // Genereer een veilige 14-teken-sync-code via crypto.getRandomValues.
  // 32^14 ≈ 8,5·10^20 — niet enumereerbaar (geen Math.random).
  generateCode() {
    const chars = this.CODE_CHARS;
    const len = this.CODE_LEN;
    const out = new Array(len);
    // Rejection sampling op een 256-waarde-byte zodat de 32 tekens uniform verdeeld zijn
    // (256 is een veelvoud van 32, dus elke byte is bruikbaar: byte & 31).
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) {
      out[i] = chars[buf[i] & 31];
    }
    return out.join('');
  },

  // Groepeer een code voor weergave: XXXX-XXXX-XXXX-XX (14 tekens).
  // Korte legacy-codes worden ongewijzigd getoond.
  formatCode(code) {
    if (!code) return '';
    if (code.length !== this.CODE_LEN) return code;
    return code.replace(/(.{4})(.{4})(.{4})(.{2})/, '$1-$2-$3-$4');
  },

  // Normaliseer invoer: streepjes/spaties strippen en uppercasen.
  normalizeCode(raw) {
    return (raw || '').replace(/[\s-]/g, '').trim().toUpperCase();
  },

  // Start syncing with a new code
  startSync() {
    const code = this.generateCode();
    this.syncCode = code;
    localStorage.setItem(this.SYNC_CODE_KEY, code);
    this.enabled = true;

    // Push current local data to Firebase
    this.pushAll();
    this.startListening();
    this.updateUI();
    this.refreshMoreModal();

    Toast.show(`🔄 Sync actief — code: ${this.formatCode(code)}`, { duration: 7000 });
  },

  // Éénmalige migratie van een korte (legacy) code naar een veilige 14-teken-code.
  // Push-dan-pas-verwijderen: de oude room wordt PAS verwijderd nadat de volledige
  // lokale data succesvol naar de nieuwe room is gepusht. Faalt de push (offline,
  // permission) → niets wijzigen, oude code behouden, bij volgende start opnieuw proberen.
  // Dataverlies is daardoor uitgesloten.
  migrateLegacyCode() {
    if (!this.db || this.migrating) return;
    const oldCode = this.syncCode;
    if (!oldCode || oldCode.length >= this.CODE_LEN) return;
    this.migrating = true;

    // Eerst de oude room binnenhalen en mergen, zodat recente wijzigingen van
    // ANDERE toestellen niet verloren gaan wanneer de oude room straks
    // verwijderd wordt. Pas daarna de (gemergde) lokale data pushen.
    // Mislukt de pull → migratie afbreken, oude code behouden, retry volgende start.
    this.pullAll((err) => {
      if (err) {
        this.migrating = false;
        this.startListening();
        return;
      }
      this._pushToNewRoom(oldCode);
    });
  },

  // Tweede stap van de migratie: gemergde lokale data naar de nieuwe room pushen.
  _pushToNewRoom(oldCode) {
    const newCode = this.generateCode();
    const newData = {
      activities: getAllData(),
      energy: JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}'),
      baseline: getBaselineHistory(),
      meta: getMeta(),
      lastModified: Date.now(),
    };

    // a/b: push volledige (gemergde) lokale data naar het nieuwe room-pad.
    this.db.ref(`rooms/${newCode}`).set(newData)
      .then(() => {
        // c/e: voortaan luisteren op de nieuwe room + nieuwe code opslaan.
        this.syncCode = newCode;
        localStorage.setItem(this.SYNC_CODE_KEY, newCode);
        this.lastWrite = Date.now();
        this.setError(false);
        this.startListening();
        this.updateUI();
        this.refreshMoreModal();

        // d: oude room PAS NU leegmaken (na succesvolle nieuwe push).
        // Faalt dit, dan blijft enkel een verweesde oude room achter — geen dataverlies.
        this.db.ref(`rooms/${oldCode}`).remove().catch(err => {
          console.warn('Oude room verwijderen mislukt (data is veilig):', err);
        });

        this.showMigrationDialog(newCode);
        this.migrating = false;
      })
      .catch(err => {
        // Push mislukt → migratie NIET half uitvoeren. Oude code behouden,
        // op de oude room blijven luisteren en bij volgende start opnieuw proberen.
        console.error('Sync-migratie mislukt — oude code behouden:', err);
        this.migrating = false;
        this.startListening();
        this.setError(true);
      });
  },

  // Toon een duidelijke modal met de nieuwe code + kopieer-knop.
  showMigrationDialog(newCode) {
    const formatted = this.formatCode(newCode);
    const existing = document.getElementById('syncMigrationModal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'syncMigrationModal';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <h2>🔒 Sync-beveiliging verbeterd</h2>
        <p>Je nieuwe, veiligere sync-code is:</p>
        <div class="sync-code-display" id="migrationCodeDisplay">${formatted}</div>
        <p class="sync-hint">Voer deze code in op je andere toestellen
          (⋯ Meer → Synchronisatie → Code invoeren).</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="migrationCopyBtn"
            onclick="Sync.copyCode('${newCode}')">📋 Kopieer code</button>
          <button class="btn btn-primary"
            onclick="document.getElementById('syncMigrationModal').remove()">Begrepen</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  // Kopieer een (geformatteerde) code naar het klembord met fallback.
  copyCode(code) {
    const text = this.formatCode(code);
    const done = () => Toast.show('📋 Code gekopieerd');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this._copyFallback(text, done));
    } else {
      this._copyFallback(text, done);
    }
  },

  _copyFallback(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) {
      Toast.show('Kopiëren mislukt — noteer de code handmatig');
    }
  },

  // Join an existing sync room — klein modal i.p.v. native prompt
  joinSync() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'joinSyncModal';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <h2>🔄 Code invoeren</h2>
        <div class="form-group">
          <label>Sync-code van je andere apparaat</label>
          <input type="text" id="joinCodeInput" maxlength="17" autocomplete="off"
            autocapitalize="characters" spellcheck="false" placeholder="bv. AB2C-DE3F-GH4J-KM"
            style="text-transform:uppercase"
            onkeydown="if(event.key==='Enter')Sync.confirmJoin()">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('joinSyncModal').remove()">Annuleren</button>
          <button class="btn btn-primary" onclick="Sync.confirmJoin()">Verbinden</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('joinCodeInput')?.focus(), 50);
  },

  confirmJoin() {
    const code = this.normalizeCode(document.getElementById('joinCodeInput')?.value);
    if (!code) return;
    document.getElementById('joinSyncModal')?.remove();

    this.syncCode = code;
    localStorage.setItem(this.SYNC_CODE_KEY, this.syncCode);
    this.enabled = true;

    // Pull remote data first, then start listening
    this.pullAll(() => {
      this.startListening();
      this.updateUI();
      this.refreshMoreModal();
      App.navigate(App.currentView);
      Toast.show('🔄 Sync verbonden — data wordt automatisch gesynchroniseerd');
    });
  },

  // Stop syncing — met ongedaan-maken i.p.v. confirm
  stopSync() {
    const code = this.syncCode;
    this.stopListening();
    this.syncCode = null;
    localStorage.removeItem(this.SYNC_CODE_KEY);
    this.enabled = false;
    this.updateUI();
    this.refreshMoreModal();
    Toast.show('Sync gestopt — lokale data blijft bewaard', { undo: () => {
      this.syncCode = code;
      localStorage.setItem(this.SYNC_CODE_KEY, code);
      this.enabled = true;
      this.startListening();
      this.updateUI();
      this.refreshMoreModal();
    }});
  },

  // Ververs het ⋯ Meer-menu als dat openstaat (sync-paneel toont status)
  refreshMoreModal() {
    if (document.getElementById('moreModal')) {
      document.getElementById('moreModal').remove();
      App.openMoreModal();
    }
  },

  // Push all local data to Firebase
  pushAll() {
    if (!this.db || !this.syncCode) return;
    const ref = this.db.ref(`rooms/${this.syncCode}`);
    const data = {
      activities: getAllData(),
      energy: JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}'),
      baseline: getBaselineHistory(),
      meta: getMeta(),
      lastModified: Date.now(),
    };
    this.lastWrite = Date.now();
    ref.set(data)
      .then(() => this.setError(false))
      .catch(err => {
        console.error('Sync push mislukt:', err);
        this.setError(true);
      });
  },

  // Toon/verberg de fout-indicator in de navbalk
  setError(state) {
    if (this.errored === state) return;
    this.errored = state;
    this.updateUI();
  },

  // Een korte (legacy) code waarvan de room is vervallen (hoofdtoestel migreerde weg).
  // Toon een begrijpelijke, eenmalige melding zodat de gebruiker de nieuwe code opvraagt.
  notifyExpiredCode() {
    if (this._expiredNotified) return;
    this._expiredNotified = true;
    this.setError(true);
    Toast.show('⚠️ Sync-code vervallen — vraag de nieuwe code op je hoofdtoestel op en voer die in (⋯ Meer → Synchronisatie → Code invoeren).', { duration: 9000 });
  },

  // Push only changed data (debounced)
  pushDebounced() {
    if (!this.enabled || !this.db || !this.syncCode) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.pushAll(), 500);
  },

  // Pull all remote data and merge into local
  pullAll(callback) {
    if (!this.db || !this.syncCode) return;
    const ref = this.db.ref(`rooms/${this.syncCode}`);
    ref.once('value', (snapshot) => {
      this.setError(false);
      const remote = snapshot.val();
      if (!remote) {
        // Lege room bij een KORTE code → vervallen (gemigreerd weg): niet opnieuw aanmaken.
        // Tijdens onze eigen migratie is een lege oude room normaal — dan niet melden.
        if (this.syncCode && this.syncCode.length < this.CODE_LEN) {
          if (!this.migrating) this.notifyExpiredCode();
          if (callback) callback();
          return;
        }
        // 14-teken-code zonder remote data — push local data up (nieuwe room)
        this.pushAll();
        if (callback) callback();
        return;
      }
      this.mergeRemoteData(remote);
      if (callback) callback();
    }, (err) => {
      console.error('Sync pull mislukt:', err);
      this.setError(true);
      if (callback) callback(err);
    });
  },

  // Merge remote data into local storage.
  // Per dag wint de kant met de nieuwste meta-timestamp; zo blijven
  // verwijderingen (tombstones: recente timestamp + geen data) behouden.
  // Dagen zonder meta aan beide kanten (oude data) volgen het oude
  // union-gedrag: remote vult lege lokale dagen aan.
  mergeRemoteData(remote) {
    if (!remote) return;

    const remoteData = remote.activities || {};
    const remoteEnergy = remote.energy || {};
    const remoteMeta = remote.meta || {};
    const localData = getAllData();
    const localEnergy = JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}');
    const localMeta = getMeta();

    const allDays = new Set([
      ...Object.keys(localData), ...Object.keys(remoteData),
      ...Object.keys(localEnergy), ...Object.keys(remoteEnergy),
      ...Object.keys(localMeta), ...Object.keys(remoteMeta),
    ]);

    let changed = false;
    allDays.forEach(day => {
      const lm = localMeta[day]?.m || 0;
      const rm = remoteMeta[day]?.m || 0;
      if (rm > lm) {
        // Remote is nieuwer voor deze dag — data én energiestreep overnemen
        const rActs = remoteData[day];
        if (rActs && rActs.length > 0) localData[day] = rActs;
        else delete localData[day];
        if (remoteEnergy[day] != null) localEnergy[day] = remoteEnergy[day];
        else delete localEnergy[day];
        localMeta[day] = { m: rm };
        changed = true;
      } else if (lm === 0 && rm === 0) {
        // Geen meta (oude data): remote vult alleen lege lokale dagen aan
        if (remoteData[day] && (!localData[day] || localData[day].length === 0)) {
          localData[day] = remoteData[day];
          changed = true;
        }
        if (remoteEnergy[day] != null && localEnergy[day] == null) {
          localEnergy[day] = remoteEnergy[day];
          changed = true;
        }
      }
      // lm >= rm: lokaal is nieuwer of gelijk — niets doen
    });

    if (changed) {
      try {
        localStorage.setItem(ENERGY_STORAGE_KEY, JSON.stringify(localEnergy));
      } catch (e) {
        notifyStorageError(e);
      }
      saveMeta(localMeta);
      saveAllData(localData);
    }

    // Merge baseline-historiek
    mergeBaselineHistory(remote.baseline);
  },

  // Start listening for real-time changes
  startListening() {
    if (!this.db || !this.syncCode) return;
    this.stopListening();

    const ref = this.db.ref(`rooms/${this.syncCode}`);
    const listener = ref.on('value', (snapshot) => {
      const remote = snapshot.val();
      if (!remote) {
        // Lege room. Bij een KORTE (legacy) code betekent dit dat het hoofdtoestel
        // de room gemigreerd/verwijderd heeft → code is vervallen. Bij een 14-teken-code
        // is een lege snapshot normaal (gloednieuwe room) → niets melden.
        if (this.syncCode && this.syncCode.length < this.CODE_LEN && !this.migrating) {
          this.notifyExpiredCode();
        }
        return;
      }

      // Skip if this is our own write (within last 2 seconds)
      if (Date.now() - this.lastWrite < 2000) return;

      this.mergeRemoteData(remote);

      // Refresh the current view
      if (typeof App !== 'undefined' && App.currentView) {
        App.navigate(App.currentView);
      }
    }, (err) => {
      console.error('Sync listener-fout:', err);
      this.setError(true);
    });

    this.listeners.push({ ref, listener });
  },

  // Stop listening
  stopListening() {
    this.listeners.forEach(({ ref, listener }) => {
      ref.off('value', listener);
    });
    this.listeners = [];
  },

  // Update the sync UI indicator
  updateUI() {
    const el = document.getElementById('syncStatus');
    if (!el) return;

    if (this.enabled && this.syncCode) {
      const display = this.formatCode(this.syncCode);
      if (this.errored) {
        el.innerHTML = `
          <span class="sync-active sync-error" title="Sync-fout — controleer je verbinding. Data blijft lokaal bewaard.">
            ⚠️ ${display}
          </span>
        `;
      } else {
        el.innerHTML = `
          <span class="sync-active" title="Sync actief: ${display}">
            🔄 ${display}
          </span>
        `;
      }
    } else {
      el.innerHTML = '';
    }
  },

  // Render sync settings panel (shown in a modal or settings area)
  renderSyncPanel() {
    if (this.enabled && this.syncCode) {
      return `
        <div class="sync-panel">
          <div class="sync-panel-status">
            <span class="sync-dot sync-dot-active"></span>
            <strong>Sync actief</strong>
          </div>
          <div class="sync-code-display">${this.formatCode(this.syncCode)}</div>
          <p class="sync-hint">Voer deze code in op je andere apparaat</p>
          <div class="sync-actions">
            <button class="btn btn-secondary" onclick="Sync.copyCode('${this.syncCode}')">📋 Kopieer code</button>
            <button class="btn btn-secondary" onclick="Sync.pushAll();Toast.show('🔄 Data verstuurd')">🔄 Nu synchroniseren</button>
            <button class="btn btn-danger" onclick="Sync.stopSync()">Sync stoppen</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="sync-panel">
        <div class="sync-panel-status">
          <span class="sync-dot"></span>
          <strong>Niet gesynchroniseerd</strong>
        </div>
        <p class="sync-hint">Synchroniseer data tussen je apparaten</p>
        <div class="sync-actions">
          <button class="btn btn-primary" onclick="Sync.startSync()">Nieuwe sync starten</button>
          <button class="btn btn-secondary" onclick="Sync.joinSync()">Code invoeren</button>
        </div>
      </div>
    `;
  },
};
