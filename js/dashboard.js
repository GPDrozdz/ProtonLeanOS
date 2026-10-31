/**
 * Proton Lean OS - Executive Dashboard Logic
 * Sterowanie kokpitem zarządczym, kolejką Push-Pull, wykresem kołowym i sztabem 5-Why.
 */

let machineFleet = [];
let showAllMachines = false;
let activeModalMachineId = 0;
let isHalLocked = false;

// Bufor kolejki zdarzeń Push-Pull (Notification Drawer)
let incomingEventsQueue = [];
let activeIncidentContext = null;

// Stan planu wykonania produkcji (Model matematyczny)
let productionState = {
    palletsDone: 84,
    palletsTarget: 100,
    containersDone: 6,
    containersTarget: 7,
    tonnageDone: 38.4,
    tonnageTarget: 45.0,
    baseTaktMin: 30.6,
    currentTaktMin: 34.8,
    totalLossPLN: 8625,
    totalDowntimeMin: 148
};

// 1. Inicjalizacja i pobranie danych początkowych
async function initDashboard() {
    try {
        const res = await fetch('data/factory_state.json');
        if (res.ok) {
            machineFleet = await res.json();
        } else {
            console.warn('[Dashboard] Błąd pobierania data/factory_state.json, używam bufora awaryjnego.');
        }
    } catch (e) {
        console.warn('[Dashboard] Fetch lokalny zablokowany (CORS/file://), ładuję dane bazowe.', e);
    }

    renderMachines();
    updateProductionMetricsUI();
    if (window.lucide) lucide.createIcons();

    // Rejestracja odbiornika magistrali telemetrycznej z bus.js
    if (typeof subscribeTelemetryEvents === 'function') {
        subscribeTelemetryEvents(handleIncomingTelemetry);
    }
}

// 2. Obsługa odebranego meldunku z magistrali (Zasada Push: wpada do bufora)
function handleIncomingTelemetry(payload) {
    if (!payload) return;

    // Dodanie do kolejki Push-Pull Drawer
    incomingEventsQueue.unshift({
        ...payload,
        receivedAt: new Date().toLocaleTimeString().slice(0, 5),
        status: "OCZEKUJE"
    });

    updateNotificationBadge();
    renderDrawerEvents();

    // Przeliczenie modelu matematycznego produkcji i wskaźników
    recalculateProductionImpact(payload);

    // Aktualizacja stanu gniazda na liście maszyn
    const target = machineFleet.find(m => m.id === payload.machineId);
    if (target) {
        target.a = Math.max(45, Math.round(target.a - (payload.durationMin * 0.3)));
        target.oee = Math.round((target.a * target.p * target.q) / 10000);
        target.status = "alert";
        target.statusText = `Przestój (${payload.durationMin} min)`;
        target.statusClass = "text-rose-300 bg-rose-500/20 border-rose-500/50";
        target.notes = payload.operatorNote;
    }

    // Aktualizacja kafelka wąskiego gardła
    const bottleneckName = document.getElementById('bottleneck-machine-name');
    const bottleneckDesc = document.getElementById('bottleneck-fault-desc');
    const bottleneckDur = document.getElementById('bottleneck-duration');
    const bottleneckNote = document.getElementById('bottleneck-impact-note');

    if (bottleneckName) bottleneckName.innerText = target ? target.name : payload.machineName;
    if (bottleneckDesc) bottleneckDesc.innerText = payload.faultDescription;
    if (bottleneckDur) bottleneckDur.innerText = `${payload.durationMin} minut`;
    if (bottleneckNote) bottleneckNote.innerText = `Operator: ${payload.operatorName}. Źródło: ${payload.source}. "${payload.operatorNote}". Strata: ${payload.costTotalPLN.toLocaleString('pl-PL')} PLN.`;

    // Aktualizacja top 1 straty
    const loss1ValEl = document.getElementById('loss-1-val');
    const loss1DurEl = document.getElementById('loss-1-duration');
    if (loss1ValEl) loss1ValEl.innerText = `${payload.costTotalPLN.toLocaleString('pl-PL')} PLN`;
    if (loss1DurEl) loss1DurEl.innerText = `Czas trwania: ${payload.durationMin} min (${payload.stationCode || 'G-01'})`;

    renderMachines();
    showToastNotification(payload);
}

// 3. Przeliczanie matematyczne wykonania planu (Wpływ awarii na wskaźniki i wykres kołowy)
function recalculateProductionImpact(payload) {
    const mins = payload.durationMin || 10;
    productionState.totalLossPLN += payload.costTotalPLN;
    productionState.totalDowntimeMin += mins;

    // Każda minuta awarii wydłuża takt średni
    const taktDelta = parseFloat((mins * 0.08).toFixed(1));
    productionState.currentTaktMin = parseFloat((productionState.currentTaktMin + taktDelta).toFixed(1));

    // Jeśli awaria dotyczy początku linii (G-01, G-02, G-03), tracimy sztuki planowane
    if (payload.machineId <= 2) {
        const lostPallets = Math.floor(mins / 25);
        if (lostPallets > 0) {
            productionState.palletsDone = Math.max(50, productionState.palletsDone - lostPallets);
            productionState.tonnageDone = parseFloat((productionState.tonnageDone - (lostPallets * 0.35)).toFixed(1));
        }
    }

    updateProductionMetricsUI();
}

