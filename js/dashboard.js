/**
 * Proton Lean OS - Główny Kontroler Kokpitu i Silnik Osi Czasu (v4.0 Live Flow)
 * - 30-dniowa deterministyczna historia "od teraz wstecz" (zero danych z przyszłości)
 * - Auto-detekcja bieżącej zmiany (I / II / III) z zegara systemowego
 * - Syntetyczna kolejka produkcyjna na żywo (Wykonanie / Cel + spływ partii)
 * - Sortowanie gniazd od najgorszego do najlepszego OEE + mini-wykresy trendu + zwijanie
 * - Animowany pasek postępu wnioskowania 5-Why oraz wymuszona animacja pierścieni HUD
 */

const STORAGE_KEYS = {
    HISTORY_BASELINE: 'proton_history_baseline_v40',
    LIVE_5S_AUDITS: 'proton_5s_live_audits_v40',
    CUSTOM_STATIONS: 'proton_5s_custom_stations_v40',
    APPROVED_CAPAS: 'proton_approved_capas_v40',
    PUSHPULL_TASKS: 'proton_pushpull_tasks_v40'
};

// Katalog 8 gniazd ciągu technologicznego
const MACHINES_CATALOG = [
    { id: 'L-01', name: 'Laser BLM Płytowy CNC', area: 'Cięcie PK1', nominalTaktMin: 4.2, hourlyCostPLN: 480 },
    { id: 'L-02', name: 'Laser Rurowy Adige', area: 'Cięcie PK1', nominalTaktMin: 5.0, hourlyCostPLN: 450 },
    { id: 'P-01', name: 'Piła Tarczowa Automatyczna', area: 'Przygotowanie PK2', nominalTaktMin: 3.5, hourlyCostPLN: 290 },
    { id: 'G-01', name: 'Giętarka do Rur CNC', area: 'Giętarnia PK2', nominalTaktMin: 4.8, hourlyCostPLN: 360 },
    { id: 'S-02', name: 'Spawanie Manualne MIG/MAG', area: 'Spawalnia Główna', nominalTaktMin: 8.5, hourlyCostPLN: 340 },
    { id: 'R-01', name: 'Cela Zrobotyzowana Fanuc', area: 'Spawalnia PK1', nominalTaktMin: 6.0, hourlyCostPLN: 520 },
    { id: 'K-02', name: 'Śrutownia Komorowa', area: 'Przygotowanie Pow.', nominalTaktMin: 7.0, hourlyCostPLN: 310 },
    { id: 'M-01', name: 'Montaż Końcowy Kontenerów', area: 'Montaż Końcowy', nominalTaktMin: 9.2, hourlyCostPLN: 380 }
];

// Standardowe 5 kategorii strat Pareto (Lean / TPM)
const PARETO_CATEGORIES = [
    { id: 'LOGISTICS', label: '1. Logistyka / Stół urobku', color: '#F43F5E', textClass: 'text-rose-400' },
    { id: 'MAINTENANCE', label: '2. UR – Podajniki i napędy', color: '#F59E0B', textClass: 'text-amber-400' },
    { id: 'TOOLING', label: '3. Zużycie tarcz / dysz', color: '#EAB308', textClass: 'text-yellow-400' },
    { id: 'SMED', label: '4. Przezbrojenia SMED', color: '#64748B', textClass: 'text-slate-300' },
    { id: 'MICRO', label: '5. Mikroprzestoje gniazd', color: '#334155', textClass: 'text-slate-400' }
];

// Globalny stan aplikacji
const AppState = {
    selectedShift: 1,
    selectedPreset: 'today',
    dateFrom: '',
    dateTo: '',
    allEvents: [],
    selectedIncidentId: null,
    last5WhyResult: null,
    visionBaseData: { stations: [], audits: [] },
    currentVisionImageBase64: null,
    isMachinesGridCollapsed: false,
    syntheticCompletedBonus: 0, // Dodatkowe jednostki wyprodukowane na żywo od momentu otwarcia aplikacji
    lastProducedMessage: ''
};

// =============================================================================
// 1. INICJALIZACJA SYSTEMU, ZEGARA I SYNTETYCZNEJ KOLEJKI PRODUKCYJNEJ
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const nowCtx = MESBus.getProductionTimeContext(new Date());
    AppState.selectedShift = nowCtx.shiftId;
    AppState.selectedPreset = 'today';

    setupDateInputBounds(nowCtx.dateStr);
    applyPeriodPreset('today', false);

    initHistoricalAndLiveEvents();
    await load5SVisionDatabase();
    initPushPullAndCapas();

    MESBus.init((isOnline) => {
        console.log('[Dashboard] Status szyny telemetrycznej:', isOnline ? 'ONLINE' : 'OFFLINE');
    });

    MESBus.subscribe((newLiveEvent) => {
        handleIncomingTerminalEvent(newLiveEvent);
    });

    updateAiStatusPill();
    updateLiveClockBadge();
    setInterval(updateLiveClockBadge, 15000);

    // Pierwsze przeliczenie z wymuszoną animacją pierścieni HUD od 0
    recalculateAndRenderAll(true);

    // Uruchomienie syntetycznej kolejki produkcyjnej na żywo
    startSyntheticProductionQueue();
});

function startSyntheticProductionQueue() {
    const batchItems = [
        'Rama nośna kontenera 20ft (S355)',
        'Belka poprzeczna stropowa L=2438',
        'Słup narożny profil zamknięty CNC',
        'Pakiet stężeń bocznych po śrutowaniu',
        'Zespół podłużnicy głównej (Spawanie MIG)',
        'Kratownica podłogowa po kontroli NDT'
    ];

    // Ustawienie początkowego komunikatu spływu na podstawie bieżącej godziny
    const initCtx = MESBus.getProductionTimeContext(new Date());
    const elapsedInit = getCurrentShiftElapsedRatio(new Date(), initCtx.shiftId);
    if (elapsedInit <= 0.04) {
        AppState.lastProducedMessage = `Początek ${initCtx.shiftName} – rozruch linii i nagrzewanie źródeł spawalniczych...`;
    } else {
        const m = MACHINES_CATALOG[new Date().getMinutes() % MACHINES_CATALOG.length];
        const b = batchItems[new Date().getHours() % batchItems.length];
        AppState.lastProducedMessage = `Ostatni spływ (${initCtx.timeFormatted.slice(0, 5)}): ${b} • Gniazdo ${m.id}`;
    }
    updateTickerUI();

    // Co 14 sekund spływa kolejna wyprodukowana jednostka w aktywnej zmianie
    setInterval(() => {
        const now = new Date();
        const nowCtx = MESBus.getProductionTimeContext(now);
        AppState.syntheticCompletedBonus += 1;

        const m = MACHINES_CATALOG[Math.floor(Math.random() * MACHINES_CATALOG.length)];
        const b = batchItems[Math.floor(Math.random() * batchItems.length)];
        const orderNo = `#ZL-2026/${884 + (AppState.syntheticCompletedBonus % 12)}`;

        AppState.lastProducedMessage = `Ostatni spływ (${nowCtx.timeFormatted}): ${b} • Gniazdo ${m.id} (+1 paleta)`;
        const orderEl = document.getElementById('live-queue-order');
        if (orderEl) orderEl.textContent = `Zlecenie: ${orderNo}`;

        updateTickerUI();

        // Jeśli użytkownik ogląda dzisiaj lub bieżący tydzień/miesiąc, aktualizujemy licznik planu na żywo
        if (AppState.dateTo >= nowCtx.dateStr) {
            recalculateAndRenderAll(false);
        }
    }, 14000);
}

function updateTickerUI() {
    const tickerEl = document.getElementById('live-production-ticker');
    if (tickerEl && AppState.lastProducedMessage) {
        tickerEl.textContent = AppState.lastProducedMessage;
    }
}

