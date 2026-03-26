// ============================================
// Activiteitenweger — Data & Storage Module
// ============================================

const STORAGE_KEY = 'activiteitenweger_data';
const START_HOUR = 6;
const END_HOUR = 24;
const SLOT_HEIGHT = 30; // px per 15 min

// Activity categories and weights
const categories = [
  { group: "🚗 Verplaatsingen", items: [
    { name: "Autorijden (licht verkeer)", weight: "Licht", ptsPerHalf: 1 },
    { name: "Autorijden (druk verkeer)", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Autorijden (file)", weight: "Zwaar", ptsPerHalf: 3 },
    { name: "Motorrit", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Meerijden / passieve verplaatsing", weight: "Licht", ptsPerHalf: 1 },
  ]},
  { group: "🛋️ Rusten", items: [
    { name: "Rusten zetel", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Rusten zetel — muziek", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Rusten zetel — tv", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Rusten bed", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Rusten bed — muziek", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Rusten bed — tv", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Rusten donkere kamer", weight: "Ontspanning", ptsPerHalf: -1 },
  ]},
  { group: "🎮 Gamen", items: [
    { name: "Gamen", weight: "Licht", ptsPerHalf: 1 },
  ]},
  { group: "📺 Tv kijken", items: [
    { name: "Tv kijken licht", weight: "Ontspanning", ptsPerHalf: -1 },
    { name: "Tv kijken gemiddeld", weight: "Licht", ptsPerHalf: 1 },
    { name: "Tv kijken zwaar", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Lezen (boek/iPad)", weight: "Licht", ptsPerHalf: 1 },
  ]},
  { group: "🎵 Muziek luisteren", items: [
    { name: "Muziek luisteren", weight: "Ontspanning", ptsPerHalf: -1 },
  ]},
  { group: "🚶 Beweging", items: [
    { name: "Wandelen", weight: "Zwaar", ptsPerHalf: 3 },
    { name: "Wandelen met Milo", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Revalidatie", weight: "Zwaar", ptsPerHalf: 3 },
  ]},
  { group: "🍽️ Verzorging & routine", items: [
    { name: "Ochtendritueel", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Middageten", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Avondeten", weight: "Zwaar", ptsPerHalf: 3 },
    { name: "Eten maken", weight: "Zwaar", ptsPerHalf: 3 },
    { name: "Uit eten gaan", weight: "Zwaar", ptsPerHalf: 3 },
  ]},
  { group: "👥 Sociaal", items: [
    { name: "Sociaal bezoek", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Sociaal actief licht cognitief", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Sociaal actief zwaar cognitief", weight: "Zwaar", ptsPerHalf: 3 },
  ]},
  { group: "🏥 Medisch", items: [
    { name: "Medisch bezoek", weight: "Gemiddeld", ptsPerHalf: 2 },
  ]},
  { group: "💼 Werk", items: [
    { name: "Vrijwilligerswerk", weight: "Zwaar", ptsPerHalf: 3 },
    { name: "Fysiek werk", weight: "Zwaar", ptsPerHalf: 3 },
    { name: "Cognitief werk licht", weight: "Gemiddeld", ptsPerHalf: 2 },
    { name: "Cognitief werk analyse / hyperfocus", weight: "Zwaar", ptsPerHalf: 3 },
  ]},
];

// Flat lookup map
const activityMap = {};
categories.forEach(c => c.items.forEach(i => { activityMap[i.name] = i; }));

// Weight colors
const weightColors = {
  Ontspanning: { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32', badge: '#C8E6C9' },
  Licht:       { bg: '#FFF8E1', border: '#FFC107', text: '#F57F17', badge: '#FFF9C4' },
  Gemiddeld:   { bg: '#FFF3E0', border: '#FF9800', text: '#E65100', badge: '#FFE0B2' },
  Zwaar:       { bg: '#FFEBEE', border: '#f44336', text: '#C62828', badge: '#FFCDD2' },
};

// ---- Utility functions ----

function calcPoints(name, durationMinutes) {
  const act = activityMap[name];
  if (!act) return 0;
  return act.ptsPerHalf * (durationMinutes / 30);
}

function formatDuration(mins) {
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return h + 'u';
  return h + 'u' + String(m).padStart(2, '0');
}

function formatTime(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function dateStr(date) {
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayTotalPoints(dayKey) {
  const acts = getDayActivities(dayKey);
  return acts.reduce((sum, a) => sum + calcPoints(a.name, a.durationMinutes), 0);
}

// ---- Storage ----

function getAllData() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

function saveAllData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDayActivities(dayKey) {
  return getAllData()[dayKey] || [];
}

function saveDayActivities(dayKey, activities) {
  const data = getAllData();
  if (activities.length === 0) {
    delete data[dayKey];
  } else {
    data[dayKey] = activities;
  }
  saveAllData(data);
}

function getSavedDays() {
  return Object.keys(getAllData()).sort();
}

// ---- Energy Marker Storage ----
const ENERGY_STORAGE_KEY = 'activiteitenweger_energy';

function getEnergyMarker(dayKey) {
  const data = JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}');
  return data[dayKey] ?? null; // returns minutes or null
}

function setEnergyMarker(dayKey, minutes) {
  const data = JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}');
  if (minutes === null) {
    delete data[dayKey];
  } else {
    data[dayKey] = minutes;
  }
  localStorage.setItem(ENERGY_STORAGE_KEY, JSON.stringify(data));
}

function calcPointsUntil(dayKey, untilMinutes) {
  const acts = getDayActivities(dayKey);
  let total = 0;
  acts.forEach(a => {
    // Include activity if it ends at or before the marker
    const actEnd = a.startMinutes + a.durationMinutes;
    if (actEnd <= untilMinutes) {
      total += calcPoints(a.name, a.durationMinutes);
    } else if (a.startMinutes < untilMinutes) {
      // Partially overlapping: count the portion before the marker
      const partialDur = untilMinutes - a.startMinutes;
      total += calcPoints(a.name, partialDur);
    }
  });
  return total;
}

// ---- Date helpers ----

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const NL_DAYS_SHORT = ['ma','di','wo','do','vr','za','zo'];
const NL_DAYS_LONG = ['maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag','zondag'];

function nlDayIndex(date) {
  // JS: 0=Sun, convert to 0=Mon
  return (date.getDay() + 6) % 7;
}

function formatDateLong(date) {
  return `${NL_DAYS_LONG[nlDayIndex(date)]} ${date.getDate()} ${NL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateShort(date) {
  return `${date.getDate()} ${NL_MONTHS[date.getMonth()].substring(0, 3)}`;
}

// ---- Data Import / Export (for sync between devices) ----

function exportDataAsJSON() {
  const data = {
    activities: getAllData(),
    energy: JSON.parse(localStorage.getItem(ENERGY_STORAGE_KEY) || '{}'),
    exportDate: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `activiteitenweger_backup_${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDataFromFile(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // Merge activities (don't overwrite existing days)
      const existing = getAllData();
      let imported = 0;
      for (const [key, acts] of Object.entries(data.activities || {})) {
        if (!existing[key] || existing[key].length === 0) {
          existing[key] = acts;
          imported++;
        }
      }
      saveAllData(existing);

      // Merge energy markers
      for (const [key, mins] of Object.entries(data.energy || {})) {
        if (getEnergyMarker(key) === null) {
          setEnergyMarker(key, mins);
        }
      }

      alert(`Import geslaagd! ${imported} nieuwe dagen toegevoegd.`);

      // Refresh the current view
      App.navigate(App.currentView);
    } catch (err) {
      alert('Fout bij importeren: ongeldig bestand.');
    }
  };
  reader.readAsText(file);
  input.value = ''; // reset for re-import
}
