// ============================================
// Day View
// ============================================

const DayView = {
  activities: [],
  dayKey: null,
  editingId: null,
  dragActivity: null,
  resizing: null,
  render(container, dayKey) {
    this.dayKey = dayKey;
    this.activities = getDayActivities(dayKey);

    // Pre-fill energy time suggestion
    let suggestedTime = '12:00';
    if (this.activities.length > 0) {
      const sorted = [...this.activities].sort((a, b) => a.startMinutes - b.startMinutes);
      const first = sorted[0].startMinutes;
      const last = sorted[sorted.length - 1];
      const mid = Math.round((first + last.startMinutes + last.durationMinutes) / 2 / 15) * 15;
      suggestedTime = formatTime(mid);
    }
    const hasMarker = getEnergyMarker(dayKey) !== null;

    container.innerHTML = `
      <div class="day-layout">
        <div class="sidebar" id="sidebar">
          <div class="sidebar-toolbar">
            <button class="btn btn-secondary" onclick="DayView.clearDay()">Dag wissen</button>
            <button class="energy-btn ${hasMarker ? 'has-marker' : ''}" id="energyBtn" onclick="DayView.toggleEnergyPanel()">⚡ Energiepeil</button>
          </div>
          <div class="energy-panel" id="energyPanel" style="display:none">
            <label>Tijdstip energiepeil:</label>
            <div class="energy-panel-row">
              <input type="time" id="energyTimeInput" step="900" value="${suggestedTime}">
              <button class="btn btn-primary btn-sm" onclick="DayView.placeEnergyFromPicker()">Plaats</button>
              <button class="btn btn-secondary btn-sm" onclick="DayView.closeEnergyPanel()">Annuleer</button>
            </div>
          </div>
          <div id="dayStatsPanel"></div>
          <div id="categoryList"></div>
        </div>
        <div class="sidebar-overlay" id="sidebarOverlay" onclick="DayView.toggleSidebar()"></div>
        <div class="timeline-container" id="timelineContainer">
          <div class="timeline" id="timeline"></div>
        </div>
      </div>
    `;

    this.renderCategories();
    this.renderTimeline();
    this.renderActivities();
    this.updateNowLine();
    this.scrollToRelevant();
  },

  renderCategories() {
    const el = document.getElementById('categoryList');
    let html = '';
    categories.forEach(cat => {
      html += `<div class="cat-group"><div class="cat-header">${cat.group}</div>`;
      cat.items.forEach(item => {
        const safeName = item.name.replace(/'/g, "\\'");
        html += `<div class="cat-item weight-${item.weight}" draggable="true"
          data-activity="${item.name}"
          ondragstart="DayView.onDragStart(event, '${safeName}')"
          onclick="DayView.quickAdd('${safeName}')"
        >
          <span>${item.name}</span>
          <span class="weight-badge">${item.ptsPerHalf > 0 ? '+' : ''}${item.ptsPerHalf}/½u</span>
        </div>`;
      });
      html += '</div>';
    });
    el.innerHTML = html;
  },

  renderTimeline() {
    const el = document.getElementById('timeline');
    let html = '';
    for (let h = START_HOUR; h < END_HOUR; h++) {
      for (let q = 0; q < 4; q++) {
        const mins = h * 60 + q * 15;
        const isHour = q === 0;
        const timeStr = isHour ? `${String(h).padStart(2,'0')}:00` : (q === 2 ? `${String(h).padStart(2,'0')}:30` : '');
        html += `<div class="time-slot" data-minutes="${mins}">
          <div class="time-label ${isHour ? 'hour' : ''}">${timeStr}</div>
          <div class="slot-area ${isHour ? 'hour-line' : ''}"
            ondragover="DayView.onDragOver(event)"
            ondragleave="DayView.onDragLeave(event)"
            ondrop="DayView.onDrop(event, ${mins})"
            onclick="DayView.onSlotClick(event, ${mins})"
          ></div>
        </div>`;
      }
    }
    html += '<div class="now-line" id="nowLine" style="display:none"></div>';
    el.innerHTML = html;
  },

  renderActivities() {
    document.querySelectorAll('.activity-block, .energy-marker').forEach(el => el.remove());
    const timeline = document.getElementById('timeline');
    if (!timeline) return;

    this.activities.forEach(act => {
      const info = activityMap[act.name];
      if (!info) return;
      const top = ((act.startMinutes - START_HOUR * 60) / 15) * SLOT_HEIGHT;
      const height = (act.durationMinutes / 15) * SLOT_HEIGHT;
      const pts = calcPoints(act.name, act.durationMinutes);

      const div = document.createElement('div');
      div.className = `activity-block cat-${info.weight}`;
      div.style.top = top + 'px';
      div.style.height = Math.max(height, 24) + 'px';
      div.onclick = (e) => {
        e.stopPropagation();
        DayView.openEditModal(act.id);
      };

      const meta = `${formatTime(act.startMinutes)} – ${formatTime(act.startMinutes + act.durationMinutes)} · ${formatDuration(act.durationMinutes)} · ${pts > 0 ? '+' : ''}${pts} pt`;

      div.innerHTML = `
        <span class="act-name">${act.name}</span>
        ${height >= 36 ? `<span class="act-meta">${meta}</span>` : ''}
        <button class="act-delete" onclick="event.stopPropagation();DayView.deleteActivityById('${act.id}')" title="Verwijderen">×</button>
        <div class="resize-handle" onmousedown="DayView.startResize(event, '${act.id}')"></div>
      `;
      timeline.appendChild(div);
    });

    // Render energy marker
    this.renderEnergyMarker();

    // Update stats panel
    const statsEl = document.getElementById('dayStatsPanel');
    if (statsEl) statsEl.innerHTML = Stats.renderStatsPanel(this.dayKey);

    App.updateDayTotal(this.dayKey);
  },

  renderEnergyMarker() {
    const timeline = document.getElementById('timeline');
    if (!timeline) return;

    const markerMins = getEnergyMarker(this.dayKey);
    if (markerMins === null) return;

    const top = ((markerMins - START_HOUR * 60) / 15) * SLOT_HEIGHT;
    const subtotal = calcPointsUntil(this.dayKey, markerMins);
    const fmtPts = subtotal % 1 === 0 ? subtotal : subtotal.toFixed(1);

    const marker = document.createElement('div');
    marker.className = 'energy-marker';
    marker.style.top = top + 'px';
    marker.innerHTML = `
      <div class="energy-marker-label" title="Klik om te verwijderen">
        ⚡ Energiepeil op ${formatTime(markerMins)} — Subtotaal: ${fmtPts} punten
        <span class="energy-marker-remove" onclick="DayView.removeEnergyMarker()">✕</span>
      </div>
      <div class="energy-marker-line"></div>
    `;
    timeline.appendChild(marker);
  },

  toggleEnergyPanel() {
    const existing = getEnergyMarker(this.dayKey);
    if (existing !== null) {
      if (confirm('Wil je de energiepeil-markering verwijderen?')) {
        this.removeEnergyMarker();
      }
      return;
    }
    const panel = document.getElementById('energyPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  },

  placeEnergyFromPicker() {
    const timeInput = document.getElementById('energyTimeInput');
    const [h, m] = timeInput.value.split(':').map(Number);
    const minutes = h * 60 + m;
    setEnergyMarker(this.dayKey, minutes);
    document.getElementById('energyPanel').style.display = 'none';
    document.getElementById('energyBtn')?.classList.add('has-marker');
    this.renderActivities();
  },

  closeEnergyPanel() {
    document.getElementById('energyPanel').style.display = 'none';
  },

  removeEnergyMarker() {
    setEnergyMarker(this.dayKey, null);
    document.getElementById('energyBtn')?.classList.remove('has-marker');
    this.renderActivities();
  },

  updateNowLine() {
    const el = document.getElementById('nowLine');
    if (!el) return;
    if (this.dayKey !== todayStr()) { el.style.display = 'none'; return; }
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins >= START_HOUR * 60 && mins < END_HOUR * 60) {
      el.style.top = ((mins - START_HOUR * 60) / 15) * SLOT_HEIGHT + 'px';
      el.style.display = 'block';
    }
  },

  scrollToRelevant() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;
    // Scroll to first activity, or current time, or 9:00
    let targetMins;
    if (this.activities.length > 0) {
      targetMins = this.activities[0].startMinutes;
    } else if (this.dayKey === todayStr()) {
      const now = new Date();
      targetMins = now.getHours() * 60 + now.getMinutes();
    } else {
      targetMins = 9 * 60;
    }
    const target = Math.max(0, ((targetMins - START_HOUR * 60) / 15) * SLOT_HEIGHT - 100);
    container.scrollTop = target;
  },

  // ---- Drag & Drop ----
  onDragStart(e, name) {
    this.dragActivity = name;
    e.dataTransfer.setData('text/plain', name);
  },

  onDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drop-target');
  },

  onDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
  },

  onDrop(e, minutes) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');
    if (!this.dragActivity) return;
    this.activities.push({ id: 'act_' + Date.now(), name: this.dragActivity, startMinutes: minutes, durationMinutes: 30 });
    this.activities.sort((a, b) => a.startMinutes - b.startMinutes);
    this.dragActivity = null;
    this.save();
    this.renderActivities();
  },

  // ---- Slot click ----
  onSlotClick(e, minutes) {
    if (e.target.closest('.activity-block') || e.target.closest('.energy-marker')) return;
    this.editingId = null;
    App.openModal({ startMinutes: minutes });
  },

  quickAdd(name) {
    let startMins;
    if (this.activities.length > 0) {
      const last = this.activities[this.activities.length - 1];
      startMins = last.startMinutes + last.durationMinutes;
    } else {
      const now = new Date();
      startMins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
    }
    if (startMins < START_HOUR * 60) startMins = START_HOUR * 60;

    this.editingId = null;
    App.openModal({ name, startMinutes: startMins });

    // Close sidebar on mobile
    if (window.innerWidth <= 768) this.toggleSidebar();
  },

  openEditModal(id) {
    const act = this.activities.find(a => a.id === id);
    if (!act) return;
    this.editingId = id;
    App.openModal({ name: act.name, startMinutes: act.startMinutes, durationMinutes: act.durationMinutes, editing: true });
  },

  saveFromModal(name, startMins, dur) {
    if (this.editingId) {
      const act = this.activities.find(a => a.id === this.editingId);
      if (act) { act.name = name; act.startMinutes = startMins; act.durationMinutes = dur; }
    } else {
      this.activities.push({ id: 'act_' + Date.now(), name, startMinutes: startMins, durationMinutes: dur });
    }
    this.activities.sort((a, b) => a.startMinutes - b.startMinutes);
    this.editingId = null;
    this.save();
    this.renderActivities();
  },

  deleteFromModal() {
    if (this.editingId) {
      this.activities = this.activities.filter(a => a.id !== this.editingId);
      this.editingId = null;
      this.save();
      this.renderActivities();
    }
  },

  deleteActivityById(id) {
    this.activities = this.activities.filter(a => a.id !== id);
    this.save();
    this.renderActivities();
  },

  // ---- Resize ----
  startResize(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const act = this.activities.find(a => a.id === id);
    this.resizing = { id, startY: e.clientY, origDur: act.durationMinutes };

    const onMove = (ev) => {
      const diff = ev.clientY - this.resizing.startY;
      const slotsDiff = Math.round(diff / SLOT_HEIGHT);
      const act = this.activities.find(a => a.id === this.resizing.id);
      if (act) {
        act.durationMinutes = Math.max(15, this.resizing.origDur + slotsDiff * 15);
        this.renderActivities();
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.resizing = null;
      this.save();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  clearDay() {
    if (!confirm('Wil je alle activiteiten van deze dag wissen?')) return;
    this.activities = [];
    this.save();
    this.renderActivities();
  },

  save() {
    saveDayActivities(this.dayKey, this.activities);
  },

  toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebarOverlay')?.classList.toggle('open');
  },
};