function setupDateInputBounds(todayStr) {
    const todayDate = new Date(todayStr + 'T12:00:00');
    const minDate = new Date(todayDate);
    minDate.setDate(minDate.getDate() - 30);

    const minStr = formatDateISO(minDate);
    const fromEl = document.getElementById('date-from');
    const toEl = document.getElementById('date-to');

    if (fromEl && toEl) {
        fromEl.min = minStr;
        fromEl.max = todayStr;
        toEl.min = minStr;
        toEl.max = todayStr;
    }

    const footerRange = document.getElementById('footer-timeline-range');
    if (footerRange) {
        footerRange.textContent = `Horyzont bazy: ${minStr} – ${todayStr} (30 dni wstecz)`;
    }
}

function formatDateISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function updateLiveClockBadge() {
    const ctx = MESBus.getProductionTimeContext(new Date());
    const badge = document.getElementById('live-clock-badge');
    if (badge) {
        badge.textContent = `Aktywna: ${ctx.shiftName} • ${ctx.timeFormatted.slice(0, 5)}`;
    }
}

// =============================================================================
// 2. GENERATOR 30-DNIOWEJ HISTORII "OD TERAZ WSTECZ" (ZERO DANYCH Z PRZYSZŁOŚCI)
// =============================================================================
function initHistoricalAndLiveEvents() {
    const now = new Date();
    const nowCtx = MESBus.getProductionTimeContext(now);
    let baseline = [];

    try {
        const cached = localStorage.getItem(STORAGE_KEYS.HISTORY_BASELINE);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.anchorDate === nowCtx.dateStr && Array.isArray(parsed.events)) {
                baseline = parsed.events;
            }
        }
    } catch (e) {
        console.warn('[Timeline] Błąd odczytu baseline:', e);
    }

    if (baseline.length === 0) {
        baseline = generate30DaysBackwardBaseline(now, nowCtx);
        try {
            localStorage.setItem(STORAGE_KEYS.HISTORY_BASELINE, JSON.stringify({
                anchorDate: nowCtx.dateStr,
                events: baseline
            }));
        } catch (e) {
            console.warn('[Timeline] Błąd zapisu baseline:', e);
        }
    }

    const liveEvents = MESBus.getStoredLiveEvents();
    AppState.allEvents = [...liveEvents, ...baseline];
}

function generate30DaysBackwardBaseline(nowDate, nowCtx) {
    const events = [];
    const sampleFaults = [
        { code: 'E-104', desc: 'Zator na stole odbiorczym urobku', cat: 'LOGISTICS', baseMin: 18 },
        { code: 'E-212', desc: 'Spadek ciśnienia w podajniku wiązek', cat: 'MAINTENANCE', baseMin: 24 },
        { code: 'E-309', desc: 'Zużycie dyszy tnącej / tarczy HSS', cat: 'TOOLING', baseMin: 14 },
        { code: 'S-001', desc: 'Przezbrojenie oprzyrządowania pod nową serię', cat: 'SMED', baseMin: 15 },
        { code: 'M-019', desc: 'Chwilowa korekta czujnika bazowania detalu', cat: 'MICRO', baseMin: 7 }
    ];

    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
        const d = new Date(nowCtx.dateStr + 'T12:00:00');
        d.setDate(d.getDate() - daysAgo);
        const dateStr = formatDateISO(d);
        const dayOfWeek = d.getDay();

        if (dayOfWeek === 0) continue;
        const maxShiftsForDay = dayOfWeek === 6 ? 1 : 3;

        for (let shiftId = 1; shiftId <= maxShiftsForDay; shiftId++) {
            if (daysAgo === 0 && shiftId > nowCtx.shiftId) {
                continue;
            }

            const seedBase = (daysAgo * 31) + (shiftId * 17);
            const eventsCount = (seedBase % 3) + 2;

            let effectiveCount = eventsCount;
            if (daysAgo === 0 && shiftId === nowCtx.shiftId) {
                const progress = getCurrentShiftElapsedRatio(nowDate, shiftId);
                effectiveCount = progress < 0.04 ? 0 : Math.max(1, Math.floor(eventsCount * progress));
            }

            for (let i = 0; i < effectiveCount; i++) {
                const hash = (seedBase + i * 13);
                const machine = MACHINES_CATALOG[hash % MACHINES_CATALOG.length];

                let faultIndex = (hash + shiftId) % sampleFaults.length;
                if (shiftId === 3 && i === 0) faultIndex = 1;
                if (shiftId === 1 && i === 0) faultIndex = 3;

                const fault = sampleFaults[faultIndex];
                const durationMin = fault.baseMin + ((hash % 12) - 4);
                const costTotalPLN = Math.round((durationMin / 60) * machine.hourlyCostPLN);

                const shiftStartHour = shiftId === 1 ? 6 : (shiftId === 2 ? 14 : 22);
                const eventHour = (shiftStartHour + 1 + (i * 2)) % 24;
                const timeFormatted = `${String(eventHour).padStart(2, '0')}:${String((hash * 7) % 59).padStart(2, '0')}:00`;

                events.push({
                    id: `HIST-${dateStr}-S${shiftId}-${i}`,
                    dateStr: dateStr,
                    timeFormatted: timeFormatted,
                    timestamp: `${dateStr}T${timeFormatted}`,
                    shiftId: shiftId,
                    shiftName: `Zmiana ${shiftId === 1 ? 'I (06-14)' : (shiftId === 2 ? 'II (14-22)' : 'III (22-06)')}`,
                    machineId: machine.id,
                    machineName: machine.name,
                    faultCode: fault.code,
                    faultDescription: fault.desc,
                    category: fault.cat,
                    durationMin: Math.max(4, durationMin),
                    costTotalPLN: Math.max(25, costTotalPLN),
                    isLiveEvent: false
                });
            }
        }
    }

    return events.reverse();
}

// Wylicza jaki ułamek (0.0 - 1.0) aktualnej 8-godzinnej zmiany już upłynął
function getCurrentShiftElapsedRatio(nowDate, shiftId) {
    const h = nowDate.getHours();
    const m = nowDate.getMinutes();
    let minutesIntoShift = 0;

    if (shiftId === 1) {
        minutesIntoShift = (h - 6) * 60 + m;
    } else if (shiftId === 2) {
        minutesIntoShift = (h - 14) * 60 + m;
    } else {
        minutesIntoShift = h >= 22 ? (h - 22) * 60 + m : (h + 2) * 60 + m;
    }

    return Math.max(0.0, Math.min(1.0, minutesIntoShift / 480));
}

// =============================================================================
// 3. OBSŁUGA FILTRÓW ZMIAN I OKRESÓW (Z WYMUSZONĄ ANIMACJĄ HUD)
// =============================================================================
function setShiftFilter(shiftVal) {
    AppState.selectedShift = shiftVal;
    updateShiftButtonsUI();
    recalculateAndRenderAll(true);
}

function updateShiftButtonsUI() {
    document.querySelectorAll('.shift-btn').forEach(btn => {
        const val = btn.getAttribute('data-shift');
        if (String(val) === String(AppState.selectedShift)) {
            btn.classList.add('shift-btn-active');
            btn.classList.remove('text-slate-400');
        } else {
            btn.classList.remove('shift-btn-active');
            btn.classList.add('text-slate-400');
        }
    });
}

function applyPeriodPreset(preset, triggerRender = true) {
    AppState.selectedPreset = preset;
    const presetSelect = document.getElementById('period-preset');
    if (presetSelect) presetSelect.value = preset;

    const nowCtx = MESBus.getProductionTimeContext(new Date());
    const todayDate = new Date(nowCtx.dateStr + 'T12:00:00');
    let fromDate = new Date(todayDate);
    let toDate = new Date(todayDate);

    if (preset === 'yesterday') {
        fromDate.setDate(todayDate.getDate() - 1);
        toDate.setDate(todayDate.getDate() - 1);
    } else if (preset === 'wtd') {
        const day = todayDate.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        fromDate.setDate(todayDate.getDate() - diffToMonday);
    } else if (preset === 'last7') {
        fromDate.setDate(todayDate.getDate() - 6);
    } else if (preset === 'mtd') {
        fromDate.setDate(todayDate.getDate() - 29);
    }

    if (preset !== 'custom') {
        AppState.dateFrom = formatDateISO(fromDate);
        AppState.dateTo = formatDateISO(toDate);
        const fromEl = document.getElementById('date-from');
        const toEl = document.getElementById('date-to');
        if (fromEl) fromEl.value = AppState.dateFrom;
        if (toEl) toEl.value = AppState.dateTo;
    }

    updateShiftButtonsUI();
    if (triggerRender) recalculateAndRenderAll(true);
}

