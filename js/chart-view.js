// ============================================
// Chart View — Dagtotaal over tijd
// ============================================

const ChartView = {
  chart: null,
  mode: 'day', // 'day' or 'week'

  initialRender: true,

  render(container) {
    const days = getSavedDays();

    // Auto-switch to week mode only on first render
    if (this.initialRender && days.length > 28) {
      this.mode = 'week';
      this.initialRender = false;
    }

    container.innerHTML = `
      <div class="chart-view">
        <div class="chart-toolbar">
          <div class="chart-mode-toggle">
            <button class="chart-mode-btn ${this.mode === 'day' ? 'active' : ''}" onclick="ChartView.setMode('day')">Per dag</button>
            <button class="chart-mode-btn ${this.mode === 'week' ? 'active' : ''}" onclick="ChartView.setMode('week')">Per week</button>
          </div>
          <div class="chart-summary" id="chartSummary"></div>
        </div>
        <div class="chart-canvas-wrapper">
          <canvas id="dagtotaalChart"></canvas>
        </div>
      </div>
    `;

    this.renderChart();
    this.renderSummary(days);
  },

  setMode(mode) {
    this.mode = mode;
    const container = document.getElementById('appBody');
    this.render(container);
  },

  getTitle() {
    return 'Grafiek — Dagtotaal';
  },

  renderSummary(days) {
    const el = document.getElementById('chartSummary');
    if (!el || days.length === 0) return;

    const totals = days.map(d => dayTotalPoints(d));
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    const latest = totals[totals.length - 1];
    const baseline = 20;

    const fmtAvg = avg % 1 === 0 ? avg : avg.toFixed(1);
    const fmtLatest = latest % 1 === 0 ? latest : latest.toFixed(1);
    const diff = avg - baseline;
    const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    const diffColor = diff <= 0 ? '#4CAF50' : '#f44336';

    el.innerHTML = `
      <div class="chart-stat">
        <span class="chart-stat-value">${fmtAvg}</span>
        <span class="chart-stat-label">Gem. dagtotaal</span>
      </div>
      <div class="chart-stat">
        <span class="chart-stat-value">${fmtLatest}</span>
        <span class="chart-stat-label">Laatst</span>
      </div>
      <div class="chart-stat">
        <span class="chart-stat-value" style="color:${diffColor}">${diffStr}</span>
        <span class="chart-stat-label">vs. basis (20)</span>
      </div>
      <div class="chart-stat">
        <span class="chart-stat-value">${days.length}</span>
        <span class="chart-stat-label">Dagen</span>
      </div>
    `;
  },

  renderChart() {
    const canvas = document.getElementById('dagtotaalChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const data = this.mode === 'day' ? this.getDayData() : this.getWeekData();
    if (data.labels.length === 0) return;

    const ctx = canvas.getContext('2d');
    const baseline = 20;

    // Bar colors: green if <= baseline, red if > baseline
    const barColors = data.values.map(v => v <= baseline ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)');
    const barBorders = data.values.map(v => v <= baseline ? '#4CAF50' : '#f44336');

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: this.mode === 'day' ? 'Dagtotaal' : 'Week gem.',
            data: data.values,
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: 1,
            borderRadius: 4,
            order: 2,
          },
          {
            label: 'Lopend gemiddelde',
            data: data.runningAvg,
            type: 'line',
            borderColor: '#1a237e',
            backgroundColor: 'rgba(26, 35, 126, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#1a237e',
            tension: 0.3,
            fill: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16 },
          },
          annotation: {
            annotations: {
              baseline: {
                type: 'line',
                yMin: baseline,
                yMax: baseline,
                borderColor: '#FF9800',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: `Basisniveau (${baseline})`,
                  position: 'start',
                  backgroundColor: '#FF9800',
                  color: 'white',
                  font: { size: 11, weight: 'bold' },
                  padding: 4,
                },
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { size: 11 } },
            title: {
              display: true,
              text: 'Punten',
              font: { size: 12, weight: 'bold' },
            },
          },
        },
      },
    });
  },

  getDayData() {
    const days = getSavedDays();
    const labels = [];
    const values = [];
    const runningAvg = [];
    let sum = 0;

    days.forEach((dayKey, i) => {
      const date = parseDate(dayKey);
      const dayName = NL_DAYS_SHORT[nlDayIndex(date)];
      labels.push(`${dayName} ${date.getDate()}/${date.getMonth() + 1}`);

      const pts = dayTotalPoints(dayKey);
      values.push(pts);
      sum += pts;
      runningAvg.push(Math.round((sum / (i + 1)) * 10) / 10);
    });

    return { labels, values, runningAvg };
  },

  getWeekData() {
    const days = getSavedDays();
    if (days.length === 0) return { labels: [], values: [], runningAvg: [] };

    // Group days by ISO week, track first date per week
    const weeks = {};
    const weekFirstDate = {};
    days.forEach(dayKey => {
      const date = parseDate(dayKey);
      const wk = getWeekNumber(date);
      const yr = date.getFullYear();
      const key = `${yr}-W${wk}`;
      if (!weeks[key]) {
        weeks[key] = [];
        weekFirstDate[key] = date;
      }
      weeks[key].push(dayTotalPoints(dayKey));
    });

    const labels = [];
    const values = [];
    const runningAvg = [];
    let totalSum = 0;
    let totalCount = 0;

    Object.keys(weeks).sort().forEach(weekKey => {
      const pts = weeks[weekKey];
      const avg = pts.reduce((s, v) => s + v, 0) / pts.length;
      const monday = getMonday(weekFirstDate[weekKey]);
      labels.push(`${monday.getDate()}/${monday.getMonth() + 1}`);
      values.push(Math.round(avg * 10) / 10);
      totalSum += avg;
      totalCount++;
      runningAvg.push(Math.round((totalSum / totalCount) * 10) / 10);
    });

    return { labels, values, runningAvg };
  },
};