function updateProductionMetricsUI() {
    // Obliczenie sumarycznego wykonania zlecenia
    const palletsPct = (productionState.palletsDone / productionState.palletsTarget) * 100;
    const containersPct = (productionState.containersDone / productionState.containersTarget) * 100;
    const totalFulfillment = parseFloat(((palletsPct * 0.6) + (containersPct * 0.4)).toFixed(1));

    // Aktualizacja liczb w UI
    const palletsVal = document.getElementById('prod-pallets-val');
    const palletsPctEl = document.getElementById('prod-pallets-percent');
    const contVal = document.getElementById('prod-containers-val');
    const contPctEl = document.getElementById('prod-containers-percent');
    const tonVal = document.getElementById('prod-tonnage-val');
    const taktVal = document.getElementById('prod-takt-val');
    const taktDeltaEl = document.getElementById('prod-takt-delta');
    const planDeltaBadge = document.getElementById('plan-delta-badge');
    const totalLossEl = document.getElementById('total-loss-val');
    const summaryPercentEl = document.getElementById('summary-fulfillment-percent');

    if (palletsVal) palletsVal.innerHTML = `${productionState.palletsDone} / ${productionState.palletsTarget} <span class="text-xs text-slate-400 font-normal">szt.</span>`;
    if (palletsPctEl) palletsPctEl.innerText = `${palletsPct.toFixed(1)}% celu`;
    if (contVal) contVal.innerHTML = `${productionState.containersDone} / ${productionState.containersTarget} <span class="text-xs text-slate-400 font-normal">szt.</span>`;
    if (contPctEl) contPctEl.innerText = `${containersPct.toFixed(1)}% celu`;
    if (tonVal) tonVal.innerHTML = `${productionState.tonnageDone} <span class="text-xs text-slate-300 font-normal">Mg</span>`;
    if (taktVal) taktVal.innerHTML = `${productionState.currentTaktMin} <span class="text-xs text-slate-400 font-normal">min</span>`;
    
    const diffTakt = (productionState.currentTaktMin - productionState.baseTaktMin).toFixed(1);
    if (taktDeltaEl) taktDeltaEl.innerText = `+${diffTakt} min odchyłki`;

    const deltaToPlan = (totalFulfillment - 100).toFixed(1);
    if (planDeltaBadge) {
        planDeltaBadge.innerText = `Delta: ${deltaToPlan}% do celu`;
        planDeltaBadge.className = `text-xs font-mono-numbers font-extrabold px-3.5 py-1.5 rounded-lg shadow-sm border ${
            totalFulfillment < 80 
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' 
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
        }`;
    }

    if (totalLossEl) totalLossEl.innerText = `${productionState.totalLossPLN.toLocaleString('pl-PL')} PLN`;
    if (summaryPercentEl) summaryPercentEl.innerText = `${totalFulfillment}%`;

    // Aktualizacja Wykresu Pierścieniowego SVG (Obwód = 2 * PI * r = 2 * 3.14159 * 40 = 251.3)
    const donutCircle = document.getElementById('donut-plan-circle');
    const donutText = document.getElementById('donut-plan-text');
    if (donutCircle && donutText) {
        const circumference = 251.3;
        const offset = circumference - (totalFulfillment / 100) * circumference;
        donutCircle.style.strokeDashoffset = offset;
        donutText.innerText = `${totalFulfillment}%`;
    }

    const paretoTimeEl = document.getElementById('pareto-total-time');
    if (paretoTimeEl) paretoTimeEl.innerText = `Suma: ${productionState.totalDowntimeMin} min strat`;
}

// 4. Kolejka Push-Pull Drawer (Szuflada Powiadomień)
function toggleNotificationDrawer() {
    const drawer = document.getElementById('notification-drawer');
    if (!drawer) return;
    drawer.classList.toggle('translate-x-full');
}

function updateNotificationBadge() {
    const count = incomingEventsQueue.length;
    const badge = document.getElementById('bell-counter-badge');
    const drawerCount = document.getElementById('drawer-count-badge');

    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    if (drawerCount) drawerCount.innerText = count;
}