function onCustomDateChange() {
    const fromEl = document.getElementById('date-from');
    const toEl = document.getElementById('date-to');
    if (!fromEl || !toEl) return;

    if (fromEl.value > toEl.value) {
        toEl.value = fromEl.value;
    }

    AppState.dateFrom = fromEl.value;
    AppState.dateTo = toEl.value;
    AppState.selectedPreset = 'custom';

    const presetSelect = document.getElementById('period-preset');
    if (presetSelect) presetSelect.value = 'custom';

    recalculateAndRenderAll(true);
}

function resetToCurrentLiveShift() {
    const nowCtx = MESBus.getProductionTimeContext(new Date());
    AppState.selectedShift = nowCtx.shiftId;
    applyPeriodPreset('today', true);
}

// =============================================================================
// 4. GŁÓWNA FUNKCJA PRZELICZAJĄCA WSKAŹNIKI (OEE, PARETO, PLAN, MASZYNY)
// =============================================================================
function recalculateAndRenderAll(animateRingsFromZero = false) {
    const now = new Date();
    const nowCtx = MESBus.getProductionTimeContext(now);
    const isSingleToday = (AppState.dateFrom === nowCtx.dateStr && AppState.dateTo === nowCtx.dateStr);
    const isFutureShiftToday = isSingleToday &&
        AppState.selectedShift !== 'ALL' &&
        Number(AppState.selectedShift) > nowCtx.shiftId;

    const banner = document.getElementById('future-shift-banner');
    if (banner) {
        if (isFutureShiftToday) {
            banner.classList.remove('hidden');
            document.getElementById('future-shift-text').textContent =
                `Wybrana Zmiana ${AppState.selectedShift} jeszcze się nie rozpoczęła (aktualnie trwa ${nowCtx.shiftName}). Brak danych produkcyjnych z przyszłości.`;
        } else {
            banner.classList.add('hidden');
        }
    }

    // 1. Filtrowanie zdarzeń
    const filteredEvents = AppState.allEvents.filter(ev => {
        const inDateRange = ev.dateStr >= AppState.dateFrom && ev.dateStr <= AppState.dateTo;
        const inShift = AppState.selectedShift === 'ALL' || Number(ev.shiftId) === Number(AppState.selectedShift);
        return inDateRange && inShift;
    });

    // 2. Czas nominalny oraz czas, który faktycznie upłynął w wybranym oknie
    const timeMetrics = calculateHorizonTimeMetrics(now, nowCtx, isFutureShiftToday);

    // 3. Agregacja Pareto
    const paretoTotals = { LOGISTICS: 0, MAINTENANCE: 0, TOOLING: 0, SMED: 0, MICRO: 0 };
    let totalDowntimeMin = 0;

    filteredEvents.forEach(ev => {
        const cat = paretoTotals.hasOwnProperty(ev.category) ? ev.category : 'MAINTENANCE';
        paretoTotals[cat] += Number(ev.durationMin || 0);
        totalDowntimeMin += Number(ev.durationMin || 0);
    });

    renderParetoHUD(paretoTotals, totalDowntimeMin, animateRingsFromZero);

    // 4. Wyliczenie Globalnego OEE (A x P x Q)
    let availPct = 0, perfPct = 0, qualPct = 0, oeePct = 0;

    if (!isFutureShiftToday && timeMetrics.elapsedMinutes > 5) {
        const effectiveLineDowntime = totalDowntimeMin / 3.2;
        availPct = Math.max(42.0, Math.min(98.5, ((timeMetrics.elapsedMinutes - effectiveLineDowntime) / timeMetrics.elapsedMinutes) * 100));
        const shiftPerfFactor = AppState.selectedShift === 2 ? 91.4 : (AppState.selectedShift === 3 ? 86.2 : 89.5);
        perfPct = Math.max(70.0, shiftPerfFactor - (filteredEvents.length * 0.12));
        qualPct = AppState.selectedShift === 3 ? 97.9 : 98.8;
        oeePct = (availPct / 100) * (perfPct / 100) * (qualPct / 100) * 100;
    }

    renderOeeHUD(availPct, perfPct, qualPct, oeePct, animateRingsFromZero);

    // 5. Realizacja Planu w formacie Wykonanie / Cel (np. 20 / 34 lub 54 / 98)
    renderProductionPlanHUD(timeMetrics, oeePct, isFutureShiftToday, nowCtx);

    // 6. Wąskie gardło
    renderBottleneckCard(filteredEvents, isFutureShiftToday);

    // 7. Siatka 8 Maszyn (posortowana od najgorszego do najlepszego OEE) + Incydenty
    renderMachinesGrid(filteredEvents, timeMetrics.elapsedMinutes, isFutureShiftToday);
    renderIncidentsList(filteredEvents);
}

// Zwraca zarówno pełny planowany czas okresu (scheduledMinutes), jak i minuty, które już upłynęły (elapsedMinutes)
function calculateHorizonTimeMetrics(nowDate, nowCtx, isFutureShiftToday) {
    if (isFutureShiftToday) return { scheduledMinutes: 480, elapsedMinutes: 0 };

    const start = new Date(AppState.dateFrom + 'T12:00:00');
    const end = new Date(AppState.dateTo + 'T12:00:00');
    let scheduledMinutes = 0;
    let elapsedMinutes = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dStr = formatDateISO(d);
        const dow = d.getDay();
        if (dow === 0) continue;

        const shiftsInDay = dow === 6 ? [1] : [1, 2, 3];

        shiftsInDay.forEach(sId => {
            if (AppState.selectedShift !== 'ALL' && Number(AppState.selectedShift) !== sId) {
                return;
            }

            scheduledMinutes += 480;

            if (dStr === nowCtx.dateStr) {
                if (sId < nowCtx.shiftId) {
                    elapsedMinutes += 480;
                } else if (sId === nowCtx.shiftId) {
                    elapsedMinutes += Math.round(480 * getCurrentShiftElapsedRatio(nowDate, sId));
                }
            } else if (dStr < nowCtx.dateStr) {
                elapsedMinutes += 480;
            }
        });
    }

    return { scheduledMinutes, elapsedMinutes };
}

