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
        actsHtml += `<div class="month-act-dot weight-chip-${info.weight}">${a.name}</div>`;
      });
      if (acts.length > 3) {
        actsHtml += `<div class="month-act-dot month-act-more">+${acts.length - 3} meer</div>`;
      }

      // Total badge — drempels relatief aan de basis van díe dag
      let badgeHtml = '';
      if (pts !== 0) {
        const base = getBaseline(key);
        let badgeClass;
        if (pts < 0) badgeClass = 'badge-neg';
        else if (pts <= base / 2) badgeClass = 'badge-low';
        else if (pts <= base) badgeClass = 'badge-mid';
        else badgeClass = 'badge-high';
        badgeHtml = `<span class="month-total-badge ${badgeClass}">${pts > 0 ? '+' : ''}${pts % 1 === 0 ? pts : pts.toFixed(1)}</span>`;
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
        <div class="stats-toggle-area">
          <button class="stats-toggle-btn" onclick="MonthView.toggleStats()">
            📊 Statistieken <span id="statsArrow">▶</span>
          </button>
          <div class="stats-collapsible" id="monthStats" style="display:none">
            ${Stats.renderOverviewTable()}
          </div>
        </div>
      </div>
    `;
  },

  getTitle() {
    if (this.month === null) return '';
    return `${NL_MONTHS[this.month]} ${this.year}`;
  },

  toggleStats() {
    const el = document.getElementById('monthStats');
    const arrow = document.getElementById('statsArrow');
    if (el.style.display === 'none') {
      el.style.display = 'block';
      arrow.textContent = '▼';
    } else {
      el.style.display = 'none';
      arrow.textContent = '▶';
    }
  },

  navigate(dir) {
    return new Date(this.year, this.month + dir, 1);
  },
};