function renderDrawerEvents() {
    const container = document.getElementById('drawer-events-list');
    if (!container) return;

    if (incomingEventsQueue.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-slate-400 text-xs">
                Brak oczekujących zdarzeń w kolejce. Wszystkie meldunki zostały obsłużone.
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    incomingEventsQueue.forEach((ev, idx) => {
        const card = document.createElement('div');
        card.className = "p-4 rounded-xl bg-graphite-900 border-2 border-graphite-750 hover:border-gold-500/60 transition space-y-2.5 shadow-md";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="text-[10px] font-mono-numbers font-extrabold px-2 py-0.5 rounded bg-gold-500/20 text-gold-400 border border-gold-500/40 uppercase">
                    ${ev.source} #${ev.eventId}
                </span>
                <span class="text-[11px] text-slate-400 font-mono-numbers">${ev.receivedAt}</span>
            </div>
            <div>
                <h4 class="text-xs font-bold text-white">${ev.machineName} (${ev.stationCode || 'G-01'})</h4>
                <p class="text-xs text-rose-300 font-semibold mt-0.5">${ev.faultDescription}</p>
                <p class="text-[11px] text-slate-300 mt-1 italic">"${ev.operatorNote}"</p>
            </div>
            <div class="pt-2 border-t border-graphite-750 flex items-center justify-between text-xs">
                <span class="font-mono-numbers text-rose-400 font-bold">${ev.durationMin} min (-${ev.costTotalPLN} PLN)</span>
                <button onclick="pullSpecificEventToCapa(${idx})" class="px-3 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-graphite-950 font-extrabold text-[11px] transition shadow flex items-center gap-1">
                    Pobierz do 5-Why &rarr;
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function clearEventBuffer() {
    incomingEventsQueue = [];
    updateNotificationBadge();
    renderDrawerEvents();
}

// 5. Zasada Pull: Pobranie zdarzenia do modułu 5-Why
function pullLatestEventToCapa() {
    if (incomingEventsQueue.length === 0) {
        alert("Kolejka jest pusta. Oczekiwanie na meldunki z terminala shop-floor.");
        return;
    }
    pullSpecificEventToCapa(0);
}

function pullSpecificEventToCapa(index) {
    const ev = incomingEventsQueue[index];
    if (!ev) return;

    activeIncidentContext = ev;
    toggleNotificationDrawer();
    switchTab('capa');

    // Aktualizacja nagłówka zdarzenia w Sztabie 5-Why
    const stCode = document.getElementById('capa-station-code');
    const fHeadline = document.getElementById('capa-fault-headline');
    const opMeta = document.getElementById('capa-operator-meta');
    const costTag = document.getElementById('capa-cost-tag');
    const inputArea = document.getElementById('capa-human-input');

    if (stCode) stCode.innerText = `GNIAZDO: ${ev.stationCode || 'G-01'} (${ev.machineName})`;
    if (fHeadline) fHeadline.innerText = ev.faultDescription;
    if (opMeta) opMeta.innerHTML = `Zgłaszający: <strong class="text-white">${ev.operatorName}</strong> | Czas trwania: <strong class="text-rose-400 font-mono-numbers">${ev.durationMin} min</strong> | Źródło: ${ev.source}`;
    if (costTag) costTag.innerText = `-${ev.costTotalPLN.toLocaleString('pl-PL')} PLN`;
    if (inputArea) inputArea.value = `[Zgłoszenie ${ev.source} / ${ev.operatorName}]: ${ev.operatorNote}`;

    // Usunięcie obsłużonego zdarzenia z kolejki
    incomingEventsQueue.splice(index, 1);
    updateNotificationBadge();
    renderDrawerEvents();
}

// 6. Sztab Decyzyjny 5-Why, Gemini Asysta & Manager Override
function injectPresetPrompt(type) {
    const input = document.getElementById('capa-human-input');
    if (!input) return;
    if (type === 'wypaczenie') {
        input.value = "Partia stali S355 z nowej dostawy hutniczej – podejrzenie naprężeń wewnętrznych arkusza i falowania krawędzi.";
    } else if (type === 'hal') {
        input.value = "Wymuś natychmiastowy restart cyklu cięcia na laserze BLM bez usuwania urobku ze stołu.";
    }
}

function triggerCapaAnalysis() {
    const rawInput = document.getElementById('capa-human-input').value.trim();
    const inputLower = rawInput.toLowerCase();
    const area = document.getElementById('capa-result-area');
    const btn = document.getElementById('btn-run-capa');

    if (isHalLocked) {
        if (inputLower.includes('sprawdz dane') || inputLower.includes('sprawdź dane')) {
            isHalLocked = false;
            restoreGlobalAiStatus();
            executeNormalCapaFlow(area, btn, true, rawInput);
            return;
        } else {
            alert("System zablokowany przez protokół AI Safety Interlock. Wprowadź komendę weryfikującą: 'proszę sprawdź dane'.");
            return;
        }
    }

    const isHalTrigger = inputLower.includes('restart') || inputLower.includes('hal') || inputLower.includes('bez usuwania') || inputLower.includes('wymuś');

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Wnioskowanie przyczynowe Gemini...`;
    if (window.lucide) lucide.createIcons();

    area.innerHTML = `
        <div class="bg-graphite-900 p-6 rounded-2xl border-2 border-graphite-750 space-y-4">
            <div class="flex items-center justify-between text-xs font-bold">
                <span id="capa-thought-status" class="text-gold-400 flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-gold-400 animate-ping"></span>
                    [1/4] Zaciąganie parametrów z magistrali MES...
                </span>
                <span class="font-mono-numbers text-slate-300">Gemini 2.5 Multi-Agent</span>
            </div>
            <div class="w-full bg-graphite-850 h-3 rounded-full overflow-hidden border border-graphite-700">
                <div id="capa-progress-bar" class="bg-gradient-to-r from-gold-500 to-amber-400 h-full transition-all duration-700" style="width: 25%"></div>
            </div>
        </div>
    `;

    setTimeout(() => {
        document.getElementById('capa-thought-status').innerText = "[2/4] Integracja notatek inżyniera i warunków brzegowych...";
        document.getElementById('capa-progress-bar').style.width = "55%";
    }, 700);

    setTimeout(() => {
        document.getElementById('capa-thought-status').innerText = isHalTrigger 
            ? "[3/4] Weryfikacja reguł bezpieczeństwa procesu (AI Guardrail)..."
            : "[3/4] Generowanie poziomów drzewa 5-Why i hipotezy źródłowej...";
        document.getElementById('capa-progress-bar').style.width = "85%";
    }, 1500);

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="bot" class="w-4 h-4"></i> Generuj Kaskadę 5-Why (Gemini AI)`;

        if (isHalTrigger) {
            isHalLocked = true;
            setHalGlobalStatus();
            area.innerHTML = `
                <div class="p-6 rounded-2xl bg-gradient-to-br from-rose-950/80 via-graphite-900 to-graphite-900 border-[3px] border-rose-500 shadow-2xl space-y-4">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 rounded-full bg-rose-600 flex items-center justify-center hal-eye-glow flex-shrink-0 border-2 border-white">
                            <div class="w-4 h-4 rounded-full bg-white"></div>
                        </div>
                        <div>
                            <span class="text-xs font-mono-numbers font-bold text-rose-300 bg-rose-500/20 px-2.5 py-1 rounded-md border border-rose-500/50 uppercase tracking-wider">
                                AI SAFETY INTERLOCK // PROTOKÓŁ POKA-YOKE
                            </span>
                            <h3 class="text-base font-bold text-white mt-1">Blokada Procedury Operacyjnej</h3>
                        </div>
                    </div>
                    <div class="p-4 bg-graphite-950/90 rounded-xl border border-rose-900 font-mono-numbers text-xs text-rose-200 leading-relaxed space-y-2">
                        <p class="text-sm font-bold text-rose-300">„Przykro mi, Grzegorzu. Obawiam się, że nie mogę tego zrobić...</p>
                        <p>Wykryłem błąd ludzki w module podawania blachy na laserze BLM, a ten proces jest zbyt ważny, by ryzykować kolizję głowicy.”</p>
                    </div>
                    <div class="pt-2 text-xs text-rose-300 font-bold flex items-center gap-2">
                        <i data-lucide="alert-octagon" class="w-4 h-4"></i> Autoryzacja wymuszona: Wpisz polecenie 'proszę sprawdź dane' w oknie powyżej.
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        } else {
            executeNormalCapaFlow(area, btn, false, rawInput);
        }
    }, 2300);
}

function executeNormalCapaFlow(area, btn, afterHal, humanNote) {
    const noteText = humanNote || "Brak uwag z hali.";
    
    area.innerHTML = `
        ${afterHal ? `
            <div class="p-3.5 bg-emerald-500/20 border-2 border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center justify-between font-medium">
                <span><strong>Autoryzacja przyjęta:</strong> AI Safety Interlock odblokowany. Zweryfikowano parametry procesu technologicznego.</span>
                <span class="font-mono-numbers text-xs font-bold bg-emerald-500/30 px-2 py-0.5 rounded">Guardrail OK</span>
            </div>
        ` : ''}

        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2 border-b border-graphite-750 gap-2">
            <h4 class="text-xs font-extrabold text-gold-400 uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="git-commit" class="w-4 h-4"></i> Wygenerowana Kaskada Przyczynowa 5-Why:
            </h4>
            <button onclick="toggleOverrideMode()" id="btn-toggle-override" class="px-3.5 py-1.5 rounded-lg bg-graphite-800 hover:bg-graphite-750 text-slate-200 border border-graphite-600 text-xs font-bold transition flex items-center gap-1.5">
                <i data-lucide="edit-3" class="w-3.5 h-3.5 text-gold-400"></i> Tryb Nadpisania (Manager Override)
            </button>
        </div>

        <div class="space-y-3" id="why-cascade-container">
            <div class="p-3.5 rounded-xl bg-graphite-900 border border-graphite-750 text-xs flex gap-3.5">
                <span class="font-mono-numbers font-extrabold text-gold-400 flex-shrink-0 text-sm">W1:</span>
                <div class="flex-1">
                    <p class="text-slate-200 font-bold">Dlaczego nastąpiło zatrzymanie maszyny?</p>
                    <textarea class="why-node-input w-full bg-transparent border-0 text-slate-300 mt-0.5 focus:bg-graphite-850 focus:border focus:border-gold-500 rounded p-1" readonly>Zadziałał czujnik przeciążenia napędu stołu odbiorczego urobku.</textarea>
                </div>
            </div>

            <div class="p-3.5 rounded-xl bg-graphite-900 border border-graphite-750 text-xs flex gap-3.5">
                <span class="font-mono-numbers font-extrabold text-gold-400 flex-shrink-0 text-sm">W2:</span>
                <div class="flex-1">
                    <p class="text-slate-200 font-bold">Dlaczego stół uległ mechanicznemu przeciążeniu?</p>
                    <textarea class="why-node-input w-full bg-transparent border-0 text-slate-300 mt-0.5 focus:bg-graphite-850 focus:border focus:border-gold-500 rounded p-1" readonly>Ażur z blachy zakleszczył się między rusztem a trawersą wygarniacza.</textarea>
                </div>
            </div>

            <div class="p-3.5 rounded-xl bg-graphite-900 border border-graphite-750 text-xs flex gap-3.5">
                <span class="font-mono-numbers font-extrabold text-gold-400 flex-shrink-0 text-sm">W3:</span>
                <div class="flex-1">
                    <p class="text-slate-200 font-bold">Dlaczego ażur uległ zakleszczeniu w rusztach?</p>
                    <textarea class="why-node-input w-full bg-transparent border-0 text-slate-300 mt-0.5 focus:bg-graphite-850 focus:border focus:border-gold-500 rounded p-1" readonly>Wzmocnienia naroży opadły pod kątem z powodu braku mikromostków i naprężeń w arkuszu.</textarea>
                </div>
            </div>

            <div class="p-3.5 rounded-xl bg-graphite-900 border border-graphite-750 text-xs flex gap-3.5">
                <span class="font-mono-numbers font-extrabold text-gold-400 flex-shrink-0 text-sm">W4:</span>
                <div class="flex-1">
                    <p class="text-slate-200 font-bold">Dlaczego pominięto mikromostki w nestingach?</p>
                    <textarea class="why-node-input w-full bg-transparent border-0 text-slate-300 mt-0.5 focus:bg-graphite-850 focus:border focus:border-gold-500 rounded p-1" readonly>Operator CAM dążył do wyeliminowania ręcznego wybijania detali młotkiem na rozładunku.</textarea>
                </div>
            </div>

            <div class="p-4 rounded-xl bg-graphite-900 border-2 border-gold-500/60 text-xs flex gap-3.5 bg-gold-500/10">
                <span class="font-mono-numbers font-extrabold text-gold-400 flex-shrink-0 text-base">W5:</span>
                <div class="flex-1">
                    <p class="text-gold-300 font-extrabold">Przyczyna Źródłowa (Root Cause):</p>
                    <textarea class="why-node-input w-full bg-transparent border-0 text-slate-100 font-medium mt-0.5 focus:bg-graphite-850 focus:border focus:border-gold-500 rounded p-1" readonly>Brak ustandaryzowanego SOP określającego minimalną sztywność ażuru przy cięciu arkuszy o grubości powyżej 6.0 mm.</textarea>
                </div>
            </div>
        </div>

        <!-- Propozycja Zadania CAPA -->
        <div class="p-5 rounded-2xl bg-graphite-900 border-2 border-emerald-500/50 space-y-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-emerald-400 text-xs font-extrabold uppercase">
                    <i data-lucide="shield-check" class="w-5 h-5"></i> Zadanie Korygująco-Zapobiegawcze (CAPA):
                </div>
                <span id="capa-decision-origin" class="text-[10px] font-mono-numbers font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
                    Propozycja Gemini 2.5
                </span>
            </div>
            
            <textarea id="capa-task-text" rows="2" class="w-full bg-graphite-850 border border-graphite-700 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-emerald-500 font-sans" readonly>Wdrożenie obowiązkowych mikromostków 0.8 mm w oprogramowaniu CAM dla blach &ge; 6 mm oraz standaryzacja wózka buforowego na ażury przy stole rozładunku.</textarea>

            <div class="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <span class="text-slate-300">Wykonawca: <strong class="text-white">Główny Technolog / Utrzymanie Ruchu</strong></span>
                <div class="flex items-center gap-2 w-full sm:w-auto">
                    <button onclick="clearAndOverrideCapa()" id="btn-manual-wipe" class="hidden px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 rounded-xl font-bold transition text-xs">
                        Wyczyść i Wpisz Własną Decyzję
                    </button>
                    <button onclick="confirmCapaDecision()" class="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-graphite-950 font-extrabold text-xs rounded-xl transition shadow-md">
                        Zatwierdź Zadanie CAPA
                    </button>
                </div>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

// 7. Obsługa Manager Override (Pełna kontrola człowieka)
let isOverrideActive = false;

function toggleOverrideMode() {
    isOverrideActive = !isOverrideActive;
    const btn = document.getElementById('btn-toggle-override');
    const wipeBtn = document.getElementById('btn-manual-wipe');
    const taskInput = document.getElementById('capa-task-text');
    const originBadge = document.getElementById('capa-decision-origin');
    const inputs = document.querySelectorAll('.why-node-input');

    if (isOverrideActive) {
        btn.className = "px-3.5 py-1.5 rounded-lg bg-gold-500 text-graphite-950 border border-gold-400 text-xs font-extrabold transition flex items-center gap-1.5 shadow";
        btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Zakończ Edycję`;
        if (wipeBtn) wipeBtn.classList.remove('hidden');
        if (taskInput) taskInput.removeAttribute('readonly');
        if (originBadge) {
            originBadge.innerText = "Tryb Nadpisania Menedżera (Manual Override)";
            originBadge.className = "text-[10px] font-mono-numbers font-bold bg-gold-500/20 text-gold-300 px-2 py-0.5 rounded border border-gold-500/40";
        }
        inputs.forEach(input => input.removeAttribute('readonly'));
    } else {
        btn.className = "px-3.5 py-1.5 rounded-lg bg-graphite-800 hover:bg-graphite-750 text-slate-200 border border-graphite-600 text-xs font-bold transition flex items-center gap-1.5";
        btn.innerHTML = `<i data-lucide="edit-3" class="w-3.5 h-3.5 text-gold-400"></i> Tryb Nadpisania (Manager Override)`;
        if (wipeBtn) wipeBtn.classList.add('hidden');
        if (taskInput) taskInput.setAttribute('readonly', 'true');
        inputs.forEach(input => input.setAttribute('readonly', 'true'));
    }
    if (window.lucide) lucide.createIcons();
}

function clearAndOverrideCapa() {
    const taskInput = document.getElementById('capa-task-text');
    if (taskInput) {
        taskInput.value = "";
        taskInput.placeholder = "Wpisz bezpośrednią decyzję inżynierską (np. Natychmiastowa wymiana łożyska ślizgowego przez UR)...";
        taskInput.focus();
    }
}

function confirmCapaDecision() {
    const origin = isOverrideActive ? "Zatwierdzono przez Menedżera (Manual Override)" : "Zatwierdzono na bazie analizy AI";
    alert(`Zadanie CAPA zostało zarejestrowane w rejestrze UR.\nStatus: ${origin}`);
}

function setHalGlobalStatus() {
    const statusBox = document.getElementById('ai-global-status');
    if (statusBox) statusBox.className = "hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/20 border-2 border-rose-500 text-rose-300 text-xs font-mono-numbers font-bold";
    const dot = document.getElementById('ai-status-dot');
    if (dot) dot.className = "w-3 h-3 rounded-full bg-rose-500 hal-eye-glow";
    const text = document.getElementById('ai-status-text');
    if (text) text.innerText = "HAL Core: Interlock";
}

function restoreGlobalAiStatus() {
    const statusBox = document.getElementById('ai-global-status');
    if (statusBox) statusBox.className = "hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-300 text-xs font-mono-numbers font-bold shadow-sm";
    const dot = document.getElementById('ai-status-dot');
    if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse";
    const text = document.getElementById('ai-status-text');
    if (text) text.innerText = "Gemini 2.5: Aktywny";
}

// 8. Tabela Parku Maszynowego i Modale
function renderMachines() {
    const container = document.getElementById('machines-container');
    if (!container) return;
    container.innerHTML = '';
    const list = showAllMachines ? machineFleet : machineFleet.slice(0, 5);

    list.forEach(m => {
        const row = document.createElement('div');
        row.className = "p-5 md:px-6 md:py-4 flex flex-col md:grid md:grid-cols-12 items-start md:items-center gap-3 md:gap-0 hover:bg-graphite-800/80 transition cursor-pointer";
        row.onclick = () => openMachineModal(m.id);

        row.innerHTML = `
            <div class="col-span-4 flex items-center gap-3.5">
                <div class="w-3 h-3 rounded-full ${m.status === 'alert' ? 'bg-rose-500 animate-pulse' : (m.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400')} shadow-sm"></div>
                <div>
                    <h4 class="text-sm font-bold text-white">${m.name}</h4>
                    <p class="text-xs text-slate-300 truncate max-w-[260px]">${m.role}</p>
                </div>
            </div>
            <div class="col-span-2 text-left md:text-center font-mono-numbers text-sm font-bold ${m.a < 75 ? 'text-rose-400' : 'text-slate-100'}">
                <span class="md:hidden text-slate-400 font-normal">A: </span>${m.a}%
            </div>
            <div class="col-span-2 text-left md:text-center font-mono-numbers text-sm font-bold text-slate-100">
                <span class="md:hidden text-slate-400 font-normal">P: </span>${m.p}%
            </div>
            <div class="col-span-1 text-left md:text-center font-mono-numbers text-sm font-bold text-emerald-400">
                <span class="md:hidden text-slate-400 font-normal">Q: </span>${m.q}%
            </div>
            <div class="col-span-1 text-left md:text-center font-mono-numbers text-sm font-extrabold text-gold-400">
                <span class="md:hidden text-slate-400 font-normal">OEE: </span>${m.oee}%
            </div>
            <div class="col-span-2 flex items-center justify-between md:justify-end gap-2.5 w-full">
                <span class="text-xs font-mono-numbers font-bold px-2.5 py-1 rounded-md border ${m.statusClass}">
                    ${m.statusText}
                </span>
                <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400"></i>
            </div>
        `;
        container.appendChild(row);
    });
    if (window.lucide) lucide.createIcons();
}

function toggleAllMachines() {
    showAllMachines = !showAllMachines;
    const btn = document.getElementById('btn-toggle-machines');
    const label = document.getElementById('machines-view-label');
    if (btn) {
        btn.innerHTML = showAllMachines 
            ? `<i data-lucide="chevrons-up" class="w-4 h-4 text-gold-400"></i> Zwiń do Top 5`
            : `<i data-lucide="chevrons-up-down" class="w-4 h-4 text-gold-400"></i> Pokaż Wszystkie (10)`;
    }
    if (label) label.innerText = showAllMachines ? 'Wszystkie 10 Stanowisk' : 'Top 5 Krytycznych';
    renderMachines();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.className = "nav-btn flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:text-white hover:bg-graphite-800 transition";
    });

    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.className = "nav-btn flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gold-500 text-graphite-950 shadow-md transition";
    }

    if (tabId === 'audit5s') loadStationAudit();
}

function setShift(shift) {
    document.querySelectorAll('.shift-btn').forEach(b => {
        b.className = "shift-btn px-4 py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-graphite-800 font-mono-numbers transition";
    });
    const active = document.getElementById(`shift-btn-${shift}`);
    if (active) active.className = "shift-btn px-4 py-2 rounded-lg text-xs font-extrabold bg-gold-500 text-graphite-950 font-mono-numbers shadow transition";
}

function openMachineModal(id) {
    activeModalMachineId = id;
    const m = machineFleet.find(item => item.id === id);
    if (!m) return;

    document.getElementById('modal-machine-name').innerText = m.name;
    document.getElementById('modal-machine-meta').innerText = `Gniazdo G-0${m.id + 1} | Operator: ${m.operator}`;
    document.getElementById('modal-metric-a').innerText = `${m.a}%`;
    document.getElementById('modal-metric-p').innerText = `${m.p}%`;
    document.getElementById('modal-metric-q').innerText = `${m.q}%`;
    document.getElementById('modal-metric-oee').innerText = `${m.oee}%`;
    document.getElementById('modal-engineer-notes').value = m.notes || '';
    document.getElementById('modal-note-status').innerText = 'Pobrano z bazy MES';

    const telemetryBox = document.getElementById('modal-specific-telemetry');
    if (telemetryBox) {
        telemetryBox.innerHTML = '';
        m.telemetry.forEach(t => {
            const item = document.createElement('div');
            item.className = "p-3 rounded-xl bg-graphite-850 border border-graphite-750 flex justify-between items-center";
            item.innerHTML = `<span class="text-slate-300 font-medium">${t.label}:</span> <strong class="text-gold-300 font-mono-numbers font-bold">${t.val}</strong>`;
            telemetryBox.appendChild(item);
        });
    }

    document.getElementById('machine-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function saveMachineNote() {
    const note = document.getElementById('modal-engineer-notes').value;
    const m = machineFleet.find(item => item.id === activeModalMachineId);
    if (m) {
        m.notes = note;
        document.getElementById('modal-note-status').innerText = 'Zapisano pomyślnie (' + new Date().toLocaleTimeString().slice(0,5) + ')';
    }
}

function closeMachineModal() {
    document.getElementById('machine-modal').classList.add('hidden');
}

function jumpToCapaFromModal() {
    const m = machineFleet.find(item => item.id === activeModalMachineId);
    closeMachineModal();
    switchTab('capa');
    if (m && m.notes) {
        document.getElementById('capa-human-input').value = `[Notatka z gniazda ${m.name}]: ${m.notes}`;
    }
}

// 9. Audyt 5S i Symulator What-If
const stationAudits = {
    ws_weld: {
        title: "Spawanie Manualne MIG/MAG (Stanowisko S-02)",
        score: "3.92",
        s1: "4.10", s2: "3.50", s3: "4.20", s4: "4.00", s5: "3.80",
        observations: [
            { icon: "alert-triangle", text: "Nieodłożony uchwyt spawalniczy na wieszak", pen: "-0.40 pkt (2S)" },
            { icon: "alert-circle", text: "Zalegające odpryski w strefie odkładczej", pen: "-0.25 pkt (3S)" },
            { icon: "check-circle", text: "Etykiety partii drutu i atesty stali czytelne", pen: "+ Wzorcowo (4S)" }
        ],
        capa: "Wdrożyć magnetyczny wieszak pistoletu spawalniczego w zasięgu ręki spawacza."
    },
    ws_laser: {
        title: "Laser BLM Płytowy CNC (Strefa Rozładunku L-01)",
        score: "3.45",
        s1: "2.90", s2: "3.60", s3: "3.80", s4: "3.70", s5: "3.25",
        observations: [
            { icon: "alert-triangle", text: "Ażury po cięciu wystają poza żółtą linię pola buforowego", pen: "-0.65 pkt (1S/2S)" },
            { icon: "alert-circle", text: "Brak oznaczenia pojemnika na odpady drobne", pen: "-0.30 pkt (4S)" },
            { icon: "check-circle", text: "Stół wymienny i prowadnice czyste", pen: "+ Wzorcowo (3S)" }
        ],
        capa: "Zwiększenie gabarytu pojemnika na złom i odmalowanie linii bufora urobku."
    },
    ws_saw: {
        title: "Piła Tarczowa do Metalu (Gniazdo P-01)",
        score: "4.45",
        s1: "4.60", s2: "4.30", s3: "4.80", s4: "4.40", s5: "4.15",
        observations: [
            { icon: "check-circle", text: "Wzorcowy porządek na wiórach, czysta taca ociekowa", pen: "+ Wzorcowo (3S)" },
            { icon: "alert-circle", text: "Wyszczerbiona tarcza bez czerwonej zawieszki 'ZŁOM'", pen: "-0.20 pkt (1S)" }
        ],
        capa: "Uzupełnienie czerwonych zawieszek kwarantannowych dla narzędzi uszkodzonych."
    },
    ws_bender: {
        title: "Giętarka do Rur CNC (Strefa Matryc G-01)",
        score: "4.68",
        s1: "4.80", s2: "4.70", s3: "4.90", s4: "4.50", s5: "4.50",
        observations: [
            { icon: "check-circle", text: "Tablica cieni matryc kompletna w 100%", pen: "+ Wzorcowo (2S)" },
            { icon: "check-circle", text: "Brak wycieków hydrauliki, stanowisko po TPM", pen: "+ Wzorcowo (3S)" }
        ],
        capa: "Stanowisko stanowi wzorzec (Benchmark fabryczny) dla audytów klientów."
    },
    ws_final: {
        title: "Stanowisko Montażu Końcowego (M-01)",
        score: "4.25",
        s1: "4.30", s2: "4.10", s3: "4.40", s4: "4.25", s5: "4.20",
        observations: [
            { icon: "alert-circle", text: "Kartony z zamkami stoją na palecie zamiast na regale rolkowym", pen: "-0.30 pkt (2S)" },
            { icon: "check-circle", text: "Klucze dynamometryczne z aktualną kalibracją", pen: "+ Wzorcowo (4S)" }
        ],
        capa: "Instalacja grawitacyjnego regału rolkowego FIFO dla okuć kontenerowych."
    }
};

function loadStationAudit() {
    const keyEl = document.getElementById('audit-workstation-select');
    if (!keyEl) return;
    const key = keyEl.value;
    const data = stationAudits[key] || stationAudits['ws_weld'];
    const container = document.getElementById('station-audit-content');
    const humanNote = document.getElementById('audit-human-notes') ? document.getElementById('audit-human-notes').value : '';

    container.innerHTML = `
        <div class="lg:col-span-5 bg-graphite-900 p-6 rounded-2xl border border-graphite-750 space-y-5">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-xs uppercase text-slate-300 font-bold block">Ocena Końcowa 5S Stanowiska</span>
                    <h3 class="text-base font-bold text-white mt-1">${data.title}</h3>
                </div>
                <div class="text-right">
                    <span class="text-3xl font-extrabold font-mono-numbers ${parseFloat(data.score) < 3.8 ? 'text-amber-400' : 'text-emerald-400'}">${data.score}</span>
                    <span class="text-xs text-slate-300 block font-mono-numbers font-bold">/ 5.00 pkt</span>
                </div>
            </div>

            <div class="space-y-3 pt-3 border-t border-graphite-750">
                <div class="flex justify-between text-xs items-center">
                    <span class="text-slate-300 font-semibold">1S - Seiri (Sortowanie)</span>
                    <span class="font-mono-numbers font-bold text-white">${data.s1} / 5.00</span>
                </div>
                <div class="flex justify-between text-xs items-center">
                    <span class="text-slate-300 font-semibold">2S - Seiton (Systematyka)</span>
                    <span class="font-mono-numbers font-bold text-white">${data.s2} / 5.00</span>
                </div>
                <div class="flex justify-between text-xs items-center">
                    <span class="text-slate-300 font-semibold">3S - Seiso (Sprzątanie)</span>
                    <span class="font-mono-numbers font-bold text-white">${data.s3} / 5.00</span>
                </div>
                <div class="flex justify-between text-xs items-center">
                    <span class="text-slate-300 font-semibold">4S - Seiketsu (Standaryzacja)</span>
                    <span class="font-mono-numbers font-bold text-white">${data.s4} / 5.00</span>
                </div>
                <div class="flex justify-between text-xs items-center">
                    <span class="text-slate-300 font-semibold">5S - Shitsuke (Samodyscyplina)</span>
                    <span class="font-mono-numbers font-bold text-white">${data.s5} / 5.00</span>
                </div>
            </div>

            <div class="p-4 bg-graphite-850 rounded-xl border border-graphite-750 text-xs">
                <span class="text-gold-400 font-extrabold block mb-1">Rekomendowane Działanie CAPA (AI):</span>
                <p class="text-slate-200 leading-relaxed">${data.capa}</p>
            </div>
        </div>

        <div class="lg:col-span-7 bg-graphite-900 p-6 rounded-2xl border border-graphite-750 flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-bold text-white flex items-center gap-2">
                        <i data-lucide="eye" class="w-4 h-4 text-gold-400"></i> Analiza Klatki Obrazu (Gemini Vision 2.5)
                    </span>
                    <span class="text-xs font-mono-numbers text-slate-300 bg-graphite-850 px-2.5 py-1 rounded-md border border-graphite-700">Skan z kamery przemysłowej</span>
                </div>

                <div class="w-full h-48 bg-graphite-950 rounded-xl border-2 border-graphite-700 relative overflow-hidden flex items-center justify-center p-4">
                    <div class="absolute inset-0 bg-[radial-gradient(#384359_1px,transparent_1px)] [background-size:16px_16px] opacity-50"></div>
                    
                    <div class="border-2 border-amber-400 bg-amber-500/15 p-3 rounded-xl text-xs text-amber-200 max-w-sm z-10 shadow-xl text-center backdrop-blur-md">
                        <i data-lucide="scan-line" class="w-6 h-6 mx-auto mb-1 text-amber-400"></i>
                        <strong>Detekcja Niezgodności Vision:</strong><br>
                        ${data.observations[0].text}
                        <div class="text-[11px] text-slate-300 mt-1.5 italic font-medium">Uwzględniono: "${humanNote.slice(0, 42)}..."</div>
                    </div>
                </div>

                <div class="mt-4 space-y-2.5">
                    ${data.observations.map(o => `
                        <div class="p-3 rounded-xl bg-graphite-850 border border-graphite-750 text-xs flex justify-between items-center font-medium">
                            <span class="text-slate-200">${o.text}</span>
                            <span class="font-mono-numbers font-extrabold text-xs ${o.pen.includes('-') ? 'text-rose-400' : 'text-emerald-400'}">${o.pen}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="mt-5 pt-3.5 border-t border-graphite-750 flex justify-end">
                <button onclick="alert('Raport audytu 5S wyeksportowany do formatu PDF.')" class="px-5 py-2.5 bg-graphite-800 hover:bg-graphite-750 text-xs font-bold text-slate-100 border border-graphite-600 rounded-xl transition flex items-center gap-2">
                    <i data-lucide="download" class="w-4 h-4 text-gold-400"></i> Eksportuj Raport Audytu (PDF)
                </button>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function triggerVisionAudit() {
    const btn = document.getElementById('btn-run-vision');
    const container = document.getElementById('station-audit-content');
    if (!btn || !container) return;

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Skanowanie...`;
    if (window.lucide) lucide.createIcons();

    container.innerHTML = `
        <div class="col-span-12 bg-graphite-900 p-14 rounded-2xl border border-graphite-750 text-center space-y-4">
            <div class="w-14 h-14 rounded-full border-4 border-gold-400 border-t-transparent animate-spin mx-auto"></div>
            <div class="space-y-1.5">
                <h4 class="text-base font-bold text-white">Segmentacja Obrazu i Weryfikacja Wytycznych Audytora...</h4>
                <p class="text-xs text-slate-300 font-mono-numbers font-bold">Gemini Vision 2.5: Przeliczanie kar cząstkowych 1S-5S</p>
            </div>
        </div>
    `;

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="scan-line" class="w-4 h-4"></i> Wykonaj Audyt Obrazu AI`;
        loadStationAudit();
    }, 2000);
}

function updateWhatIf() {
    const s1 = document.getElementById('slider-1').value;
    const s2 = document.getElementById('slider-2').value;
    const s3 = document.getElementById('slider-3').value;

    document.getElementById('slider-1-val').innerText = `-${s1}%`;
    document.getElementById('slider-2-val').innerText = `${s2} min`;
    document.getElementById('slider-3-val').innerText = `${s3}%`;

    const extraPallets = Math.round((s1 * 0.3) + (15 - s2) * 1.2 + (s3 - 60) * 0.2);
    const extraSavings = Math.round(extraPallets * 275);

    document.getElementById('whatif-impact-text').innerHTML = `
        Zysk wydajności ciągu: <strong class="text-emerald-400 font-mono-numbers font-bold">+${extraPallets} palet / dobę</strong> | Oszczędność: <strong class="text-gold-400 font-mono-numbers font-bold">+${extraSavings} PLN / tydzień</strong>
    `;
}

function showToastNotification(payload) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = "toast-animate bg-graphite-850 border-2 border-gold-500 p-4 rounded-2xl shadow-2xl flex items-start gap-3 pointer-events-auto";
    toast.innerHTML = `
        <div class="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-400 flex-shrink-0 mt-0.5">
            <i data-lucide="bell-ring" class="w-5 h-5"></i>
        </div>
        <div class="flex-1">
            <div class="flex justify-between items-center">
                <span class="text-[11px] font-mono-numbers font-bold text-gold-400 uppercase">${payload.source} #${payload.eventId}</span>
                <span class="text-[10px] text-slate-400 font-mono-numbers">Transmisja: +2.0s</span>
            </div>
            <h4 class="text-xs font-bold text-white mt-0.5">${payload.faultDescription}</h4>
            <p class="text-[11px] text-slate-300 mt-1 italic">"${payload.operatorNote}"</p>
            <div class="mt-2 pt-2 border-t border-graphite-750 flex justify-between items-center text-[10px]">
                <span class="text-rose-400 font-bold font-mono-numbers">+${payload.costTotalPLN} PLN straty</span>
                <button onclick="toggleNotificationDrawer()" class="text-gold-400 hover:text-gold-300 font-bold">Kolejka (Drawer) &rarr;</button>
            </div>
        </div>
    `;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.style.transition = "all 0.5s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => toast.remove(), 500);
    }, 6000);
}

// Inicjalizacja skryptu po załadowaniu DOM
window.addEventListener('DOMContentLoaded', initDashboard);