// =============================================================================
// 5. RENDEROWANIE KOMPONENTÓW HUD (PARETO, OEE, PLAN WYKONANIE/CEL, MASZYNY)
// =============================================================================
function renderParetoHUD(paretoTotals, totalDowntimeMin, animateFromZero) {
    document.getElementById('pareto-total-badge').textContent = `Suma: ${totalDowntimeMin} min`;
    document.getElementById('pareto-center-val').textContent = totalDowntimeMin;

    const sorted = PARETO_CATEGORIES.map(cat => ({
        ...cat,
        minutes: paretoTotals[cat.id] || 0,
        pct: totalDowntimeMin > 0 ? ((paretoTotals[cat.id] || 0) / totalDowntimeMin) * 100 : 0
    })).sort((a, b) => b.minutes - a.minutes);

    const circumference = 2 * Math.PI * 40;
    const legendContainer = document.getElementById('pareto-legend-list');
    legendContainer.innerHTML = '';

    // Jeśli żądamy świeżej animacji, najpierw zerujemy pierścienie
    if (animateFromZero) {
        for (let idx = 0; idx < 5; idx++) {
            const rEl = document.getElementById(`pareto-ring-${idx + 1}`);
            if (rEl) {
                rEl.style.transition = 'none';
                rEl.style.strokeDasharray = `0 ${circumference}`;
                rEl.style.strokeDashoffset = '0';
            }
        }
    }

    const applyRings = () => {
        let cumulativeOffset = 0;
        sorted.forEach((item, idx) => {
            const ringEl = document.getElementById(`pareto-ring-${idx + 1}`);
            if (ringEl) {
                ringEl.style.transition = '';
                ringEl.setAttribute('stroke', item.color);
                const segLength = (item.pct / 100) * circumference;
                ringEl.style.strokeDasharray = `${segLength} ${circumference}`;
                ringEl.style.strokeDashoffset = `-${cumulativeOffset}`;
                cumulativeOffset += segLength;
            }
        });
    };

    if (animateFromZero) {
        requestAnimationFrame(() => requestAnimationFrame(applyRings));
    } else {
        applyRings();
    }

    sorted.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'bg-slate-900/75 border border-slate-800/90 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs';
        row.innerHTML = `
            <div class="flex items-center gap-2 truncate pr-2">
                <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background-color: ${item.color}"></span>
                <span class="text-slate-200 truncate">${item.label.replace(/^\d+\.\s*/, `${idx + 1}. `)}</span>
            </div>
            <span class="font-mono font-semibold ${item.textClass} shrink-0">${item.pct.toFixed(1)}% (${item.minutes}m)</span>
        `;
        legendContainer.appendChild(row);
    });
}

