// ============================================
// Toast — korte melding met optionele "Ongedaan maken"
// ============================================

const Toast = {
  timer: null,

  show(msg, opts = {}) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    clearTimeout(this.timer);
    el.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'toast-msg';
    span.textContent = msg;
    el.appendChild(span);
    if (opts.undo) {
      const btn = document.createElement('button');
      btn.className = 'toast-undo';
      btn.textContent = 'Ongedaan maken';
      btn.onclick = () => { this.hide(); opts.undo(); };
      el.appendChild(btn);
    }
    el.classList.add('show');
    this.timer = setTimeout(() => this.hide(), opts.duration || 4500);
  },

  hide() {
    document.getElementById('toast')?.classList.remove('show');
  },
};

// ============================================
// App — Routing, Navigation & Init
// ============================================

const App = {
  currentView: 'month', // 'month' | 'week' | 'day'
  currentDate: new Date(),

  init() {
    // Theme-color meekleuren met licht/donker
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => themeMeta?.setAttribute('content', darkQuery.matches ? '#0f1233' : '#1a237e');
    applyTheme();
    darkQuery.addEventListener?.('change', applyTheme);

    this.renderNav();
    // Start at the most recent day with data, or today
    const days = getSavedDays();
    let startDate = new Date();
    if (days.length > 0) {
      const lastDay = days[days.length - 1];
      const todayKey = todayStr();
      // If there's no data for this month, jump to the last month with data
      const thisMonth = todayKey.substring(0, 7);
      const hasThisMonth = days.some(d => d.startsWith(thisMonth));
      if (!hasThisMonth) {
        startDate = parseDate(lastDay);
      }
    }
    Sync.updateUI();
    this.navigate('month', startDate);

    // Now-line timer (en laat de lopende activiteit live meegroeien)
    setInterval(() => {
      if (this.currentView !== 'day') return;
      DayView.updateNowLine();
      const r = typeof getRunning === 'function' ? getRunning() : null;
      if (r && r.dayKey === todayStr() && DayView.dayKey === todayStr()) {
        DayView.renderActivities();
      }
    }, 60000);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('.modal-overlay.open')) {
        if (e.key === 'Escape') this.closeModal();
        return;
      }
      if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === 'ArrowRight') this.next();
      else if (e.key === '1') this.navigate('month');
      else if (e.key === '2') this.navigate('week');
      else if (e.key === '3') this.navigate('day');
      else if (e.key === 't' || e.key === 'T') this.today();
    });
  },

  renderNav() {
    const nav = document.getElementById('navbar');
    nav.innerHTML = `
      <button class="hamburger" onclick="DayView.toggleSidebar()">☰</button>
      <h1>Activiteitenweger</h1>
      <div class="nav-group">
        <button class="nav-btn" onclick="App.prev()">‹</button>
        <button class="nav-btn" onclick="App.today()">Vandaag</button>
        <button class="nav-btn" onclick="App.next()">›</button>
      </div>
      <span class="nav-title" id="navTitle"></span>
      <div class="nav-spacer"></div>
      <div class="nav-group">
        <button class="nav-btn" id="btnMonth" onclick="App.navigate('month')">Maand</button>
        <button class="nav-btn" id="btnWeek" onclick="App.navigate('week')">Week</button>
        <button class="nav-btn" id="btnDay" onclick="App.navigate('day')">Dag</button>
        <button class="nav-btn" id="btnChart" onclick="App.navigate('chart')">Grafiek</button>
      </div>
      <span class="score-badge" id="scoreBadge" style="display:none">
        Dagtotaal: <span id="dayTotal">0</span> pt
        <span id="ebBadge" style="margin-left:8px;opacity:0.8">| EB: <span id="ebValue">0</span></span>
      </span>
      <span id="syncStatus"></span>
      <button class="nav-btn" onclick="App.openMoreModal()">⋯ Meer</button>
    `;
  },

  navigate(view, date) {
    if (date) this.currentDate = new Date(date);
    this.currentView = view;

    const container = document.getElementById('appBody');

    // Subtiele binnenkom-animatie bij het wisselen van view
    container.classList.remove('view-enter');
    void container.offsetWidth; // reflow zodat de animatie opnieuw afspeelt
    container.classList.add('view-enter');

    // Update active button
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn' + view.charAt(0).toUpperCase() + view.slice(1))?.classList.add('active');

    // Show/hide score badge
    document.getElementById('scoreBadge').style.display = view === 'day' ? '' : 'none';

    // Show/hide hamburger
    const hamburger = document.querySelector('.hamburger');
    if (hamburger) hamburger.style.display = view === 'day' ? '' : 'none';

    switch (view) {
      case 'month':
        MonthView.render(container, this.currentDate);
        document.getElementById('navTitle').textContent = MonthView.getTitle();
        break;
      case 'week':
        WeekView.render(container, this.currentDate);
        document.getElementById('navTitle').textContent = WeekView.getTitle();
        break;
      case 'day':
        DayView.render(container, dateStr(this.currentDate));
        document.getElementById('navTitle').textContent = formatDateLong(this.currentDate);
        this.updateDayTotal(dateStr(this.currentDate));
        break;
      case 'chart':
        ChartView.render(container);
        document.getElementById('navTitle').textContent = ChartView.getTitle();
        break;
    }
  },

  prev() {
    switch (this.currentView) {
      case 'month':
        this.currentDate = MonthView.navigate(-1);
        break;
      case 'week':
        this.currentDate = WeekView.navigate(-1);
        break;
      case 'day':
        this.currentDate.setDate(this.currentDate.getDate() - 1);
        break;
    }
    this.navigate(this.currentView);
  },

  next() {
    switch (this.currentView) {
      case 'month':
        this.currentDate = MonthView.navigate(1);
        break;
      case 'week':
        this.currentDate = WeekView.navigate(1);
        break;
      case 'day':
        this.currentDate.setDate(this.currentDate.getDate() + 1);
        break;
    }
    this.navigate(this.currentView);
  },

  today() {
    this.currentDate = new Date();
    this.navigate(this.currentView);
  },

  goToDay(dayKey) {
    this.currentDate = parseDate(dayKey);
    this.navigate('day');
  },

  updateDayTotal(dayKey) {
    const pts = dayTotalPoints(dayKey);
    const el = document.getElementById('dayTotal');
    if (el) el.textContent = pts % 1 === 0 ? pts : pts.toFixed(1);

    // Update Energiebalans in navbar
    const eb = Stats.getEnergiebalans(dayKey);
    const ebEl = document.getElementById('ebValue');
    if (ebEl) ebEl.textContent = eb % 1 === 0 ? eb : eb.toFixed(1);
  },

  // ---- Modal ----
  openModal(opts = {}) {
    const modal = document.getElementById('modal');
    const titleEl = document.getElementById('modalTitle');
    const selectEl = document.getElementById('actSelect');
    const startEl = document.getElementById('actStart');
    const durEl = document.getElementById('actDuration');
    const delBtn = document.getElementById('btnDelete');
    const previewEl = document.getElementById('previewPoints');

    titleEl.textContent = opts.editing ? 'Activiteit bewerken' : 'Activiteit toevoegen';
    selectEl.value = opts.name || '';
    startEl.value = opts.startMinutes != null ? formatTime(opts.startMinutes) : '';
    durEl.value = String(opts.durationMinutes || 30);
    this.updateDurationLabel();
    delBtn.style.display = opts.editing ? 'inline-block' : 'none';
    previewEl.textContent = '';

    if (opts.name) this.updateModalPreview();

    modal.classList.add('open');
  },

  // Duur aanpassen in stappen van 15 min (15 min – 8 uur)
  stepDuration(delta) {
    const el = document.getElementById('actDuration');
    let v = (parseInt(el.value) || 30) + delta;
    v = Math.max(15, Math.min(v, 480));
    el.value = String(v);
    this.updateDurationLabel();
    this.updateModalPreview();
  },

  updateDurationLabel() {
    const el = document.getElementById('actDuration');
    const lbl = document.getElementById('actDurationLabel');
    if (el && lbl) lbl.textContent = formatDuration(parseInt(el.value) || 30);
  },

  closeModal() {
    document.getElementById('modal').classList.remove('open');
  },

  updateModalPreview() {
    const name = document.getElementById('actSelect').value;
    const dur = parseInt(document.getElementById('actDuration').value);
    const el = document.getElementById('previewPoints');
    if (name && activityMap[name]) {
      const pts = calcPoints(name, dur);
      const info = activityMap[name];
      el.textContent = `${info.weight} · ${pts > 0 ? '+' : ''}${pts} punten`;
      const weightVar = { Ontspanning: '--green-text', Licht: '--yellow-text', Gemiddeld: '--orange-text', Zwaar: '--red-text' };
      el.style.color = `var(${weightVar[info.weight]})`;
    } else {
      el.textContent = '';
    }
  },

  saveModal() {
    const name = document.getElementById('actSelect').value;
    const timeStr = document.getElementById('actStart').value;
    const dur = parseInt(document.getElementById('actDuration').value);
    if (!name || !timeStr) return;

    const [h, m] = timeStr.split(':').map(Number);
    const startMins = h * 60 + m;

    if (this.currentView === 'day') {
      DayView.saveFromModal(name, startMins, dur);
    }
    this.closeModal();
  },

  deleteModal() {
    if (this.currentView === 'day') {
      DayView.deleteFromModal();
    }
    this.closeModal();
  },

  openMoreModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'moreModal';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <h2>⋯ Meer</h2>
        <div class="more-actions">
          <button class="btn btn-secondary" onclick="ExcelExport.exportAll()">📥 Exporteer naar Excel</button>
          <button class="btn btn-secondary" onclick="exportDataAsJSON()">💾 Backup downloaden (JSON)</button>
          <label class="btn btn-secondary more-import">
            📂 Herstel uit backup
            <input type="file" accept=".json" style="display:none" onchange="importDataFromFile(this)">
          </label>
        </div>
        <h3 class="more-subtitle">🎯 Basisniveau</h3>
        <div class="baseline-row">
          <div class="duration-stepper">
            <button type="button" class="dur-btn" onclick="App.stepBaseline(-1)" aria-label="Basis 1 lager">−</button>
            <span class="dur-display" id="baselineValue">${getBaseline(todayStr())}</span>
            <button type="button" class="dur-btn" onclick="App.stepBaseline(1)" aria-label="Basis 1 hoger">+</button>
          </div>
          <button class="btn btn-primary" onclick="App.saveBaseline()">Opslaan</button>
        </div>
        <p class="baseline-hint">Geldt vanaf vandaag — eerdere dagen behouden hun oude basis (ook in de grafiek).</p>
        <h3 class="more-subtitle">🔄 Synchronisatie</h3>
        ${Sync.renderSyncPanel()}
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('moreModal').remove()">Sluiten</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  stepBaseline(delta) {
    const el = document.getElementById('baselineValue');
    if (!el) return;
    let v = (parseInt(el.textContent) || DEFAULT_BASELINE) + delta;
    v = Math.max(5, Math.min(v, 60));
    el.textContent = String(v);
  },

  saveBaseline() {
    const el = document.getElementById('baselineValue');
    if (!el) return;
    const v = parseInt(el.textContent);
    if (!v) return;
    setBaselineFrom(v);
    document.getElementById('moreModal')?.remove();
    this.navigate(this.currentView);
    if (typeof Toast !== 'undefined') Toast.show(`🎯 Basisniveau ${v} — geldt vanaf vandaag`);
  },

  openSyncModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'syncModal';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <h2>🔄 Synchronisatie</h2>
        ${Sync.renderSyncPanel()}
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('syncModal').remove()">Sluiten</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },
};

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  Sync.init();
  App.init();
});
