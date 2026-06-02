// ============================================
// Day View
// ============================================

const DayView = {
  activities: [],
  dayKey: null,
  editingId: null,
  dragActivity: null,
  resizing: null,
  placingEnergyMarker: false,

  render(container, dayKey) {
    this.dayKey = dayKey;

    // Een lopende activiteit van een vorige dag (vergeten te stoppen) afsluiten
    const r = getRunning();
    if (r && r.dayKey !== todayStr()) this.commitRunning();

    this.activities = getDayActivities(dayKey);

    container.innerHTML = `
      <div class="day-view-wrap">
      <div class="quicklog-bar" id="quicklogBar"></div>
      <div class="day-layout">
        <div class="sidebar" id="sidebar">
          <div class="sidebar-toolbar">
            <button class="btn btn-secondary" onclick="DayView.clearDay()">Dag wissen</button>
            <button class="energy-btn" id="energyBtn" onclick="DayView.toggleEnergyMode()">⚡ Energiepeil</button>
          </div>
          <div id="dayStatsPanel"></div>
          <div id="categoryList"></div>
        </div>
        <div class="sidebar-overlay" id="sidebarOverlay" onclick="DayView.toggleSidebar()"></div>
        <div class="timeline-container" id="timelineContainer">
          <div class="timeline" id="timeline"></div>
        </div>
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
      div.onmousedown = (e) => DayView.startMove(e, act.id);
      div.onclick = (e) => {
        e.stopPropagation();
        if (DayView.justDragged) return;
        if (DayView.placingEnergyMarker) {
          const rect = div.getBoundingClientRect();
          const relY = e.clientY - rect.top;
          const slotsIntoBlock = Math.floor(relY / SLOT_HEIGHT);
          const minutes = act.startMinutes + slotsIntoBlock * 15;
          DayView.placeEnergyMarker(minutes);
          return;
        }
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

    // Render lopende ("live") activiteit
    this.renderRunningBlock();

    // Render energy marker
    this.renderEnergyMarker();

    // Quick-log balk bijwerken (favorieten + lopende status)
    this.renderQuickLog();

    // Update stats panel
    const statsEl = document.getElementById('dayStatsPanel');
    if (statsEl) statsEl.innerHTML = Stats.renderStatsPanel(this.dayKey);

    App.updateDayTotal(this.dayKey);
  },

  // ---- Quick-log balk: favorieten + live tracker ----
  renderQuickLog() {
    const el = document.getElementById('quicklogBar');
    if (!el) return;
    const isToday = this.dayKey === todayStr();
    const r = getRunning();
    const running = (r && r.dayKey === this.dayKey) ? r : null;

    let html = this.renderEnergyGauge();

    // Lege dag: bied een laagdrempelige start aan
    if (this.activities.length === 0 && !running) {
      const prev = getPreviousDayWithData(this.dayKey);
      html += `
        <div class="day-starter">
          <span class="ds-label">Lege dag — snel beginnen?</span>
          <button class="ds-btn" onclick="DayView.fillStandardDay()">📋 Standaarddag</button>
          ${prev ? `<button class="ds-btn" onclick="DayView.copyPreviousDay()">📑 Neem ${formatDateShort(parseDate(prev))} over</button>` : ''}
        </div>`;
    }

    if (running) {
      const dur = Math.max(nowRoundedMinutes() - running.startMinutes, 15);
      html += `
        <div class="ql-running">
          <span class="ql-running-dot"></span>
          <span class="ql-running-text">Bezig: <strong>${running.name}</strong> · sinds ${formatTime(running.startMinutes)} (${formatDuration(dur)})</span>
          <button class="ql-stop" onclick="DayView.stopLive()">■ Klaar</button>
        </div>`;
    }

    html += '<div class="ql-tiles">';
    getFavorites().forEach(name => {
      const info = activityMap[name];
      if (!info) return;
      const safe = name.replace(/'/g, "\\'");
      const active = running && running.name === name ? 'ql-active' : '';
      html += `<button class="ql-tile weight-${info.weight} ${active}" onclick="DayView.quickLog('${safe}')">${name}</button>`;
    });
    html += `<button class="ql-tile ql-more" onclick="DayView.openOtherModal()">+ Andere…</button>`;
    html += '</div>';

    if (isToday && !running) {
      html += `<div class="ql-hint">Tik op een activiteit om nu te starten — bij je volgende tik stopt de vorige vanzelf.</div>`;
    } else if (!isToday) {
      html += `<div class="ql-hint">Tik op een activiteit om een blok van 30 min toe te voegen.</div>`;
    }

    el.innerHTML = html;
  },

  renderRunningBlock() {
    const r = getRunning();
    if (!r || r.dayKey !== this.dayKey) return;
    const info = activityMap[r.name];
    if (!info) return;
    const timeline = document.getElementById('timeline');
    if (!timeline) return;

    const nowM = Math.max(nowRoundedMinutes(), r.startMinutes + 15);
    const dur = nowM - r.startMinutes;
    const top = ((r.startMinutes - START_HOUR * 60) / 15) * SLOT_HEIGHT;
    const height = (dur / 15) * SLOT_HEIGHT;
    const pts = calcPoints(r.name, dur);

    const div = document.createElement('div');
    div.className = `activity-block cat-${info.weight} live`;
    div.style.top = top + 'px';
    div.style.height = Math.max(height, 24) + 'px';
    div.onclick = (e) => { e.stopPropagation(); DayView.stopLive(); };
    div.innerHTML = `
      <span class="act-name">▶ ${r.name}</span>
      ${height >= 36 ? `<span class="act-meta">bezig sinds ${formatTime(r.startMinutes)} · ${formatDuration(dur)} · ${pts > 0 ? '+' : ''}${pts} pt · tik om te stoppen</span>` : ''}
    `;
    timeline.appendChild(div);
  },

  // Eén-tik loggen vanuit de favorieten
  quickLog(name) {
    if (this.dayKey === todayStr()) {
      this.startLive(name);
    } else {
      // Vorige dag: snel een blok van 30 min achteraan toevoegen
      let start = this.activities.length > 0
        ? this.activities[this.activities.length - 1].startMinutes + this.activities[this.activities.length - 1].durationMinutes
        : 9 * 60;
      if (start < START_HOUR * 60) start = START_HOUR * 60;
      if (start > END_HOUR * 60 - 30) start = END_HOUR * 60 - 30;
      this.activities.push({ id: 'act_' + Date.now(), name, startMinutes: start, durationMinutes: 30 });
      this.activities.sort((a, b) => a.startMinutes - b.startMinutes);
      this.save();
      this.renderActivities();
    }
  },

  openOtherModal() {
    this.editingId = null;
    const start = this.dayKey === todayStr() ? nowRoundedMinutes() : null;
    App.openModal(start != null ? { startMinutes: start } : {});
  },

  // Start een lopende activiteit "nu"; sluit een eventuele vorige vanzelf af
  startLive(name) {
    this.commitRunning();
    setRunning({ dayKey: todayStr(), name, startMinutes: nowRoundedMinutes() });
    this.activities = getDayActivities(this.dayKey);
    this.renderActivities();
  },

  // Sluit de lopende activiteit af en zet ze als blok in de dag
  stopLive() {
    this.commitRunning();
    this.activities = getDayActivities(this.dayKey);
    this.renderActivities();
  },

  // Zet de lopende activiteit om naar een opgeslagen blok
  commitRunning() {
    const r = getRunning();
    if (!r) return;
    const endLimit = END_HOUR * 60;
    let endM = (r.dayKey === todayStr()) ? nowRoundedMinutes() : endLimit;
    if (endM > endLimit) endM = endLimit;
    let dur = endM - r.startMinutes;
    if (dur < 15) dur = 15;
    if (r.startMinutes + dur > endLimit) dur = endLimit - r.startMinutes;
    if (dur >= 15) {
      const acts = getDayActivities(r.dayKey);
      acts.push({ id: 'act_' + Date.now(), name: r.name, startMinutes: r.startMinutes, durationMinutes: dur });
      acts.sort((a, b) => a.startMinutes - b.startMinutes);
      saveDayActivities(r.dayKey, acts);
    }
    setRunning(null);
  },

  // ---- Energie-meter (dagtotaal t.o.v. basis 20) ----
  renderEnergyGauge() {
    const baseline = 20;
    const scaleMax = 40; // basis ligt op 50%
    const total = dayTotalPoints(this.dayKey);
    const fillPct = Math.max(0, Math.min(total / scaleMax * 100, 100));
    let color = 'var(--green)';
    if (total > baseline) color = 'var(--red)';
    else if (total > baseline * 0.8) color = 'var(--orange)';
    const diff = total - baseline;
    const diffStr = diff > 0 ? `+${this.fmtPts(diff)} boven basis` : `${this.fmtPts(-diff)} onder basis`;
    const diffColor = diff > 0 ? 'var(--red)' : 'var(--green)';

    return `
      <div class="energy-gauge">
        <div class="eg-head">
          <span class="eg-title">🔋 Dagenergie</span>
          <span class="eg-val">${this.fmtPts(total)} <span class="eg-base">/ ${baseline} basis</span></span>
        </div>
        <div class="eg-bar">
          <div class="eg-fill" style="width:${fillPct}%;background:${color}"></div>
          <div class="eg-marker" style="left:${baseline / scaleMax * 100}%" title="Basis ${baseline}"></div>
        </div>
        <div class="eg-diff" style="color:${diffColor}">${diffStr}</div>
      </div>`;
  },

  fmtPts(n) {
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  },

  // ---- Standaarddag invullen ----
  fillStandardDay() {
    if (this.activities.length > 0 &&
        !confirm('Deze dag bevat al activiteiten. Toch de standaardblokken toevoegen?')) return;
    STANDARD_DAY.forEach((b, i) => {
      this.activities.push({ id: 'act_' + Date.now() + '_' + i, name: b.name, startMinutes: b.startMinutes, durationMinutes: b.durationMinutes });
    });
    this.activities.sort((a, b) => a.startMinutes - b.startMinutes);
    this.save();
    this.renderActivities();
  },

  // ---- Vorige dag overnemen ----
  copyPreviousDay() {
    const prev = getPreviousDayWithData(this.dayKey);
    if (!prev) { alert('Geen eerdere dag met gegevens gevonden.'); return; }
    if (this.activities.length > 0 &&
        !confirm('Deze dag bevat al activiteiten. Toch de blokken van de vorige dag toevoegen?')) return;
    getDayActivities(prev).forEach((a, i) => {
      this.activities.push({ id: 'act_' + Date.now() + '_' + i, name: a.name, startMinutes: a.startMinutes, durationMinutes: a.durationMinutes });
    });
    this.activities.sort((a, b) => a.startMinutes - b.startMinutes);
    this.save();
    this.renderActivities();
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

  toggleEnergyMode() {
    const existing = getEnergyMarker(this.dayKey);
    if (existing !== null) {
      if (confirm('Wil je de energiepeil-markering verwijderen?')) {
        this.removeEnergyMarker();
      }
      return;
    }
    this.placingEnergyMarker = !this.placingEnergyMarker;
    document.getElementById('energyBtn')?.classList.toggle('active', this.placingEnergyMarker);
    document.getElementById('timeline')?.classList.toggle('energy-placing', this.placingEnergyMarker);
  },

  placeEnergyMarker(minutes) {
    setEnergyMarker(this.dayKey, minutes);
    this.placingEnergyMarker = false;
    document.getElementById('energyBtn')?.classList.remove('active');
    document.getElementById('timeline')?.classList.remove('energy-placing');
    this.renderActivities();
  },

  removeEnergyMarker() {
    setEnergyMarker(this.dayKey, null);
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
    if (this.placingEnergyMarker) {
      this.placeEnergyMarker(minutes);
      return;
    }
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

  // ---- Verplaatsen (slepen op de tijdlijn, desktop) ----
  startMove(e, id) {
    if (e.button !== 0) return;              // alleen linkermuisknop
    if (this.placingEnergyMarker) return;    // niet slepen tijdens energiepeil plaatsen
    const act = this.activities.find(a => a.id === id);
    if (!act) return;

    const startY = e.clientY;
    const origStart = act.startMinutes;
    let moved = false;

    const onMove = (ev) => {
      const diff = ev.clientY - startY;
      if (!moved && Math.abs(diff) < 4) return; // klik-tolerantie
      moved = true;
      const slotsDiff = Math.round(diff / SLOT_HEIGHT);
      let newStart = origStart + slotsDiff * 15;
      newStart = Math.max(START_HOUR * 60, Math.min(newStart, END_HOUR * 60 - act.durationMinutes));
      act.startMinutes = newStart;
      this.renderActivities();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) {
        this.activities.sort((a, b) => a.startMinutes - b.startMinutes);
        this.save();
        this.justDragged = true; // onderdruk de klik die hierna komt
        setTimeout(() => { this.justDragged = false; }, 0);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
      this.justDragged = true; // onderdruk de klik na het resizen
      setTimeout(() => { this.justDragged = false; }, 0);
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