function renderOeeHUD(availPct, perfPct, qualPct, oeePct, animateFromZero) {
    document.getElementById('oee-top-badge').textContent = `${oeePct.toFixed(1)}%`;
    document.getElementById('oee-center-val').textContent = `${oeePct.toFixed(1)}%`;
    document.getElementById('oee-val-a').textContent = `${availPct.toFixed(1)}%`;
    document.getElementById('oee-val-p').textContent = `${perfPct.toFixed(1)}%`;
    document.getElementById('oee-val-q').textContent = `${qualPct.toFixed(1)}%`;

    const diff = oeePct - 85.0;
    const diffEl = document.getElementById('oee-benchmark-diff');
    if (oeePct === 0) {
        diffEl.textContent = 'Oczekiwanie na start zmiany';
        diffEl.className = 'text-slate-500 font-semibold';
    } else {
        diffEl.textContent = `Odchyłka: ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
        diffEl.className = diff >= 0 ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold';
    }

    const ringsConfig = [
        { id: 'oee-ring-a', pct: availPct, r: 42 },
        { id: 'oee-ring-p', pct: perfPct, r: 33 },
        { id: 'oee-ring-q', pct: qualPct, r: 24 }
    ];

    if (animateFromZero) {
        ringsConfig.forEach(cfg => {
            const el = document.getElementById(cfg.id);
            if (el) {
                const c = 2 * Math.PI * cfg.r;
                el.style.transition = 'none';
                el.style.strokeDasharray = `0 ${c}`;
            }
        });
    }

    const applyOeeRings = () => {
        ringsConfig.forEach(cfg => {
            const el = document.getElementById(cfg.id);
            if (el) {
                el.style.transition = '';
                const c = 2 * Math.PI * cfg.r;
                const dash = (cfg.pct / 100) * c;
                el.style.strokeDasharray = `${dash} ${c}`;
            }
        });
    };

    if (animateFromZero) {
        requestAnimationFrame(() => requestAnimationFrame(applyOeeRings));
    } else {
        applyOeeRings();
    }
}

function renderProductionPlanHUD(timeMetrics, oeePct, isFutureShiftToday, nowCtx) {
    // Cel całego wybranego okresu (np. 34 szt. na zmianę, 98 szt. na pełną dobę 3 zmian)
    const shiftsCount = timeMetrics.scheduledMinutes / 480;
    const targetTotal = Math.max(1, Math.round(shiftsCount * 32.67)); // 3 zmiany = 98 szt., 1 zmiana = 33 szt.

    let actualProduced = 0;
    if (!isFutureShiftToday && timeMetrics.elapsedMinutes > 5) {
        const elapsedRatio = timeMetrics.elapsedMinutes / timeMetrics.scheduledMinutes;
        const oeeMultiplier = oeePct > 0 ? Math.min(1.02, oeePct / 74.0) : 0.85;
        actualProduced = Math.round(targetTotal * elapsedRatio * oeeMultiplier);

        // Jeśli okno obejmuje bieżącą zmianę, doliczamy jednostki wyprodukowane na żywo przez syntetyczną kolejkę
        if (AppState.dateTo >= nowCtx.dateStr &&
            (AppState.selectedShift === 'ALL' || Number(AppState.selectedShift) === nowCtx.shiftId)) {
            actualProduced = Math.min(targetTotal, actualProduced + AppState.syntheticCompletedBonus);
        }
    }

    const remaining = Math.max(0, targetTotal - actualProduced);
    const planPct = targetTotal > 0 ? (actualProduced / targetTotal) * 100 : 0;
    const tonnage = actualProduced * 0.68;
    const avgTakt = actualProduced > 0 ? (timeMetrics.elapsedMinutes / actualProduced) : 0;

    // Wyświetlenie ułamka np. 20 / 33 lub 54 / 98
    document.getElementById('kpi-plan-ratio').textContent = `${actualProduced} / ${targetTotal}`;
    document.getElementById('kpi-plan-remaining').textContent = `${remaining} szt.`;
    document.getElementById('kpi-tonnage').textContent = `${tonnage.toFixed(1)} t`;
    document.getElementById('kpi-takt').textContent = `${avgTakt.toFixed(1)} min`;
    document.getElementById('plan-pct-badge').textContent = `${planPct.toFixed(1)}% Celu`;
    document.getElementById('plan-progress-bar').style.width = `${Math.min(100, planPct)}%`;

    const shiftLabel = AppState.selectedShift === 'ALL' ? 'Pełna Doba (I–III)' : `Zmiana ${AppState.selectedShift}`;
    document.getElementById('plan-subtitle').textContent = `Zakres: ${AppState.dateFrom} – ${AppState.dateTo} • Filtr: ${shiftLabel}`;
}

function renderBottleneckCard(filteredEvents, isFutureShiftToday) {
    const nameEl = document.getElementById('bottleneck-machine-name');
    const reasonEl = document.getElementById('bottleneck-reason');
    const lossEl = document.getElementById('bottleneck-loss-cost');
    const dtBadge = document.getElementById('bottleneck-downtime-badge');

    if (isFutureShiftToday || filteredEvents.length === 0) {
        nameEl.textContent = 'Brak aktywnego wąskiego gardła';
        reasonEl.textContent = 'W wybranym oknie czasowym nie zarejestrowano przestojów krytycznych.';
        lossEl.textContent = '0 PLN';
        dtBadge.innerHTML = 'Strata: <strong class="text-white">0 min</strong>';
        AppState.selectedIncidentId = null;
        return;
    }

    const machineLosses = {};
    filteredEvents.forEach(ev => {
        if (!machineLosses[ev.machineId]) {
            machineLosses[ev.machineId] = {
                machineId: ev.machineId,
                machineName: ev.machineName,
                totalMin: 0,
                totalCost: 0,
                topEvent: ev
            };
        }
        machineLosses[ev.machineId].totalMin += ev.durationMin;
        machineLosses[ev.machineId].totalCost += ev.costTotalPLN;
        if (ev.durationMin >= machineLosses[ev.machineId].topEvent.durationMin) {
            machineLosses[ev.machineId].topEvent = ev;
        }
    });

    const sortedMachines = Object.values(machineLosses).sort((a, b) => b.totalMin - a.totalMin);
    const worst = sortedMachines[0];

    nameEl.textContent = `${worst.machineName} (${worst.machineId})`;
    reasonEl.textContent = `Główna przyczyna: ${worst.topEvent.faultDescription} [${worst.topEvent.faultCode}]`;
    lossEl.textContent = `-${worst.totalCost.toLocaleString('pl-PL')} PLN`;
    dtBadge.innerHTML = `Strata w okresie: <strong class="text-rose-400">${worst.totalMin} min</strong>`;

    if (!AppState.selectedIncidentId) {
        AppState.selectedIncidentId = worst.topEvent.id;
    }
}

// =============================================================================
// 6. GNIAZDA CIĄGU TECHNOLOGICZNEGO (SORTOWANIE OD NAJGORSZEGO OEE + WYKRESY)
// =============================================================================
function toggleMachinesGridCollapse() {
    AppState.isMachinesGridCollapsed = !AppState.isMachinesGridCollapsed;
    const grid = document.getElementById('machines-grid');
    const summary = document.getElementById('machines-collapsed-summary');
    const label = document.getElementById('toggle-machines-label');
    const icon = document.getElementById('toggle-machines-icon');

    if (AppState.isMachinesGridCollapsed) {
        grid.classList.add('hidden');
        summary.classList.remove('hidden');
        label.textContent = 'Rozwiń gniazda';
        icon.setAttribute('data-lucide', 'chevron-down');
    } else {
        grid.classList.remove('hidden');
        summary.classList.add('hidden');
        label.textContent = 'Zwiń gniazda';
        icon.setAttribute('data-lucide', 'chevron-up');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderMachinesGrid(filteredEvents, elapsedMinutes, isFutureShiftToday) {
    const grid = document.getElementById('machines-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const shiftText = AppState.selectedShift === 'ALL' ? 'Wszystkie zmiany' : `Zmiana ${AppState.selectedShift}`;
    document.getElementById('grid-context-label').textContent = `Zakres: ${AppState.dateFrom} – ${AppState.dateTo} | ${shiftText}`;

    const todayStr = MESBus.getProductionTimeContext().dateStr;

    // 1. Wyliczamy pełne metryki A, P, Q, OEE oraz trend 5-słupkowy dla każdego gniazda
    const enrichedMachines = MACHINES_CATALOG.map((m, idx) => {
        const mEvents = filteredEvents.filter(e => e.machineId === m.id);
        const downtimeMin = mEvents.reduce((acc, e) => acc + e.durationMin, 0);
        const hasLiveAlert = mEvents.some(e => e.isLiveEvent && e.dateStr === todayStr);

        let avail = 0, perf = 0, qual = 0, oee = 0;
        if (!isFutureShiftToday && elapsedMinutes > 5) {
            avail = Math.max(40, Math.min(99, ((elapsedMinutes - downtimeMin) / elapsedMinutes) * 100));
            perf = Math.max(72, 92 - (idx % 4) * 2.1 - (mEvents.length * 0.4));
            qual = 98.2 + (idx % 3) * 0.4;
            oee = (avail / 100) * (perf / 100) * (qual / 100) * 100;
        }

        // Generujemy 5 słupków trendu OEE z ostatnich punktów pomiarowych (zakończonych na bieżącym OEE)
        const sparkBars = isFutureShiftToday ? [0, 0, 0, 0, 0] : [
            Math.max(45, Math.min(96, oee + ((idx % 3) - 1) * 5)),
            Math.max(45, Math.min(96, oee - ((idx % 2) * 4) + 2)),
            Math.max(45, Math.min(96, oee + 3)),
            Math.max(45, Math.min(96, oee - 2)),
            oee
        ];

        return {
            ...m,
            events: mEvents,
            downtimeMin,
            hasLiveAlert,
            avail,
            perf,
            qual,
            oee,
            sparkBars
        };
    });

    // 2. Sortowanie rosnąco: OD NAJGORSZEGO OEE DO NAJLEPSZEGO (Management by Exception)
    enrichedMachines.sort((a, b) => a.oee - b.oee);

    // Aktualizacja paska podsumowania (widocznego po zwinięciu sekcji)
    const collapsedSummary = document.getElementById('collapsed-summary-text');
    if (collapsedSummary && enrichedMachines.length > 0) {
        const worst = enrichedMachines[0];
        const best = enrichedMachines[enrichedMachines.length - 1];
        collapsedSummary.innerHTML = `Najniższe OEE: <strong class="text-rose-400">${worst.id} (${worst.oee.toFixed(1)}%)</strong> • Najwyższe OEE: <strong class="text-emerald-400">${best.id} (${best.oee.toFixed(1)}%)</strong> • Kliknij „Rozwiń gniazda”, aby zobaczyć pełną analitykę 8 stanowisk.`;
    }

    // 3. Renderowanie kart z paskiem A/P/Q i mini-wykresem słupkowym trendu
    enrichedMachines.forEach((m, rankIdx) => {
        const isCritical = (!isFutureShiftToday && (m.oee < 68 || m.downtimeMin > 25 || m.hasLiveAlert));
        const statusDotClass = isFutureShiftToday
            ? 'bg-slate-600'
            : (isCritical ? 'bg-rose-500 animate-ping' : 'bg-emerald-400');

        const oeeTextColor = m.oee === 0
            ? 'text-slate-500'
            : (m.oee < 68 ? 'text-rose-400' : (m.oee < 78 ? 'text-amber-400' : 'text-emerald-400'));

        const card = document.createElement('div');
        card.onclick = () => openMachineDetailModal(m, m.events, m.oee, m.downtimeMin);
        card.className = `glass-card rounded-2xl p-3.5 cursor-pointer relative overflow-hidden flex flex-col justify-between ${isCritical ? 'border-rose-500/45 bg-rose-950/15' : ''}`;

        // Budowa 5 mini-słupków trendu OEE
        const sparkHtml = m.sparkBars.map((val, bIdx) => {
            const barColor = val === 0 ? 'bg-slate-800' : (val < 68 ? 'bg-rose-500' : (val < 78 ? 'bg-amber-400' : 'bg-emerald-400'));
            const isLast = bIdx === 4;
            return `<div class="flex-1 bg-slate-900 rounded-t-sm h-7 flex items-end overflow-hidden" title="T-${4 - bIdx}: ${val.toFixed(1)}%">
                        <div class="w-full ${barColor} ${isLast ? 'opacity-100' : 'opacity-55'} transition-all duration-500" style="height: ${Math.max(8, val)}%"></div>
                    </div>`;
        }).join('');

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[10px] font-bold text-amber-400">${m.id}</span>
                        ${rankIdx === 0 && !isFutureShiftToday && m.oee > 0 ? '<span class="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 font-mono text-[9px] text-rose-300 font-bold">PRIORYTET #1</span>' : ''}
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${m.hasLiveAlert ? '<span class="px-1.5 py-0.2 rounded bg-rose-500 text-white font-mono text-[9px] font-bold">LIVE</span>' : ''}
                        <span class="w-2 h-2 rounded-full ${statusDotClass}"></span>
                    </div>
                </div>
                <h4 class="font-display font-bold text-sm text-white truncate">${m.name}</h4>
                <p class="text-[11px] text-slate-400 mb-2.5">${m.area}</p>
            </div>

            <!-- Sekcja wykresów na karcie gniazda -->
            <div class="space-y-2.5 pt-2 border-t border-slate-800/80">
                <!-- Pasek składowych A / P / Q -->
                <div>
                    <div class="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                        <span>A:${m.avail.toFixed(0)}%</span>
                        <span>P:${m.perf.toFixed(0)}%</span>
                        <span>Q:${m.qual.toFixed(0)}%</span>
                    </div>
                    <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden flex gap-0.5">
                        <div class="h-full bg-rose-500" style="width: ${m.avail / 3}%"></div>
                        <div class="h-full bg-amber-400" style="width: ${m.perf / 3}%"></div>
                        <div class="h-full bg-emerald-400" style="width: ${m.qual / 3}%"></div>
                    </div>
                </div>

                <!-- Mini-wykres słupkowy trendu + OEE i Przestoje -->
                <div class="flex items-end justify-between gap-3 pt-1">
                    <div class="w-20 flex items-end gap-1 shrink-0">
                        ${sparkHtml}
                    </div>
                    <div class="text-right font-mono">
                        <span class="text-[10px] text-slate-500 block">OEE / Straty</span>
                        <span class="font-bold text-xs ${oeeTextColor}">${m.oee.toFixed(1)}%</span>
                        <span class="text-[11px] text-slate-400"> / <strong class="${m.downtimeMin > 0 ? 'text-rose-400' : 'text-slate-400'}">${m.downtimeMin}m</strong></span>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// =============================================================================
// 7. ODBIÓR MELDUNKÓW NA ŻYWO Z TERMINALA (MQTT / STORAGE)
// =============================================================================
function handleIncomingTerminalEvent(liveEvent) {
    if (!AppState.allEvents.some(e => e.id === liveEvent.id)) {
        AppState.allEvents.unshift(liveEvent);
    }

    recalculateAndRenderAll(false);

    addPushPullTask({
        title: `Awaria Live: ${liveEvent.machineName} (${liveEvent.machineId})`,
        desc: `${liveEvent.faultDescription} • Strata: ${liveEvent.durationMin} min (${liveEvent.shiftName})`,
        priority: 'HIGH'
    });
}

// =============================================================================
// 8. MODUŁ 5S VISION (HYBRYDA: BAZA JSON + LEKKI BUFOR SESJI)
// =============================================================================
async function load5SVisionDatabase() {
    let baseData = { stations: [], audits: [] };

    try {
        const res = await fetch('data/audits_5s.json');
        if (res.ok) {
            baseData = await res.json();
        }
    } catch (e) {
        console.warn('[5S Vision] Nie udało się pobrać data/audits_5s.json:', e);
        baseData = {
            stations: [
                { id: 'ws_weld', name: 'Spawanie Manualne MIG/MAG', code: 'S-02', area: 'Spawalnia PK1' },
                { id: 'ws_laser', name: 'Laser BLM Płytowy CNC', code: 'L-01', area: 'Cięcie PK1' }
            ],
            audits: []
        };
    }

    const customStations = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_STATIONS) || '[]');
    const liveAudits = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIVE_5S_AUDITS) || '[]');

    AppState.visionBaseData = {
        stations: [...customStations, ...(baseData.stations || [])],
        audits: [...liveAudits, ...(baseData.audits || [])]
    };

    populateVisionStationSelect();
    render5SAuditHistory();
}

function populateVisionStationSelect() {
    const sel = document.getElementById('vision-station-select');
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = '';

    AppState.visionBaseData.stations.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st.id;
        opt.textContent = `${st.code} • ${st.name} (${st.area})`;
        sel.appendChild(opt);
    });

    if (prevVal && AppState.visionBaseData.stations.some(s => s.id === prevVal)) {
        sel.value = prevVal;
    }
}

function handleVisionFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        AppState.currentVisionImageBase64 = e.target.result;
        const preview = document.getElementById('vision-preview-img');
        const placeholder = document.getElementById('vision-upload-placeholder');
        if (preview && placeholder) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
    };
    reader.readAsDataURL(file);
}

async function executeLiveVisionAudit() {
    const sel = document.getElementById('vision-station-select');
    const notesEl = document.getElementById('vision-notes-input');
    const btn = document.getElementById('btn-run-vision');
    if (!sel) return;

    const station = AppState.visionBaseData.stations.find(s => s.id === sel.value) || {
        id: 'ws_custom', name: 'Stanowisko Produkcyjne', code: 'G-01'
    };

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Skanowanie 1S–5S i BHP (Gemini 2.5 Pro)...`;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const report = await GeminiEngine.analyzeVisual5S(
            AppState.currentVisionImageBase64,
            station,
            notesEl ? notesEl.value : ''
        );

        const nowCtx = MESBus.getProductionTimeContext(new Date());
        const newRecord = {
            stationId: station.id,
            timestamp: `${nowCtx.dateStr} ${nowCtx.timeFormatted.slice(0, 5)}`,
            ...report,
            imageBase64: AppState.currentVisionImageBase64 ? await createTinyThumbnail(AppState.currentVisionImageBase64) : null
        };

        AppState.visionBaseData.audits.unshift(newRecord);

        const liveAudits = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIVE_5S_AUDITS) || '[]');
        liveAudits.unshift(newRecord);
        if (liveAudits.length > 4) liveAudits.length = 4;
        try {
            localStorage.setItem(STORAGE_KEYS.LIVE_5S_AUDITS, JSON.stringify(liveAudits));
        } catch (storageErr) {
            localStorage.removeItem(STORAGE_KEYS.LIVE_5S_AUDITS);
        }

        render5SAuditHistory();
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="scan-eye" class="w-4 h-4"></i> Uruchom Inspekcję 5S Vision`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function createTinyThumbnail(base64Str) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 360 / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.65));
        };
        img.onerror = () => resolve(null);
        img.src = base64Str;
    });
}

function render5SAuditHistory() {
    const sel = document.getElementById('vision-station-select');
    const resultPanel = document.getElementById('vision-result-panel');
    const historyList = document.getElementById('vision-history-list');
    const badge = document.getElementById('vision-latest-score-badge');
    if (!sel || !resultPanel || !historyList) return;

    const stationAudits = AppState.visionBaseData.audits.filter(a => a.stationId === sel.value);

    if (stationAudits.length === 0) {
        badge.textContent = 'Ocena: Brak audytów';
        resultPanel.innerHTML = `
            <div class="p-6 text-center border border-dashed border-slate-800 rounded-xl text-xs font-mono text-slate-400">
                Brak wcześniejszych audytów dla tego gniazda. Wgraj zdjęcie po lewej, aby wykonać inspekcję bazową.
            </div>`;
        historyList.innerHTML = '';
        return;
    }

    const latest = stationAudits[0];
    const scoreNum = parseFloat(latest.score);
    const scoreColor = scoreNum >= 4.0 ? 'text-emerald-400' : (scoreNum >= 3.0 ? 'text-amber-400' : 'text-rose-400');
    badge.textContent = `Ocena: ${latest.score} / 5.00`;
    badge.className = `px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs font-bold ${scoreColor}`;

    resultPanel.innerHTML = `
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <span class="text-xs font-mono text-slate-400">Data audytu: <strong class="text-white">${latest.timestamp}</strong></span>
                <span class="px-2 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-amber-400">${latest.source || 'Silnik 5S'}</span>
            </div>
            <div class="grid grid-cols-5 gap-2 text-center font-mono text-xs">
                <div class="bg-slate-950 p-2 rounded-lg border border-slate-800"><span class="text-[10px] text-slate-500 block">1S Sort</span><strong class="text-white">${latest.s1}</strong></div>
                <div class="bg-slate-950 p-2 rounded-lg border border-slate-800"><span class="text-[10px] text-slate-500 block">2S Syst</span><strong class="text-white">${latest.s2}</strong></div>
                <div class="bg-slate-950 p-2 rounded-lg border border-slate-800"><span class="text-[10px] text-slate-500 block">3S Sprz</span><strong class="text-white">${latest.s3}</strong></div>
                <div class="bg-slate-950 p-2 rounded-lg border border-slate-800"><span class="text-[10px] text-slate-500 block">4S Stan</span><strong class="text-white">${latest.s4}</strong></div>
                <div class="bg-slate-950 p-2 rounded-lg border border-slate-800"><span class="text-[10px] text-slate-500 block">5S Dysc</span><strong class="text-white">${latest.s5}</strong></div>
            </div>
            <div class="space-y-1.5">
                ${(latest.observations || []).map(obs => `
                    <div class="flex items-start justify-between gap-2 text-xs bg-slate-950/80 p-2 rounded-lg border border-slate-800/80">
                        <span class="text-slate-200">${obs.text}</span>
                        <span class="font-mono text-[11px] shrink-0 ${String(obs.pen).includes('+') ? 'text-emerald-400' : 'text-rose-400'}">${obs.pen}</span>
                    </div>
                `).join('')}
            </div>
            <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs">
                <span class="font-mono font-bold text-amber-400 block mb-0.5">WYMAGANE DZIAŁANIE CAPA:</span>
                <p class="text-slate-200">${latest.capa}</p>
            </div>
        </div>
    `;

    historyList.innerHTML = stationAudits.map((item, idx) => `
        <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-3 min-w-0">
                ${item.imageBase64 ? `<img src="${item.imageBase64}" class="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0">` : `<div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-mono text-[10px] text-slate-400 shrink-0">#${stationAudits.length - idx}</div>`}
                <div class="truncate">
                    <div class="font-mono text-white font-semibold">${item.timestamp} • Ocena: ${item.score}</div>
                    <p class="text-slate-400 truncate">${item.capa}</p>
                </div>
            </div>
        </div>
    `).join('');
}

// =============================================================================
// 9. SZTAB KRYZYSOWY 5-WHY Z ANIMOWANYM PASKIEM POSTĘPU
// =============================================================================
function renderIncidentsList(filteredEvents) {
    const listEl = document.getElementById('incidents-list');
    const countBadge = document.getElementById('incident-list-count');
    const topBadge = document.getElementById('badge-active-incidents');
    if (!listEl) return;

    if (countBadge) countBadge.textContent = filteredEvents.length;
    if (topBadge) topBadge.textContent = filteredEvents.length;

    if (filteredEvents.length === 0) {
        listEl.innerHTML = `<div class="p-4 text-center text-xs font-mono text-slate-500">Brak zarejestrowanych przestojów w wybranym oknie czasu.</div>`;
        return;
    }

    listEl.innerHTML = filteredEvents.slice(0, 40).map(ev => {
        const isSelected = ev.id === AppState.selectedIncidentId;
        return `
            <div onclick="selectIncidentForCapa('${ev.id}')" class="p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-amber-500/15 border-amber-500/50' : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'}">
                <div class="flex items-center justify-between text-[11px] font-mono mb-1">
                    <span class="text-amber-400 font-bold">${ev.machineId} • ${ev.faultCode}</span>
                    <span class="text-rose-400 font-bold">-${ev.durationMin} min</span>
                </div>
                <p class="text-xs font-semibold text-white truncate">${ev.faultDescription}</p>
                <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5">
                    <span>${ev.dateStr} ${ev.timeFormatted.slice(0, 5)}</span>
                    <span>Zmiana ${ev.shiftId}</span>
                </div>
            </div>
        `;
    }).join('');
}

function selectIncidentForCapa(incidentId) {
    AppState.selectedIncidentId = incidentId;
    const ev = AppState.allEvents.find(e => e.id === incidentId);
    if (!ev) return;

    document.getElementById('capa-selected-title').textContent = `${ev.machineName} (${ev.machineId}) – ${ev.faultDescription}`;
    recalculateAndRenderAll(false);
}

function openBottleneckInCapa() {
    switchMainTab('capa');
    if (AppState.selectedIncidentId) {
        selectIncidentForCapa(AppState.selectedIncidentId);
        run5WhyAnalysis();
    }
}

async function run5WhyAnalysis() {
    const ev = AppState.allEvents.find(e => e.id === AppState.selectedIncidentId) || AppState.allEvents[0];
    if (!ev) return;

    AppState.selectedIncidentId = ev.id;
    document.getElementById('capa-selected-title').textContent = `${ev.machineName} (${ev.machineId}) – ${ev.faultDescription}`;

    const btn = document.getElementById('btn-run-5why');
    const note = document.getElementById('gemba-note-input').value;
    const progressBox = document.getElementById('five-why-progress-box');
    const progressBar = document.getElementById('five-why-progress-bar');
    const progressStep = document.getElementById('five-why-progress-step');
    const progressPct = document.getElementById('five-why-progress-pct');

    btn.disabled = true;
    progressBox.classList.remove('hidden');
    progressBar.style.width = '10%';
    progressPct.textContent = '10%';
    progressStep.textContent = '1/4 Pobieranie telemetrii gniazda i kodu błędu...';

    // Animacja etapów diagnostycznych w trakcie oczekiwania na odpowiedź modelu
    const stageTimers = [
        setTimeout(() => {
            progressBar.style.width = '38%';
            progressPct.textContent = '38%';
            progressStep.textContent = '2/4 Korelacja przestoju z historią TPM i przezbrojeń SMED...';
        }, 350),
        setTimeout(() => {
            progressBar.style.width = '68%';
            progressPct.textContent = '68%';
            progressStep.textContent = '3/4 Wnioskowanie przyczynowe 5-Why (Gemini 2.5 Flash)...';
        }, 850),
        setTimeout(() => {
            progressBar.style.width = '88%';
            progressPct.textContent = '88%';
            progressStep.textContent = '4/4 Walidacja BHP oraz generowanie zadania CAPA...';
        }, 1500)
    ];

    try {
        const res = await GeminiEngine.analyzeIncident(ev, note);
        stageTimers.forEach(clearTimeout);

        progressBar.style.width = '100%';
        progressPct.textContent = '100%';
        progressStep.textContent = 'Analiza zakończona!';

        await new Promise(r => setTimeout(r, 260));
        progressBox.classList.add('hidden');

        AppState.last5WhyResult = { incident: ev, ...res };
        document.getElementById('capa-engine-badge').textContent = res.source;

        const container = document.getElementById('five-why-container');
        const steps = [
            { key: 'w1', label: '1. DLACZEGO (Objaw bezpośredni)' },
            { key: 'w2', label: '2. DLACZEGO (Przyczyna fizyczna)' },
            { key: 'w3', label: '3. DLACZEGO (Stan pośredni)' },
            { key: 'w4', label: '4. DLACZEGO (Luka procesowa)' },
            { key: 'w5', label: '5. DLACZEGO (Przyczyna Źródłowa / Root Cause)' }
        ];

        container.innerHTML = `
            <div class="space-y-2">
                ${steps.map(st => `
                    <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
                        <span class="text-[10px] font-mono text-amber-400 uppercase block mb-1">${st.label}</span>
                        <input type="text" id="edit-${st.key}" value="${(res[st.key] || '').replace(/"/g, '&quot;')}" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none">
                    </div>
                `).join('')}
                <div class="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 space-y-2">
                    <span class="text-[10px] font-mono text-emerald-400 uppercase font-bold block">ZALECANE ZADANIE KORYGUJĄCE CAPA (Manager Override):</span>
                    <textarea id="edit-capa-text" rows="2" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500">${res.capa || ''}</textarea>
                    <div class="flex items-center justify-between pt-1">
                        <span class="text-xs font-mono text-slate-400">Właściciel: <strong class="text-white">${res.owner || 'Utrzymanie Ruchu'}</strong></span>
                        <button onclick="approveCapaAction()" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs transition-all">
                            Zatwierdź i Wdróż CAPA
                        </button>
                    </div>
                </div>
            </div>
        `;
    } finally {
        stageTimers.forEach(clearTimeout);
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Generuj Analizę 5-Why`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function approveCapaAction() {
    if (!AppState.last5WhyResult) return;
    const capaText = document.getElementById('edit-capa-text').value.trim();

    const dangerKeywords = ['zmostkuj', 'wyłącz kurtyn', 'omiń czujnik', 'zablokuj krańcówk', 'bez osłon'];
    if (dangerKeywords.some(kw => capaText.toLowerCase().includes(kw))) {
        alert('BLOKADA AI SAFETY INTERLOCK: Wykryto polecenie naruszające integralność systemów bezpieczeństwa BHP/Poka-Yoke. Zapis odrzucony!');
        return;
    }

    const nowCtx = MESBus.getProductionTimeContext(new Date());
    const approved = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPROVED_CAPAS) || '[]');
    approved.unshift({
        id: 'CAPA-' + Date.now(),
        timestamp: `${nowCtx.dateStr} ${nowCtx.timeFormatted.slice(0, 5)}`,
        machine: AppState.last5WhyResult.incident.machineName,
        capa: capaText,
        owner: AppState.last5WhyResult.owner || 'Utrzymanie Ruchu'
    });

    localStorage.setItem(STORAGE_KEYS.APPROVED_CAPAS, JSON.stringify(approved));
    renderApprovedCapas();
}

