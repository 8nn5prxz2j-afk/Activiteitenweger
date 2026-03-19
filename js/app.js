// ============================================
// App — Routing, Navigation & Init
// ============================================

const App = {
  currentView: 'month', // 'month' | 'week' | 'day'
  currentDate: new Date(),

  init() {
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
    this.navigate('month', startDate);

    // Now-line timer
    setInterval(() => {
      if (this.currentView === 'day') DayView.updateNowLine();
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
      </div>
      <span class="score-badge" id="scoreBadge" style="display:none">
        Dagtotaal: <span id="dayTotal">0</span> pt
        <span id="ebBadge" style="margin-left:8px;opacity:0.8">| EB: <span id="ebValue">0</span></span>
      </span>
      <button class="nav-export-btn" onclick="ExcelExport.exportAll()">📥 Excel</button>
    `;
  },

  navigate(view, date) {
    if (date) this.currentDate = new Date(date);
    this.currentView = view;

    const container = document.getElementById('appBody');

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
    delBtn.style.display = opts.editing ? 'inline-block' : 'none';
    previewEl.textContent = '';

    if (opts.name) this.updateModalPreview();

    modal.classList.add('open');
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
      const colors = weightColors[info.weight];
      el.style.color = colors.text;
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
};

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
