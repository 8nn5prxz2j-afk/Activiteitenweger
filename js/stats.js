// ============================================
// Stats — Running averages & Energiebalans
// ============================================

const Stats = {

  // Get the "effective" score for a day: the LOWEST of dagtotaal and energy subtotaal
  // This is the "Energiebalans" — represents your real capacity
  getEnergiebalans(dayKey) {
    const total = dayTotalPoints(dayKey);
    const energyMins = getEnergyMarker(dayKey);
    if (energyMins !== null) {
      const energySub = calcPointsUntil(dayKey, energyMins);
      return Math.min(total, energySub);
    }
    return total;
  },

  // Get all days sorted chronologically
  getAllDaysSorted() {
    return getSavedDays().sort();
  },

  // Running average of dagtotalen up to and including dayKey
  runningAvgDagtotaal(dayKey) {
    const days = this.getAllDaysSorted().filter(d => d <= dayKey);
    if (days.length === 0) return 0;
    const sum = days.reduce((s, d) => s + dayTotalPoints(d), 0);
    return sum / days.length;
  },

  // Running average of Energiebalans up to and including dayKey
  runningAvgEnergiebalans(dayKey) {
    const days = this.getAllDaysSorted().filter(d => d <= dayKey);
    if (days.length === 0) return 0;
    const sum = days.reduce((s, d) => s + this.getEnergiebalans(d), 0);
    return sum / days.length;
  },

  // Weekly average Energiebalans for the week containing dayKey
  weekAvgEnergiebalans(dayKey) {
    const date = parseDate(dayKey);
    const dayOfWeek = (date.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(date);
    monday.setDate(monday.getDate() - dayOfWeek);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const key = dateStr(d);
      if (getDayActivities(key).length > 0) {
        weekDays.push(key);
      }
    }
    if (weekDays.length === 0) return null;
    const sum = weekDays.reduce((s, d) => s + this.getEnergiebalans(d), 0);
    return sum / weekDays.length;
  },

  // Get stats summary for a specific day
  getDaySummary(dayKey) {
    const dagtotaal = dayTotalPoints(dayKey);
    const energyMins = getEnergyMarker(dayKey);
    const energySub = energyMins !== null ? calcPointsUntil(dayKey, energyMins) : null;
    const energiebalans = this.getEnergiebalans(dayKey);
    const runAvgTotal = this.runningAvgDagtotaal(dayKey);
    const runAvgEB = this.runningAvgEnergiebalans(dayKey);
    const weekAvgEB = this.weekAvgEnergiebalans(dayKey);

    return { dagtotaal, energySub, energiebalans, runAvgTotal, runAvgEB, weekAvgEB };
  },

  // Format number nicely
  fmt(n) {
    if (n === null || n === undefined) return '—';
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  },

  // Render stats panel HTML (for use in day view or month view)
  renderStatsPanel(dayKey) {
    const s = this.getDaySummary(dayKey);

    return `
      <div class="stats-panel">
        <div class="stats-title">📊 Statistieken</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${this.fmt(s.dagtotaal)}</div>
            <div class="stat-label">Dagtotaal</div>
          </div>
          <div class="stat-card ${s.energySub !== null ? '' : 'stat-na'}">
            <div class="stat-value">${s.energySub !== null ? this.fmt(s.energySub) : '—'}</div>
            <div class="stat-label">⚡ Bij energiestreep</div>
          </div>
          <div class="stat-card stat-highlight">
            <div class="stat-value">${this.fmt(s.energiebalans)}</div>
            <div class="stat-label">Energiebalans</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.fmt(s.runAvgTotal)}</div>
            <div class="stat-label">Gem. dagtotaal</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.fmt(s.runAvgEB)}</div>
            <div class="stat-label">Gem. energiebalans</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${s.weekAvgEB !== null ? this.fmt(s.weekAvgEB) : '—'}</div>
            <div class="stat-label">Week gem. EB</div>
          </div>
        </div>
      </div>
    `;
  },

  // Render a full overview stats table (for month view)
  renderOverviewTable() {
    const days = this.getAllDaysSorted();
    if (days.length === 0) return '<div class="stats-panel"><p style="color:#999">Nog geen data</p></div>';

    let rows = '';
    let currentWeekLabel = '';

    days.forEach(dayKey => {
      const date = parseDate(dayKey);
      const weekNum = getWeekNumber(date);
      const weekLabel = `Week ${weekNum}`;

      // Week separator
      if (weekLabel !== currentWeekLabel) {
        const weekEB = this.weekAvgEnergiebalans(dayKey);
        rows += `<tr class="stats-week-row">
          <td colspan="5">${weekLabel} — Gem. Energiebalans: <strong>${this.fmt(weekEB)}</strong></td>
        </tr>`;
        currentWeekLabel = weekLabel;
      }

      const s = this.getDaySummary(dayKey);
      const dayName = NL_DAYS_SHORT[nlDayIndex(date)];

      rows += `<tr class="stats-day-row" onclick="App.goToDay('${dayKey}')">
        <td class="stats-date">${dayName} ${date.getDate()}/${date.getMonth()+1}</td>
        <td class="stats-num">${this.fmt(s.dagtotaal)}</td>
        <td class="stats-num">${s.energySub !== null ? this.fmt(s.energySub) : '—'}</td>
        <td class="stats-num stats-eb">${this.fmt(s.energiebalans)}</td>
        <td class="stats-num stats-avg">${this.fmt(s.runAvgEB)}</td>
      </tr>`;
    });

    return `
      <div class="stats-panel stats-overview">
        <div class="stats-title">📊 Overzicht — Alle dagen</div>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Dag</th>
              <th>Dagtotaal</th>
              <th>⚡ Streep</th>
              <th>Energiebalans</th>
              <th>Gem. EB</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },
};

// Helper: get ISO week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
