// ============================================
// Firebase Sync — Real-time sync between devices
// ============================================

const Sync = {
  db: null,
  syncCode: null,
  listeners: [],
  enabled: false,
  lastWrite: 0,
  debounceTimer: null,
  errored: false,

  SYNC_CODE_KEY: 'activiteitenweger_sync_code',

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
      this.startListening();
      this.enabled = true;
    }

    this.updateUI();
  },

  // Generate a random 6-char sync code
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
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

    Toast.show(`🔄 Sync actief — code: ${code}`, { duration: 7000 });
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
          <input type="text" id="joinCodeInput" maxlength="6" autocomplete="off"
            autocapitalize="characters" spellcheck="false" placeholder="bv. AB2CDE"
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
    const code = (document.getElementById('joinCodeInput')?.value || '').trim().toUpperCase();
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
        // No remote data — push local data up
        this.pushAll();
        if (callback) callback();
        return;
      }
      this.mergeRemoteData(remote);
      if (callback) callback();
    }, (err) => {
      console.error('Sync pull mislukt:', err);
      this.setError(true);
      if (callback) callback();
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
      if (!remote) return;

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
      if (this.errored) {
        el.innerHTML = `
          <span class="sync-active sync-error" title="Sync-fout — controleer je verbinding. Data blijft lokaal bewaard.">
            ⚠️ ${this.syncCode}
          </span>
        `;
      } else {
        el.innerHTML = `
          <span class="sync-active" title="Sync actief: ${this.syncCode}">
            🔄 ${this.syncCode}
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
          <div class="sync-code-display">${this.syncCode}</div>
          <p class="sync-hint">Voer deze code in op je andere apparaat</p>
          <div class="sync-actions">
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
