// ============================================
// Month View
// ============================================

const MonthView = {
  year: null,
  month: null, // 0-indexed

  render(container, refDate) {
    this.year = refDate.getFullYear();
    this.month = refDate.getMonth();

    const today = todayStr();
    const firstDay = new Date(this.year, this.month, 1);
    const startOffset = nlDayIndex(firstDay); // 0=Mon
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();

    // Start from Monday of first week
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startOffset);

    // Build 6 rows of 7 days
    let cellsHtml = '';
    // Day headers
    NL_DAYS_SHORT.forEach(d => {
      cellsHtml += `<div class="month-day-header">${d}</div>`;
    });

    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = dateStr(d);
      const isOther = d.getMonth() !== this.month;
      const isToday = key === today;
      const acts = getDayActivities(key);
      const pts = acts.reduce((s, a) => s + calcPoints(a.name, a.durationMinutes), 0);

      // Show up to 3 activities
      let actsHtml = '';
      const shown = acts.slice(0, 3);
      shown.forEach(a => {
        const info = activityMap[a.name];
        if (!info) return;
        const col = weightColors[info.weight];
        actsHtml += `<div class="month-act-dot" style="background:${col.bg};color:${col.text}">${a.name}</div>`;
      });
      if (acts.length > 3) {
        actsHtml += `<div class="month-act-dot" style="color:#999">+${acts.length - 3} meer</div>`;
      }

      // Total badge
      let badgeHtml = '';
      if (pts !== 0) {
        let badgeBg, badgeColor;
        if (pts < 0) { badgeBg = '#E8F5E9'; badgeColor = '#2E7D32'; }
        else if (pts <= 10) { badgeBg = '#FFF9C4'; badgeColor = '#F57F17'; }
        else if (pts <= 20) { badgeBg = '#FFE0B2'; badgeColor = '#E65100'; }
        else { badgeBg = '#FFCDD2'; badgeColor = '#C62828'; }
        badgeHtml = `<span class="month-total-badge" style="background:${badgeBg};color:${badgeColor}">${pts > 0 ? '+' : ''}${pts % 1 === 0 ? pts : pts.toFixed(1)}</span>`;
      }

      cellsHtml += `<div class="month-cell ${isOther ? 'other-month' : ''} ${isToday ? 'today' : ''}"
        onclick="App.goToDay('${key}')">
        <div class="month-day-num">${d.getDate()}</div>
        ${badgeHtml}
        <div class="month-activities">${actsHtml}</div>
      </div>`;
    }

    container.innerHTML = `
      <div class="month-view">
        <div class="month-grid">${cellsHtml}</div>
        <div class="month-stats-area">${Stats.renderOverviewTable()}</div>
      </div>
    `;
  },

  getTitle() {
    if (this.month === null) return '';
    return `${NL_MONTHS[this.month]} ${this.year}`;
  },

  navigate(dir) {
    return new Date(this.year, this.month + dir, 1);
  },
};
