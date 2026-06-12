// ============================================
// Planner — "Slim inplannen"
// ============================================
// Stelt voor wáár in de komende twee weken een (grote) activiteit het beste
// past, inclusief opsplitsen over meerdere dagen, zodat de gebruiker zijn
// dagelijkse basisniveau niet overschrijdt.

const Planner = {
  HORIZON: 14,          // dagen vooruit (inclusief startdag)
  HEAVY_FRACTION: 0.8,  // een dag is "zwaar" boven 80% van zijn basis

  // ---- Hulp: dag-sleutel verschuiven met n dagen ----
  _addDays(dayKey, n) {
    const d = parseDate(dayKey);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  },

  // Punten per ½u voor een activiteit (defensief: onbekende namen → 0).
  _ptsPerHalf(name) {
    const info = activityMap[name];
    return info ? info.ptsPerHalf : 0;
  },

  // Punten voor een gegeven duur (defensief; calcPoints geeft 0 bij onbekende naam).
  _points(name, minutes) {
    return calcPoints(name, minutes);
  },

  // ---- Capaciteit van de horizon ----
  // Geeft een array {dayKey, remaining, isHeavy} voor de komende HORIZON dagen
  // vanaf fromDayKey (inclusief). remaining = dayRemainingPoints; een dag geldt
  // als zwaar wanneer (werkelijk + gepland) boven HEAVY_FRACTION × basis ligt.
  getCapacity(fromDayKey) {
    const out = [];
    for (let i = 0; i < this.HORIZON; i++) {
      const dayKey = this._addDays(fromDayKey, i);
      const baseline = getBaseline(dayKey);
      const used = dayTotalPoints(dayKey) + dayPlannedPoints(dayKey);
      out.push({
        dayKey,
        remaining: dayRemainingPoints(dayKey),
        baseline,
        used,
        isHeavy: used > this.HEAVY_FRACTION * baseline,
      });
    }
    return out;
  },

  // Wordt een dag "zwaar" als we er extraPts bij optellen?
  _wouldBeHeavy(cap, extraPts) {
    return (cap.used + extraPts) > this.HEAVY_FRACTION * cap.baseline;
  },

  // Geeft true als het plaatsen van extraPts op de dag op index i in de
  // capaciteitslijst twee opeenvolgende zware dagen zou veroorzaken:
  // de dag wordt zwaar én een directe buurdag is al zwaar (of wordt het door
  // een al voorgenomen plaatsing — bijgehouden in plannedHeavy).
  _createsConsecutiveHeavy(caps, i, extraPts, plannedHeavy) {
    if (!this._wouldBeHeavy(caps[i], extraPts)) return false; // deze dag wordt niet zwaar
    const prevHeavy = i > 0 && (caps[i - 1].isHeavy || plannedHeavy.has(i - 1));
    const nextHeavy = i < caps.length - 1 && (caps[i + 1].isHeavy || plannedHeavy.has(i + 1));
    return prevHeavy || nextHeavy;
  },

  // ---- Kernvoorstel ----
  // suggest(name, totalMinutes, fromDayKey) →
  //   { fits: bool, plan: [{dayKey, durationMinutes}], reason: string }
  suggest(name, totalMinutes, fromDayKey) {
    const caps = this.getCapacity(fromDayKey);
    const ptsHalf = this._ptsPerHalf(name);
    const totalPts = this._points(name, totalMinutes);

    // 1. Ontspanning (negatieve punten/½u): past altijd, geen splitsing nodig.
    if (ptsHalf < 0) {
      return {
        fits: true,
        plan: [{ dayKey: caps[0].dayKey, durationMinutes: totalMinutes }],
        reason: 'Ontspanning kost geen energie — ingepland op de eerste dag.',
      };
    }

    // Activiteit zonder gewicht (0 punten/½u, bv. onbekende naam): geen
    // energiebezwaar, plaats gewoon op de eerste dag.
    if (ptsHalf === 0) {
      return {
        fits: true,
        plan: [{ dayKey: caps[0].dayKey, durationMinutes: totalMinutes }],
        reason: 'Deze activiteit kost geen energiepunten — ingepland op de eerste dag.',
      };
    }

    // 2. Past het geheel op één dag? Kies de VROEGSTE dag waar het past
    //    zonder twee opeenvolgende zware dagen te creëren.
    const emptyPlannedHeavy = new Set();
    for (let i = 0; i < caps.length; i++) {
      if (caps[i].remaining < totalPts) continue;                 // te weinig ruimte
      if (this._createsConsecutiveHeavy(caps, i, totalPts, emptyPlannedHeavy)) continue;
      return {
        fits: true,
        plan: [{ dayKey: caps[i].dayKey, durationMinutes: totalMinutes }],
        reason: 'In zijn geheel ingepland op de vroegste dag met genoeg vrije energie.',
      };
    }

    // 3. Past niet op één dag → splitsen in chunks van 30 min over
    //    NIET-opeenvolgende dagen met de meeste ruimte.
    const split = this._splitGreedy(caps, name, totalMinutes, true);
    if (split.remainingMinutes === 0) {
      return {
        fits: true,
        plan: split.plan,
        reason: `Verdeeld over ${split.plan.length} dagen met de meeste vrije energie, zware dagen niet opeenvolgend.`,
      };
    }

    // 3b. Met de zware-dagen-regel lukt geen volledig plan. Probeer of het
    //     zónder die regel wél volledig past — dan leveren we dat, met een
    //     eerlijke waarschuwing.
    const splitNoRule = this._splitGreedy(caps, name, totalMinutes, false);
    if (splitNoRule.remainingMinutes === 0) {
      return {
        fits: true,
        plan: splitNoRule.plan,
        reason: `Verdeeld over ${splitNoRule.plan.length} dagen. Let op: hierdoor komen twee zwaardere dagen na elkaar.`,
      };
    }

    // 4. Niets past volledig binnen de horizon → beste gedeeltelijke plan.
    //    Kies de variant die het meeste van de activiteit kan plaatsen.
    const best = (split.placedMinutes >= splitNoRule.placedMinutes) ? split : splitNoRule;
    return {
      fits: false,
      plan: best.plan,
      reason: 'Past niet volledig binnen 2 weken zonder je basis te overschrijden — dit is het haalbare deel.',
    };
  },

  // Greedy verdeler. Plaatst chunks van veelvouden van 30 min op de dagen met
  // de meeste ruimte, vermijdt opeenvolgende dagen, en (optioneel) de
  // zware-dagen-regel. Levert een chronologisch gesorteerd plan.
  //   respectHeavyRule: false → de zware-dagen-regel wordt genegeerd.
  // Retourneert { plan, placedMinutes, remainingMinutes }.
  _splitGreedy(caps, name, totalMinutes, respectHeavyRule) {
    const ptsHalf = this._ptsPerHalf(name);
    const CHUNK = 30;                 // minimale/quantum-eenheid
    const ptsPerChunk = ptsHalf;      // 30 min = ½u = ptsPerHalf punten

    // Werkstaat per dag: hoeveel punten-ruimte en minuten al toegewezen.
    const state = caps.map((c, i) => ({
      i,
      dayKey: c.dayKey,
      remaining: c.remaining,         // resterende punten-ruimte (krimpt bij toewijzing)
      baseline: c.baseline,
      used: c.used,                   // voor de zware-check (groeit bij toewijzing)
      isHeavy: c.isHeavy,
      minutes: 0,                     // toegewezen minuten op deze dag
    }));

    // Welke dagen krijgen iets toegewezen (voor de opeenvolgend-check).
    const assigned = new Set();
    // Welke dagen worden door ónze toewijzing zwaar (voor de buur-check).
    const plannedHeavy = new Set();

    let remainingMinutes = totalMinutes;

    // Mag dag i een extra chunk krijgen? Controleert ruimte, opeenvolgendheid
    // en (optioneel) de zware-dagen-regel.
    const canPlace = (s) => {
      if (s.remaining < ptsPerChunk) return false;          // (a) onvoldoende ruimte
      // Geen opeenvolgende dagen gebruiken: weiger als een directe buur al iets kreeg
      // (tenzij die buur dezelfde dag is — kan niet). We laten al-toegewezen dagen
      // wél verder vullen.
      if (s.minutes === 0) {
        const prevAssigned = assigned.has(s.i - 1);
        const nextAssigned = assigned.has(s.i + 1);
        if (prevAssigned || nextAssigned) return false;
      }
      if (respectHeavyRule) {
        // (b) zware-dagen-regel: zou deze chunk de dag zwaar maken terwijl een
        // buur al zwaar is (of door ons zwaar wordt)?
        if (this._createsConsecutiveHeavy(
          state.map(x => ({ used: x.used, baseline: x.baseline, isHeavy: x.isHeavy })),
          s.i, ptsPerChunk, plannedHeavy)) return false;
      }
      return true;
    };

    // Greedy: blijf chunks plaatsen op de dag met de meeste resterende ruimte
    // die nog mag. Stop als geen enkele dag meer kan.
    while (remainingMinutes >= CHUNK) {
      // Kandidaten sorteren op meeste ruimte (en bij gelijke ruimte: vroegste dag).
      const candidates = state
        .filter(canPlace)
        .sort((a, b) => (b.remaining - a.remaining) || (a.i - b.i));
      if (candidates.length === 0) break;

      const s = candidates[0];
      s.minutes += CHUNK;
      s.remaining -= ptsPerChunk;
      s.used += ptsPerChunk;
      assigned.add(s.i);
      if (s.used > this.HEAVY_FRACTION * s.baseline) plannedHeavy.add(s.i);
      remainingMinutes -= CHUNK;
    }

    const plan = state
      .filter(s => s.minutes > 0)
      .map(s => ({ dayKey: s.dayKey, durationMinutes: s.minutes }));
    // Al chronologisch (state volgt de horizon-volgorde), maar voor de zekerheid:
    plan.sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));

    return {
      plan,
      placedMinutes: totalMinutes - remainingMinutes,
      remainingMinutes,
    };
  },

  // ---- Vrij slot zoeken ----
  // Eerste vrije gat vanaf 09:00 binnen [START_HOUR, END_HOUR] waar een blok
  // van durationMinutes past zonder overlap met bestaande blokken; geen gat →
  // achteraan na het laatste blok (geklemd binnen de tijdlijn, zoals quickLog).
  findFreeSlot(dayKey, durationMinutes) {
    const dayStart = START_HOUR * 60;
    const dayEnd = END_HOUR * 60;
    const acts = getDayActivities(dayKey)
      .slice()
      .sort((a, b) => a.startMinutes - b.startMinutes);

    // Zoek het eerste gat vanaf 09:00 (maar niet vóór START_HOUR).
    let cursor = Math.max(9 * 60, dayStart);

    for (const a of acts) {
      const aStart = a.startMinutes;
      const aEnd = a.startMinutes + a.durationMinutes;
      if (aEnd <= cursor) continue;            // blok ligt volledig vóór de cursor
      // Gat tussen cursor en het begin van dit blok?
      if (aStart - cursor >= durationMinutes) {
        return cursor;
      }
      // Geen ruimte: schuif de cursor voorbij dit blok.
      if (aEnd > cursor) cursor = aEnd;
    }

    // Geen gat gevonden → achteraan na het laatste blok, geklemd in de tijdlijn.
    let start = cursor;
    if (start > dayEnd - durationMinutes) start = dayEnd - durationMinutes;
    if (start < dayStart) start = dayStart;
    return start;
  },

  // ---- Plan toepassen ----
  // Schrijft per plan-item een blok met status:'planned' op het eerste vrije
  // slot van die dag weg via saveDayActivities (zodat meta/sync kloppen).
  // Retourneert een map { dayKey: [id, …] } van aangemaakte blokken (voor undo).
  apply(name, plan) {
    const createdIds = {};
    let counter = 0;
    plan.forEach(item => {
      const acts = getDayActivities(item.dayKey);
      const start = this.findFreeSlot(item.dayKey, item.durationMinutes);
      const id = 'act_' + Date.now() + '_' + (counter++);
      acts.push({
        id,
        name,
        startMinutes: start,
        durationMinutes: item.durationMinutes,
        status: 'planned',
      });
      acts.sort((a, b) => a.startMinutes - b.startMinutes);
      saveDayActivities(item.dayKey, acts);
      (createdIds[item.dayKey] = createdIds[item.dayKey] || []).push(id);
    });
    return createdIds;
  },

  // Verwijdert eerder aangemaakte geplande blokken (undo na apply).
  removeCreated(createdIds) {
    Object.entries(createdIds).forEach(([dayKey, ids]) => {
      const idSet = new Set(ids);
      const acts = getDayActivities(dayKey).filter(a => !idSet.has(a.id));
      saveDayActivities(dayKey, acts);
    });
  },

  // ============================================
  // UI — voorstel-modal
  // ============================================

  // Interne staat van de open modal-flow.
  _ui: { name: '', minutes: 60, result: null },

  // Open de modal. Optioneel met voorgevulde naam/duur (vanuit het activiteit-modal).
  open(opts = {}) {
    // Bepaal vandaag/toekomst-startdag: als de huidige dag-view in de toekomst
    // ligt starten we daar, anders vanaf vandaag.
    this._ui.name = opts.name && activityMap[opts.name] ? opts.name : '';
    this._ui.minutes = opts.minutes ? Math.max(30, Math.round(opts.minutes / 30) * 30) : 60;
    this._ui.result = null;
    this._ui.fromDayKey = opts.fromDayKey || todayStr();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'plannerModal';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal planner-modal">
        <h2>📅 Slim inplannen</h2>
        <p class="planner-intro">Kies een activiteit en de totale duur. De app stelt voor waar het de komende 2 weken het beste past.</p>
        <div id="plannerBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._renderStep();
  },

  close() {
    document.getElementById('plannerModal')?.remove();
  },

  // Tekent de huidige stap (kiezen / duur / voorstel) in het modal-lichaam.
  _renderStep() {
    const body = document.getElementById('plannerBody');
    if (!body) return;

    // Activiteit-keuzelijst (gegroepeerd, zoals openActivityPicker).
    let pickerList = '';
    categories.forEach(cat => {
      pickerList += `<div class="cat-group"><div class="cat-header">${cat.group}</div>`;
      cat.items.forEach(item => {
        const safe = item.name.replace(/'/g, "\\'");
        const sel = item.name === this._ui.name ? ' planner-pick-active' : '';
        pickerList += `<div class="cat-item weight-${item.weight}${sel}" onclick="Planner._pickName('${safe}')">
          <span>${item.name}</span>
          <span class="weight-badge">${item.ptsPerHalf > 0 ? '+' : ''}${item.ptsPerHalf}/½u</span>
        </div>`;
      });
      pickerList += '</div>';
    });

    // Duur-stepper (30 min – 12u, stappen van 30).
    const durLabel = formatDuration(this._ui.minutes);
    const previewPts = this._ui.name ? this._points(this._ui.name, this._ui.minutes) : null;
    const previewHtml = this._ui.name
      ? `<div class="planner-preview">${this._ui.name} · ${durLabel} · ${previewPts > 0 ? '+' : ''}${previewPts} pt</div>`
      : '';

    body.innerHTML = `
      <div class="form-group">
        <label>Activiteit</label>
        <div class="activity-picker planner-picker">${pickerList}</div>
      </div>
      <div class="form-group">
        <label>Totale duur</label>
        <div class="duration-stepper">
          <button type="button" class="dur-btn" onclick="Planner._stepDuration(-30)" aria-label="30 minuten korter">−</button>
          <span class="dur-display" id="plannerDurLabel">${durLabel}</span>
          <button type="button" class="dur-btn" onclick="Planner._stepDuration(30)" aria-label="30 minuten langer">+</button>
        </div>
      </div>
      ${previewHtml}
      <div id="plannerResult"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Planner.close()">Annuleren</button>
        <button class="btn btn-primary" id="plannerSuggestBtn" onclick="Planner._doSuggest()" ${this._ui.name ? '' : 'disabled'}>Stel voor</button>
      </div>
    `;
  },

  _pickName(name) {
    this._ui.name = name;
    this._ui.result = null;
    this._renderStep();
    // Scroll de gekozen activiteit netjes in beeld blijft niet nodig; herrender volstaat.
  },

  _stepDuration(delta) {
    let v = this._ui.minutes + delta;
    v = Math.max(30, Math.min(v, 12 * 60)); // 30 min – 12u
    this._ui.minutes = v;
    this._ui.result = null;
    const lbl = document.getElementById('plannerDurLabel');
    if (lbl) lbl.textContent = formatDuration(v);
    // Voorgaand voorstel wissen
    const res = document.getElementById('plannerResult');
    if (res) res.innerHTML = '';
  },

  // Bereken het voorstel en toon het.
  _doSuggest() {
    if (!this._ui.name) return;
    const result = this.suggest(this._ui.name, this._ui.minutes, this._ui.fromDayKey);
    this._ui.result = result;
    this._renderResult(result);
  },

  // Toon het voorstel: per dag datum (NL), duur, punten + de reason-zin.
  _renderResult(result) {
    const el = document.getElementById('plannerResult');
    if (!el) return;

    if (!result.plan || result.plan.length === 0) {
      el.innerHTML = `
        <div class="planner-result planner-result-fail">
          <p class="planner-reason">${result.reason}</p>
        </div>`;
      this._setActionsForResult(result);
      return;
    }

    let rows = '';
    result.plan.forEach(item => {
      const d = parseDate(item.dayKey);
      const dateLabel = `${NL_DAYS_SHORT[nlDayIndex(d)]} ${formatDateShort(d)}`;
      const pts = this._points(this._ui.name, item.durationMinutes);
      rows += `
        <div class="planner-row">
          <span class="planner-row-date">${dateLabel}</span>
          <span class="planner-row-dur">${formatDuration(item.durationMinutes)}</span>
          <span class="planner-row-pts">${pts > 0 ? '+' : ''}${pts} pt</span>
        </div>`;
    });

    const failClass = result.fits ? '' : ' planner-result-warn';
    el.innerHTML = `
      <div class="planner-result${failClass}">
        <div class="planner-rows">${rows}</div>
        <p class="planner-reason">${result.reason}</p>
      </div>`;
    this._setActionsForResult(result);
  },

  // Pas de knoppenrij aan op basis van het resultaat.
  _setActionsForResult(result) {
    const actions = document.querySelector('#plannerModal .modal-actions');
    if (!actions) return;
    const hasPlan = result.plan && result.plan.length > 0;
    if (result.fits) {
      actions.innerHTML = `
        <button class="btn btn-secondary" onclick="Planner.close()">Annuleren</button>
        <button class="btn btn-primary" onclick="Planner._apply()" ${hasPlan ? '' : 'disabled'}>Plan in</button>`;
    } else {
      // fits:false → gebruiker kiest zelf
      actions.innerHTML = `
        <button class="btn btn-secondary" onclick="Planner.close()">Annuleren</button>
        <button class="btn btn-primary" onclick="Planner._apply()" ${hasPlan ? '' : 'disabled'}>Toch inplannen</button>`;
    }
  },

  // Voer het plan uit, sluit de modal en toon een toast met undo.
  _apply() {
    const result = this._ui.result;
    if (!result || !result.plan || result.plan.length === 0) return;
    const name = this._ui.name;
    const createdIds = this.apply(name, result.plan);
    this.close();

    const dagen = result.plan.length;
    Toast.show(`📅 "${name}" ingepland over ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}`, {
      undo: () => {
        this.removeCreated(createdIds);
        App.navigate(App.currentView);
      },
      duration: 6000,
    });

    // Ververs de huidige view zodat de geplande blokken meteen zichtbaar zijn.
    App.navigate(App.currentView);
  },
};
