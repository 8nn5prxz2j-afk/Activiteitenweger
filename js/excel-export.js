// ============================================
// Excel Export (uses SheetJS / xlsx library)
// ============================================

const ExcelExport = {

  exportAll() {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS library wordt geladen... Probeer opnieuw.');
      return;
    }

    const allData = getAllData();
    const days = Object.keys(allData).sort();

    if (days.length === 0) {
      alert('Geen opgeslagen dagen om te exporteren.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Create a sheet per day
    days.forEach((dayKey, idx) => {
      const acts = allData[dayKey];
      const date = parseDate(dayKey);
      const dayName = NL_DAYS_LONG[nlDayIndex(date)];
      const dayNum = date.getDate();
      const monthName = NL_MONTHS[date.getMonth()];

      // Sheet name: "Dag X - Weekdag D mnd"
      const sheetName = `Dag ${idx + 1} - ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum} ${monthName.substring(0,3)}`;
      // Excel sheet names max 31 chars
      const safeName = sheetName.substring(0, 31);

      const energyMins = getEnergyMarker(dayKey);
      const ws = this.createDaySheet(acts, dayName, dayNum, monthName, date.getFullYear(), dayKey, energyMins);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });

    // Add categories sheet
    const catSheet = this.createCategoriesSheet();
    XLSX.utils.book_append_sheet(wb, catSheet, 'Categorieën & Weging');

    // Download
    XLSX.writeFile(wb, 'activiteitenweger_export.xlsx');
  },

  createDaySheet(acts, dayName, dayNum, monthName, year, dayKey, energyMins) {
    const rows = [];

    // Header rows (matching original Excel format)
    rows.push(['Tijdschrijflijst', null, null, null, 'VOORBEREIDINGSOPDRACHT DEEL A.']);
    rows.push([`Naam:  Niels`]);
    rows.push([`Datum:  ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum} ${monthName}`]);
    rows.push([]);
    rows.push(['Tijd', null, 'ACTIVITEIT', 'Tijdsduur', 'Ontsp.', 'Licht', 'Gemiddeld', 'Zwaar', 'Punten']);

    // Sort activities by start time
    const sorted = [...acts].sort((a, b) => a.startMinutes - b.startMinutes);
    let energyMarkerInserted = false;

    // Activity rows (with energy marker inserted at correct position)
    sorted.forEach(act => {
      const info = activityMap[act.name];
      if (!info) return;

      // Insert energy marker row before this activity if marker falls here
      if (energyMins !== null && !energyMarkerInserted && act.startMinutes >= energyMins) {
        const subtotal = calcPointsUntil(dayKey, energyMins);
        const fmtSub = subtotal % 1 === 0 ? subtotal : subtotal.toFixed(1);
        rows.push([`⚡  ENERGIEPEIL OP  —  Subtotaal tot hier:  ${fmtSub} punten`, null, null, null, null, null, null, null, subtotal]);
        energyMarkerInserted = true;
      }

      const pts = calcPoints(act.name, act.durationMinutes);
      const timeStr = formatTime(act.startMinutes);
      const durStr = formatDuration(act.durationMinutes);

      const row = [
        timeStr,
        null,
        act.name,
        durStr,
        info.weight === 'Ontspanning' ? '✓' : null,
        info.weight === 'Licht' ? '✓' : null,
        info.weight === 'Gemiddeld' ? '✓' : null,
        info.weight === 'Zwaar' ? '✓' : null,
        pts,
      ];
      rows.push(row);
    });

    // If marker is after all activities
    if (energyMins !== null && !energyMarkerInserted) {
      const subtotal = calcPointsUntil(dayKey, energyMins);
      const fmtSub = subtotal % 1 === 0 ? subtotal : subtotal.toFixed(1);
      rows.push([`⚡  ENERGIEPEIL OP  —  Subtotaal tot hier:  ${fmtSub} punten`, null, null, null, null, null, null, null, subtotal]);
    }

    // Day total row
    const total = acts.reduce((s, a) => s + calcPoints(a.name, a.durationMinutes), 0);
    rows.push(['DAGTOTAAL', null, null, null, null, null, null, null, total]);

    // Footer
    rows.push([]);
    rows.push(['Activiteitenweger© 2014, Revalidatiegeneeskunde, ergotherapie, Meander Medisch Centrum']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 8 },  // A: Tijd
      { wch: 3 },  // B: empty
      { wch: 45 }, // C: Activiteit
      { wch: 10 }, // D: Tijdsduur
      { wch: 8 },  // E: Ontsp.
      { wch: 8 },  // F: Licht
      { wch: 10 }, // G: Gemiddeld
      { wch: 8 },  // H: Zwaar
      { wch: 8 },  // I: Punten
    ];

    return ws;
  },

  createCategoriesSheet() {
    const rows = [];
    rows.push(['Activiteitenweger — Categorieën & Weging']);
    rows.push(['Ontspanning = groen (-1 pt/½u)  |  Licht = geel (+1 pt/½u)  |  Gemiddeld = oranje (+2 pt/½u)  |  Zwaar = rood (+3 pt/½u)']);
    rows.push([]);
    rows.push(['CATEGORIE', 'WEGING', 'PUNTEN PER ½ UUR']);

    categories.forEach(cat => {
      rows.push([cat.group]);
      cat.items.forEach(item => {
        rows.push([item.name, item.weight, `${item.ptsPerHalf > 0 ? '+' : ''}${item.ptsPerHalf}`]);
      });
      rows.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 45 },
      { wch: 15 },
      { wch: 18 },
    ];
    return ws;
  },
};