function renderApprovedCapas() {
    const list = document.getElementById('approved-capa-list');
    if (!list) return;
    const approved = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPROVED_CAPAS) || '[]');

    if (approved.length === 0) {
        list.innerHTML = `<p class="text-xs font-mono text-slate-500">Brak zatwierdzonych działań CAPA w bieżącym rejestrze.</p>`;
        return;
    }

    list.innerHTML = approved.map(item => `
        <div class="bg-slate-900/80 border border-emerald-500/20 rounded-xl p-2.5 text-xs flex items-center justify-between gap-2">
            <div>
                <span class="font-mono text-[10px] text-emerald-400">${item.timestamp} • ${item.machine}</span>
                <p class="text-slate-200 font-medium">${item.capa}</p>
            </div>
            <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] shrink-0">WDROŻONE</span>
        </div>
    `).join('');
}

// =============================================================================
// 10. NAWIGACJA, MODALE, KOLEJKA PUSH-PULL I RESET SESJI
// =============================================================================
function switchMainTab(tabName) {
    ['cockpit', 'capa', 'vision5s', 'standards'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const navBtn = document.getElementById(`nav-${t}`);
        const mobBtn = document.getElementById(`mob-nav-${t}`);

        if (view) view.classList.toggle('hidden', t !== tabName);
        if (navBtn) {
            navBtn.classList.toggle('tab-active', t === tabName);
            navBtn.classList.toggle('text-slate-400', t !== tabName);
        }
        if (mobBtn) {
            mobBtn.classList.toggle('tab-active', t === tabName);
            mobBtn.classList.toggle('text-slate-400', t !== tabName);
        }
    });
}

