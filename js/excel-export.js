// ============================================
// Excel Export — Styled output matching original Excel format
// Uses xlsx-js-style for cell formatting
// ============================================

const ExcelExport = {

  // Color constants matching original Excel
  FILLS: {
    gray:    { fgColor: { rgb: 'FFD0D0D0' } },
    white:   { fgColor: { rgb: 'FFFFFFFF' } },
    zebra:   { fgColor: { rgb: 'FFF2F2F2' } },
    energy:  { fgColor: { rgb: 'FFC00000' } },
    blue:    { fgColor: { rgb: 'FFDDEBF7' } },
    green:   { fgColor: { rgb: 'FFC6EFCE' } },
    yellow:  { fgColor: { rgb: 'FFFFEB9C' } },
    orange:  { fgColor: { rgb: 'FFFFCC99' } },
    red:     { fgColor: { rgb: 'FFFFC7CE' } },
  },

  weightToFill: {
    Ontspanning: 'green',
    Licht: 'yellow',
    Gemiddeld: 'orange',
    Zwaar: 'red',
  },

  mkFont(opts = {}) {
    return {
      name: 'Arial',
      sz: opts.sz || 10,
      bold: !!opts.bold,
      color: { rgb: opts.color || 'FF000000' },
    };
  },

  mkBorder(sides) {
    const b = {};
    for (const [side, style] of Object.entries(sides)) {
      b[side] = { style, color: { auto: 1 } };
    }
    return b;
  },

  setCell(ws, r, c, value, style) {
    const ref = XLSX.utils.encode_cell({ r, c });
    const cell = { v: value, s: style || {} };
    if (typeof value === 'number') cell.t = 'n';
    else cell.t = 's';
    ws[ref] = cell;
  },

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

    days.forEach((dayKey, idx) => {
      const acts = allData[dayKey];
      const date = parseDate(dayKey);
      const dayName = NL_DAYS_LONG[nlDayIndex(date)];
      const dayNum = date.getDate();
      const monthName = NL_MONTHS[date.getMonth()];
      const sheetName = `Dag ${idx + 1}`;
      const energyMins = getEnergyMarker(dayKey);
      const ws = this.createDaySheet(acts, dayName, dayNum, monthName, date.getFullYear(), dayKey, energyMins);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const catSheet = this.createCategoriesSheet();
    XLSX.utils.book_append_sheet(wb, catSheet, 'Categorieën & Weging');

    XLSX.writeFile(wb, 'activiteitenweger_export.xlsx');
  },

  createDaySheet(acts, dayName, dayNum, monthName, year, dayKey, energyMins) {
    const ws = {};
    let r = 0; // 0-indexed row

    const F = this.FILLS;
    const headerBorder = this.mkBorder({ top: 'medium', left: 'medium', right: 'medium' });
    const dataBorderThin = this.mkBorder({ top: 'thin', left: 'thin', right: 'thin' });
    const dataBorderFirst = this.mkBorder({ top: 'medium', left: 'thin', right: 'thin' });

    // --- Row 0: Title ---
    this.setCell(ws, 0, 0, 'Tijdschrijflijst', {
      font: this.mkFont({ sz: 11, bold: true }),
      fill: F.white,
      alignment: { horizontal: 'left' },
    });
    this.setCell(ws, 0, 4, 'VOORBEREIDINGSOPDRACHT DEEL A.', {
      font: this.mkFont({ bold: true }),
      fill: F.white,
      alignment: { horizontal: 'center' },
    });

    // --- Row 1: Naam ---
    this.setCell(ws, 1, 0, `Naam:  Niels`, {
      font: this.mkFont(),
      fill: F.white,
      alignment: { horizontal: 'left' },
    });

    // --- Row 2: Datum ---
    this.setCell(ws, 2, 0, `Datum:  ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum} ${monthName}`, {
      font: this.mkFont(),
      fill: F.white,
      alignment: { horizontal: 'left' },
    });

    // --- Row 3: Instruction ---
    this.setCell(ws, 3, 0, 'Weging nog niet invullen!', {
      font: this.mkFont({ bold: true }),
      fill: F.gray,
      alignment: { horizontal: 'center' },
    });

    // --- Row 4: Column headers ---
    const headers = ['Tijd', '', 'ACTIVITEIT', 'Tijdsduur', 'Ontsp.', 'Licht', 'Gemiddeld', 'Zwaar', 'Punten'];
    headers.forEach((h, c) => {
      this.setCell(ws, 4, c, h || '', {
        font: this.mkFont({ bold: true }),
        fill: F.gray,
        alignment: { horizontal: 'center' },
        border: headerBorder,
      });
    });

    // --- Data rows ---
    r = 5;
    const sorted = [...acts].sort((a, b) => a.startMinutes - b.startMinutes);
    let energyMarkerInserted = false;
    let dataRowIdx = 0;

    const writeActivityRow = (act) => {
      const info = activityMap[act.name];
      if (!info) return;

      const pts = calcPoints(act.name, act.durationMinutes);
      const isOdd = dataRowIdx % 2 === 0; // first data row = zebra
      const rowFill = isOdd ? F.zebra : F.white;
      const border = dataRowIdx === 0 ? dataBorderFirst : dataBorderThin;
      const baseStyle = { font: this.mkFont(), fill: rowFill, border };

      // Time (col A)
      this.setCell(ws, r, 0, formatTime(act.startMinutes), { ...baseStyle, alignment: { horizontal: 'center' } });
      // Col B empty
      this.setCell(ws, r, 1, '', { ...baseStyle });
      // Activity name (col C)
      this.setCell(ws, r, 2, act.name, { ...baseStyle, alignment: { horizontal: 'left' } });
      // Duration (col D)
      this.setCell(ws, r, 3, formatDuration(act.durationMinutes), { ...baseStyle, alignment: { horizontal: 'center' } });

      // Checkmark cells (cols E-H)
      const weights = ['Ontspanning', 'Licht', 'Gemiddeld', 'Zwaar'];
      weights.forEach((w, i) => {
        const col = 4 + i;
        if (info.weight === w) {
          this.setCell(ws, r, col, '✓', {
            font: this.mkFont({ bold: true }),
            fill: F[this.weightToFill[w]],
            alignment: { horizontal: 'center' },
            border,
          });
        } else {
          this.setCell(ws, r, col, '', { font: this.mkFont(), fill: rowFill, border });
        }
      });

      // Points (col I)
      this.setCell(ws, r, 8, pts, {
        font: this.mkFont({ bold: true }),
        fill: F[this.weightToFill[info.weight]],
        alignment: { horizontal: 'center' },
        border,
      });

      r++;
      dataRowIdx++;
    };

    const writeEnergyRow = () => {
      const subtotal = calcPointsUntil(dayKey, energyMins);
      const fmtSub = subtotal % 1 === 0 ? subtotal : subtotal.toFixed(1);
      const eStyle = {
        font: this.mkFont({ bold: true, color: 'FFFFFFFF' }),
        fill: F.energy,
        alignment: { horizontal: 'center' },
        border: this.mkBorder({ top: 'medium', bottom: 'medium', left: 'medium' }),
      };
      const eStyleR = {
        font: this.mkFont({ sz: 11, bold: true, color: 'FFFFFFFF' }),
        fill: F.energy,
        alignment: { horizontal: 'center' },
        border: this.mkBorder({ top: 'medium', bottom: 'medium', right: 'medium' }),
      };

      this.setCell(ws, r, 0, `⚡  ENERGIEPEIL OP  —  Subtotaal tot hier:  ${fmtSub} punten`, eStyle);
      // Fill middle cells with energy background
      for (let c = 1; c <= 7; c++) {
        this.setCell(ws, r, c, '', {
          fill: F.energy,
          border: this.mkBorder({ top: 'medium', bottom: 'medium' }),
        });
      }
      this.setCell(ws, r, 8, subtotal, eStyleR);
      r++;
    };

    sorted.forEach(act => {
      if (energyMins !== null && !energyMarkerInserted && act.startMinutes >= energyMins) {
        writeEnergyRow();
        energyMarkerInserted = true;
      }
      writeActivityRow(act);
    });

    if (energyMins !== null && !energyMarkerInserted) {
      writeEnergyRow();
    }

    // --- DAGTOTAAL row ---
    const total = acts.reduce((s, a) => s + calcPoints(a.name, a.durationMinutes), 0);
    const totStyle = {
      font: this.mkFont({ sz: 11, bold: true }),
      fill: F.gray,
      alignment: { horizontal: 'right' },
      border: this.mkBorder({ top: 'medium', bottom: 'medium', left: 'medium' }),
    };
    this.setCell(ws, r, 0, 'DAGTOTAAL', totStyle);
    for (let c = 1; c <= 7; c++) {
      this.setCell(ws, r, c, '', {
        fill: F.gray,
        border: this.mkBorder({ top: 'medium', bottom: 'medium' }),
      });
    }
    this.setCell(ws, r, 8, total, {
      font: this.mkFont({ sz: 12, bold: true }),
      fill: F.gray,
      alignment: { horizontal: 'center' },
      border: this.mkBorder({ top: 'medium', bottom: 'medium', right: 'medium' }),
    });
    r++;

    // --- Footer ---
    r++; // blank row
    this.setCell(ws, r, 0, 'Activiteitenweger© 2014, Revalidatiegeneeskunde, ergotherapie, Meander Medisch Centrum', {
      font: this.mkFont({ sz: 8 }),
      fill: F.white,
      border: this.mkBorder({ top: 'medium' }),
    });

    // Set sheet range
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 8 } });

    // Column widths matching original
    ws['!cols'] = [
      { wch: 8 },   // A: Tijd
      { wch: 2 },   // B: spacer
      { wch: 52 },  // C: Activiteit
      { wch: 11 },  // D: Tijdsduur
      { wch: 9 },   // E: Ontsp.
      { wch: 7 },   // F: Licht
      { wch: 11 },  // G: Gemiddeld
      { wch: 8 },   // H: Zwaar
      { wch: 10 },  // I: Punten
    ];

    // Row heights
    ws['!rows'] = [];
    ws['!rows'][3] = { hpt: 17 }; // instruction row
    ws['!rows'][4] = { hpt: 17 }; // header row

    return ws;
  },

  createCategoriesSheet() {
    const ws = {};
    const F = this.FILLS;
    let r = 0;

    // Title
    this.setCell(ws, 0, 0, 'Activiteitenweger — Categorieën & Weging', {
      font: this.mkFont({ sz: 13, bold: true }),
      fill: F.gray,
      alignment: { horizontal: 'center' },
    });

    // Subtitle
    this.setCell(ws, 1, 0, 'Ontspanning = groen (-1 pt/½u)  |  Licht = geel (+1 pt/½u)  |  Gemiddeld = oranje (+2 pt/½u)  |  Zwaar = rood (+3 pt/½u)', {
      font: this.mkFont({ sz: 9 }),
      fill: F.white,
    });

    // Blank row
    r = 3;

    // Column headers
    ['CATEGORIE', 'WEGING', 'PUNTEN PER ½ UUR'].forEach((h, c) => {
      this.setCell(ws, r, c, h, {
        font: this.mkFont({ bold: true }),
        fill: F.gray,
        alignment: { horizontal: 'center' },
      });
    });
    r++;

    // Categories
    categories.forEach(cat => {
      // Group header
      this.setCell(ws, r, 0, cat.group, {
        font: this.mkFont({ bold: true }),
        fill: F.blue,
        alignment: { horizontal: 'left' },
      });
      r++;

      // Items
      cat.items.forEach(item => {
        const fillKey = this.weightToFill[item.weight];
        this.setCell(ws, r, 0, item.name, {
          font: this.mkFont(),
          fill: F.white,
          alignment: { horizontal: 'left' },
        });
        this.setCell(ws, r, 1, item.weight, {
          font: this.mkFont(),
          fill: F[fillKey],
          alignment: { horizontal: 'center' },
        });
        this.setCell(ws, r, 2, `${item.ptsPerHalf > 0 ? '+' : ''}${item.ptsPerHalf}`, {
          font: this.mkFont({ bold: true }),
          fill: F[fillKey],
          alignment: { horizontal: 'center' },
        });
        r++;
      });
      r++; // blank row between groups
    });

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 2 } });
    ws['!cols'] = [{ wch: 45 }, { wch: 18 }, { wch: 25 }];

    return ws;
  },
};
