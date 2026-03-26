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

    alert(`Sync geactiveerd!\n\nJe sync-code is: ${code}\n\nVoer deze code in op je andere apparaat om te synchroniseren.`);
  },

  // Join an existing sync room
  joinSync() {
    const code = prompt('Voer de sync-code in van je andere apparaat:');
    if (!code || code.trim().length === 0) return;

    this.syncCode = code.trim().toUpperCase();
    localStorage.setItem(this.SYNC_CODE_KEY, this.syncCode);
    this.enabled = true;

    // Pull remote data first, then start listening
    this.pullAll(() => {
      this.startListening();
      this.updateUI();
      // Refresh current view
      App.navigate(App.currentView);
      alert('Sync verbonden! Data wordt nu automatisch gesynchroniseerd.');
    });
  },

  // Stop syncing
  stopSync() {
    if (!confirm('Wil je de synchronisatie stoppen? Lokale data blijft bewaard.')) return;
    this.stopListening();
    this.syncCode = null;
    localStorage.removeItem(this.SYNC_CODE_KEY);
    this.enabled = false;
    this.updateUI();
  },

  // Push all local data to Firebase
  pushAll() {
    if (!this.db || !this.syncCode) return;
    const ref = this.db.ref(`rooms/${this.syncCode}`);
    const data = {
      activities: getAllData(),
      energy: JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}'),
      lastModified: Date.now(),
    };
    this.lastWrite = Date.now();
    ref.set(data);
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
      const remote = snapshot.val();
      if (!remote) {
        // No remote data — push local data up
        this.pushAll();
        if (callback) callback();
        return;
      }
      this.mergeRemoteData(remote);
      if (callback) callback();
    });
  },

  // Merge remote data into local storage
  mergeRemoteData(remote) {
    if (!remote) return;

    // Merge activities
    if (remote.activities) {
      const local = getAllData();
      let changed = false;
      for (const [dayKey, acts] of Object.entries(remote.activities)) {
        if (!local[dayKey] || local[dayKey].length === 0) {
          local[dayKey] = acts;
          changed = true;
        } else if (JSON.stringify(local[dayKey]) !== JSON.stringify(acts)) {
          // Remote has different data — use the one with more activities
          // or the remote version if it was modified later
          local[dayKey] = acts;
          changed = true;
        }
      }
      // Also check for days that exist locally but not remotely (deleted remotely)
      if (changed) saveAllData(local);
    }

    // Merge energy markers
    if (remote.energy) {
      for (const [dayKey, mins] of Object.entries(remote.energy)) {
        setEnergyMarker(dayKey, mins);
      }
    }
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
      el.innerHTML = `
        <span class="sync-active" title="Sync actief: ${this.syncCode}">
          🔄 ${this.syncCode}
        </span>
      `;
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
            <button class="btn btn-secondary" onclick="Sync.pushAll();alert('Data verstuurd!')">🔄 Nu synchroniseren</button>
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