function initPushPullAndCapas() {
    renderApprovedCapas();
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.PUSHPULL_TASKS) || '[]');
    if (existing.length === 0) {
        const initialTasks = [
            { id: 'T1', title: 'Weryfikacja palety buforowej Laser BLM (L-01)', desc: 'Zwolnienie strefy odkładczej przed szczytem Zmiany II', priority: 'HIGH' },
            { id: 'T2', title: 'Przegląd TPM podajnika drutu S-02', desc: 'Kontrola rolek dociskowych i czystości pancerza', priority: 'MED' },
            { id: 'T3', title: 'Audyt LPA strefy śrutowni K-02', desc: 'Weryfikacja wdrożenia listy uszczelniającej próg komory', priority: 'MED' }
        ];
        localStorage.setItem(STORAGE_KEYS.PUSHPULL_TASKS, JSON.stringify(initialTasks));
    }
    renderPushPullTasks();
}

function addPushPullTask(task) {
    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.PUSHPULL_TASKS) || '[]');
    tasks.unshift({ id: 'T-' + Date.now(), ...task });
    localStorage.setItem(STORAGE_KEYS.PUSHPULL_TASKS, JSON.stringify(tasks));
    renderPushPullTasks();
}

function completePushPullTask(id) {
    let tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.PUSHPULL_TASKS) || '[]');
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.PUSHPULL_TASKS, JSON.stringify(tasks));
    renderPushPullTasks();
}

