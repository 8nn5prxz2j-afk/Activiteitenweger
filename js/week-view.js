// ============================================
// Week View
// ============================================

const WeekView = {
  weekStart: null, // Monday Date object

  // Helper: formatteer punten met + teken en 1 decimaal waar nodig
  _fmtPts(pts) {
    const s = pts % 1 === 0 ? String(pts) : pts.toFixed(1);
    return (pts > 0 ? '+' : '') + s;
  },

  // Kies vulkleur op basis van verhouding t.o.v. budget
  // (zelfde drempels als de energie-gauge in de dag-view: 80% / 100%)
  _fillColor(ratio) {
    if (ratio <= 0.8) return 'var(--green)';
    if (ratio <= 1) return 'var(--orange)';
    return 'var(--red)';
  },

  render(container, refDate) {
    this.weekStart = getMonday(refDate);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const today = todayStr();
    const totalSlots = (END_HOUR - START_HOUR) * 4;

    // ---- Week-samenvattingsbalk ----
    let weekBudget = 0;
    let weekActual = 0;
    let weekPlanned = 0;
    days.forEach(d => {
      const key = dateStr(d);
      weekBudget  += getBaseline(key);
      weekActual  += dayTotalPoints(key);
      weekPlanned += dayPlannedPoints(key);
    });
    const weekTotal = weekActual + weekPlanned;
    const weekOver  = weekTotal > weekBudget;

    // Breedte-berekening voor voortgangsbalk (geclampt op 100%)
    const wActPct  = weekBudget > 0 ? Math.min(weekActual  / weekBudget * 100, 100) : 0;
    const wPlanPct = weekBudget > 0 ? Math.min(weekPlanned / weekBudget * 100, Math.max(0, 100 - wActPct)) : 0;
    const wFillColor = this._fillColor(weekBudget > 0 ? weekActual / weekBudget : 0);

    // Detail-tekst: werkelijk + optioneel gepland / budget
    let wsbDetail = `${this._fmtPts(weekActual)} werkelijk`;
    if (weekPlanned !== 0) {
      // Geen extra plusteken: het " + " in de tekst is al het verbindingsteken
      wsbDetail += ` + ${weekPlanned % 1 === 0 ? weekPlanned : weekPlanned.toFixed(1)} gepland`;
    }
    wsbDetail += ` / ${weekBudget} budget`;

    const wsbWarnHtml = weekOver
      ? `<div class="wsb-warn">&#9888;&#xFE0F; Boven weekbudget</div>`
      : '';

    const weekSummaryHtml = `
      <div class="week-summary-bar">
        <div class="wsb-row">
          <span class="wsb-label">Week</span>
          <span class="wsb-detail">${wsbDetail}</span>
        </div>
        <div class="wsb-bar">
          <div class="wsb-fill"       style="width:${wActPct}%;background:${wFillColor}"></div>
          <div class="wsb-fill-planned" style="left:${wActPct}%;width:${wPlanPct}%;background:${wFillColor}"></div>
        </div>
        ${wsbWarnHtml}
        <button class="wsb-plan-btn" onclick="Planner.open()">📅 Slim inplannen</button>
      </div>`;

    // ---- Dagheaders ----
    let headerHtml = '<div class="week-header-corner"></div>';
    days.forEach(d => {
      const key   = dateStr(d);
      const pts   = dayTotalPoints(key);
      const plan  = dayPlannedPoints(key);
      const rem   = dayRemainingPoints(key);
      const base  = getBaseline(key);
      const acts  = getDayActivities(key);
      const isToday = key === today;

      // Kleurklasse op basis van energiebudget
      // Neutraal als er helemaal geen blokken zijn
      let budgetClass = '';
      if (acts.length > 0) {
        if (pts + plan > base) {
          budgetClass = 'budget-over';
        } else if (base > 0 && rem <= base * 0.2) {
          budgetClass = 'budget-warn';
        } else {
          budgetClass = 'budget-ok';
        }
      }

      // Klasse voor de "vrij"-regel
      let freeClass = 'day-free';
      if (budgetClass === 'budget-over') freeClass += ' free-over';
      else if (budgetClass === 'budget-warn') freeClass += ' free-warn';
      else if (budgetClass === 'budget-ok')   freeClass += ' free-ok';

      // Punten-regels
      const ptsHtml  = pts !== 0
        ? `<div class="day-pts">${this._fmtPts(pts)} pt</div>`
        : '';
      const planHtml = plan !== 0
        ? `<div class="day-planned">&#x25A6; ${this._fmtPts(plan)} gepland</div>`
        : '';
      // "vrij"-regel alleen tonen als er minstens iets gepland of werkelijk is
      const remHtml  = acts.length > 0
        ? `<div class="${freeClass}">${rem % 1 === 0 ? rem : rem.toFixed(1)} vrij</div>`
        : '';

      headerHtml += `<div class="week-header-cell ${isToday ? 'today' : ''} ${budgetClass}" onclick="App.goToDay('${key}')">
        <div class="day-name">${NL_DAYS_SHORT[nlDayIndex(d)]}</div>
        <div class="day-num">${d.getDate()}</div>
        ${ptsHtml}${planHtml}${remHtml}
      </div>`;
    });

    // ---- Tijdlabels ----
    let timesHtml = '';
    for (let h = START_HOUR; h < END_HOUR; h++) {
      for (let q = 0; q < 4; q++) {
        const label = q === 0 ? `${String(h).padStart(2,'0')}:00` : '';
        timesHtml += `<div class="week-time-label">${label}</div>`;
      }
    }

    // ---- Dagkolommen met activiteiten ----
    let colsHtml = '';
    days.forEach(d => {
      const key  = dateStr(d);
      const acts = getDayActivities(key);

      // Uurlijnen
      let linesHtml = '';
      for (let h = START_HOUR; h < END_HOUR; h++) {
        for (let q = 0; q < 4; q++) {
          const top = ((h - START_HOUR) * 4 + q) * SLOT_HEIGHT;
          linesHtml += `<div class="week-hour-line ${q === 0 ? 'full-hour' : ''}" style="top:${top}px"></div>`;
        }
      }

      // Activiteitsblokken — geplande blokken krijgen klasse 'planned'
      let blocksHtml = '';
      acts.forEach(act => {
        const info = activityMap[act.name];
        if (!info) return;
        const top    = ((act.startMinutes - START_HOUR * 60) / 15) * SLOT_HEIGHT;
        const height = Math.max((act.durationMinutes / 15) * SLOT_HEIGHT, 12);
        const plannedClass = isPlanned(act) ? ' planned' : '';
        blocksHtml += `<div class="week-block cat-${info.weight}${plannedClass}" style="top:${top}px;height:${height}px"
          onclick="App.goToDay('${key}')" title="${act.name} (${formatDuration(act.durationMinutes)})">
          ${height >= 16 ? act.name : ''}
        </div>`;
      });

      // Energiemarker
      const energyMins = getEnergyMarker(key);
      let energyHtml = '';
      if (energyMins !== null) {
        const eTop = ((energyMins - START_HOUR * 60) / 15) * SLOT_HEIGHT;
        energyHtml = `<div class="week-energy-line" style="top:${eTop}px" title="&#x26A1; Energiepeil op"></div>`;
      }

      colsHtml += `<div class="week-day-col" style="height:${totalSlots * SLOT_HEIGHT}px"
        onclick="App.goToDay('${key}')">${linesHtml}${blocksHtml}${energyHtml}</div>`;
    });

    container.innerHTML = `
      <div class="week-view">
        ${weekSummaryHtml}
        <div class="week-inner">
          <div class="week-header">${headerHtml}</div>
          <div class="week-body">
            <div class="week-grid">
              <div class="week-times">${timesHtml}</div>
              ${colsHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    // Scroll naar ~9:00
    const body = container.querySelector('.week-body');
    if (body) {
      const target = ((9 - START_HOUR) * 4) * SLOT_HEIGHT - 50;
      body.scrollTop = Math.max(0, target);
    }
  },

  getTitle() {
    if (!this.weekStart) return '';
    const end = new Date(this.weekStart);
    end.setDate(end.getDate() + 6);
    const wn = getWeekNumber(this.weekStart);
    return `Week ${wn} · ${formatDateShort(this.weekStart)} – ${formatDateShort(end)} ${end.getFullYear()}`;
  },

  navigate(dir) {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() + dir * 7);
    return d;
  },
};
