// ============================================
// Week View
// ============================================

const WeekView = {
  weekStart: null, // Monday Date object

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

    // Header
    let headerHtml = '<div class="week-header-corner"></div>';
    days.forEach(d => {
      const key = dateStr(d);
      const pts = dayTotalPoints(key);
      const isToday = key === today;
      headerHtml += `<div class="week-header-cell ${isToday ? 'today' : ''}" onclick="App.goToDay('${key}')">
        <div class="day-name">${NL_DAYS_SHORT[nlDayIndex(d)]}</div>
        <div class="day-num">${d.getDate()}</div>
        ${pts !== 0 ? `<div class="day-pts">${pts > 0 ? '+' : ''}${pts % 1 === 0 ? pts : pts.toFixed(1)} pt</div>` : ''}
      </div>`;
    });

    // Time labels + grid
    let timesHtml = '';
    for (let h = START_HOUR; h < END_HOUR; h++) {
      for (let q = 0; q < 4; q++) {
        const label = q === 0 ? `${String(h).padStart(2,'0')}:00` : '';
        timesHtml += `<div class="week-time-label">${label}</div>`;
      }
    }

    // Day columns with activities
    let colsHtml = '';
    days.forEach(d => {
      const key = dateStr(d);
      const acts = getDayActivities(key);

      // Hour lines
      let linesHtml = '';
      for (let h = START_HOUR; h < END_HOUR; h++) {
        for (let q = 0; q < 4; q++) {
          const top = ((h - START_HOUR) * 4 + q) * SLOT_HEIGHT;
          linesHtml += `<div class="week-hour-line ${q === 0 ? 'full-hour' : ''}" style="top:${top}px"></div>`;
        }
      }

      // Activity blocks
      let blocksHtml = '';
      acts.forEach(act => {
        const info = activityMap[act.name];
        if (!info) return;
        const top = ((act.startMinutes - START_HOUR * 60) / 15) * SLOT_HEIGHT;
        const height = Math.max((act.durationMinutes / 15) * SLOT_HEIGHT, 12);
        blocksHtml += `<div class="week-block cat-${info.weight}" style="top:${top}px;height:${height}px"
          onclick="App.goToDay('${key}')" title="${act.name} (${formatDuration(act.durationMinutes)})">
          ${height >= 16 ? act.name : ''}
        </div>`;
      });

      // Energy marker
      const energyMins = getEnergyMarker(key);
      let energyHtml = '';
      if (energyMins !== null) {
        const eTop = ((energyMins - START_HOUR * 60) / 15) * SLOT_HEIGHT;
        energyHtml = `<div class="week-energy-line" style="top:${eTop}px" title="⚡ Energiepeil op"></div>`;
      }

      colsHtml += `<div class="week-day-col" style="height:${totalSlots * SLOT_HEIGHT}px"
        onclick="App.goToDay('${key}')">${linesHtml}${blocksHtml}${energyHtml}</div>`;
    });

    container.innerHTML = `
      <div class="week-view">
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

    // Scroll to ~9:00
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