function renderPushPullTasks() {
    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.PUSHPULL_TASKS) || '[]');
    const counter = document.getElementById('pushpull-counter');
    const list = document.getElementById('pushpull-list');
    if (counter) counter.textContent = tasks.length;
    if (!list) return;

    if (tasks.length === 0) {
        list.innerHTML = `<p class="text-xs font-mono text-slate-500 text-center py-6">Kolejka zadań pusta – przepływ zbalansowany.</p>`;
        return;
    }

    list.innerHTML = tasks.map(t => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${t.priority === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}">${t.priority}</span>
                <button onclick="completePushPullTask('${t.id}')" class="text-[11px] font-mono text-emerald-400 hover:underline">Zakończ ✓</button>
            </div>
            <h4 class="text-xs font-bold text-white">${t.title}</h4>
            <p class="text-[11px] text-slate-400">${t.desc}</p>
        </div>
    `).join('');
}

function togglePushPullDrawer() {
    const drawer = document.getElementById('pushpull-drawer');
    if (drawer) drawer.classList.toggle('translate-x-full');
}

function openAiConfigModal() {
    const modal = document.getElementById('ai-config-modal');
    const input = document.getElementById('gemini-key-input');
    if (input) input.value = GeminiEngine.getApiKey();
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeAiConfigModal() {
    const modal = document.getElementById('ai-config-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function saveGeminiApiKey() {
    const val = document.getElementById('gemini-key-input').value;
    GeminiEngine.setApiKey(val);
    updateAiStatusPill();
    closeAiConfigModal();
}

function clearGeminiApiKey() {
    GeminiEngine.setApiKey('');
    document.getElementById('gemini-key-input').value = '';
    updateAiStatusPill();
    closeAiConfigModal();
}

function updateAiStatusPill() {
    const active = GeminiEngine.hasActiveApiKey();
    const dot = document.getElementById('ai-status-dot');
    const lbl = document.getElementById('ai-status-label');
    if (dot) dot.className = `w-2 h-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`;
    if (lbl) lbl.textContent = active ? 'AI: Gemini 2.5 Pro/Flash' : 'AI: Edge Offline';
}

function openAddStationModal() {
    const m = document.getElementById('add-station-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
}

function closeAddStationModal() {
    const m = document.getElementById('add-station-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

function confirmAddStation() {
    const name = document.getElementById('new-station-name').value.trim();
    const code = document.getElementById('new-station-code').value.trim() || 'G-99';
    const area = document.getElementById('new-station-area').value.trim() || 'Wydział Produkcyjny';
    if (!name) return;

    const newSt = { id: 'ws_' + Date.now(), name, code, area };
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_STATIONS) || '[]');
    custom.unshift(newSt);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_STATIONS, JSON.stringify(custom));

    AppState.visionBaseData.stations.unshift(newSt);
    populateVisionStationSelect();
    document.getElementById('vision-station-select').value = newSt.id;
    render5SAuditHistory();
    closeAddStationModal();
}

function openMachineDetailModal(machine, events, oee, downtimeMin) {
    const modal = document.getElementById('machine-detail-modal');
    const content = document.getElementById('machine-detail-content');
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
                <span class="text-[10px] font-mono text-amber-400 uppercase">${machine.id} • ${machine.area}</span>
                <h3 class="font-display font-bold text-lg text-white">${machine.name}</h3>
            </div>
            <button onclick="closeMachineDetailModal()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="grid grid-cols-3 gap-2 font-mono text-xs text-center">
            <div class="bg-slate-900 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">OEE Okresu</span><strong class="text-amber-400 text-sm">${oee.toFixed(1)}%</strong></div>
            <div class="bg-slate-900 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">Straty Czasu</span><strong class="text-rose-400 text-sm">${downtimeMin} min</strong></div>
            <div class="bg-slate-900 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">Takt Normatywny</span><strong class="text-white text-sm">${machine.nominalTaktMin} min</strong></div>
        </div>
        <div class="space-y-2 max-h-48 overflow-y-auto">
            <span class="text-xs font-mono text-slate-400 block">Zdarzenia w wybranym oknie (${events.length}):</span>
            ${events.length === 0 ? '<p class="text-xs text-slate-500 font-mono">Brak przestojów – praca ciągła.</p>' : events.map(e => `
                <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                    <div>
                        <span class="font-mono text-amber-400">${e.dateStr} ${e.timeFormatted.slice(0,5)} (Zm. ${e.shiftId})</span>
                        <p class="text-slate-200">${e.faultDescription}</p>
                    </div>
                    <span class="font-mono font-bold text-rose-400">-${e.durationMin}m</span>
                </div>
            `).join('')}
        </div>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeMachineDetailModal() {
    const modal = document.getElementById('machine-detail-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function hardResetSystemData() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    MESBus.clearStoredLiveEvents();
    location.reload();
}