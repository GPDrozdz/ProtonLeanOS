/**
 * Proton Lean OS - Terminal Operatorski MES (Shop-Floor Logic)
 * Kaskadowy przepływ meldunków ręcznych oraz integracja I/O sterowników PLC.
 */

// Baza operatorów hali produkcyjnej
const OPERATORS_LIST = [
    { id: 1, name: "Jan Kowalski" },
    { id: 2, name: "Mateusz Nowak" },
    { id: 3, name: "Tomasz Wiśniewski" },
    { id: 4, name: "Piotr Wójcik" },
    { id: 5, name: "John Miller" },
    { id: 6, name: "David Smith" },
    { id: 7, name: "Robert Taylor" },
    { id: 8, name: "James Wilson" },
    { id: 9, name: "Hans Schmidt" },
    { id: 10, name: "Klaus Weber" },
    { id: 11, name: "Stefan Meyer" },
    { id: 12, name: "Michael Wagner" }
];

// Park maszynowy gniazd roboczych
const STATIONS_LIST = [
    { id: 0, code: "G-01", name: "Laser BLM Płytowy" },
    { id: 1, code: "G-02", name: "Laser BLM Tube" },
    { id: 2, code: "G-03", name: "Wycinarka Plazmowa" },
    { id: 3, code: "G-04", name: "Giętarka CNC" },
    { id: 4, code: "G-05", name: "Piła Tarczowa" },
    { id: 5, code: "G-06", name: "Prasa Krawędziowa" },
    { id: 6, code: "G-07", name: "Robot Spawalniczy A" },
    { id: 7, code: "G-08", name: "Spawanie MIG Manual" },
    { id: 8, code: "G-09", name: "Przedgalwanika" },
    { id: 9, code: "G-10", name: "Montaż Końcowy" }
];

// Słownik 5 typowych usterek dla operatora
const FAULT_CATALOG = [
    { code: "BLM_JAM", name: "Zablokowany stół / spiętrzenie ażuru", dept: "Logistyka Wewnętrzna", defaultCostMin: 75 },
    { code: "TUBE_FEED", name: "Zacięcie automatycznego podajnika wiązki", dept: "UR - Mechanika", defaultCostMin: 75 },
    { code: "TOOL_WEAR", name: "Wyszczerbienie / zużycie narzędzia tnącego", dept: "UR - Oprzyrządowanie", defaultCostMin: 50 },
    { code: "SETUP_DELAY", name: "Przekroczenie czasu przezbrojenia matryc", dept: "Organizacja / Lean", defaultCostMin: 45 },
    { code: "QUAL_REJECT", name: "Odrzut partii: błąd wymiarowy / brak otworów", dept: "Jakość / Technologia", defaultCostMin: 55 }
];

// Kody błędów PLC dla trybu AUTO-MES
const PLC_ERRORS = {
    0: [
        { code: "PLC-BLM-01", desc: "E-STOP: Wykryto kolizję głowicy Precitec (Oś Z)" },
        { code: "PLC-BLM-02", desc: "Czujnik optyczny: Zablokowany stół urobku / spiętrzenie rusztu" },
        { code: "PLC-BLM-03", desc: "Niedostateczne ciśnienie azotu wspomagającego (< 18 bar)" },
        { code: "PLC-BLM-04", desc: "Alarm rezonatora Fiber: Temperatura złącza > 45°C" },
        { code: "PLC-BLM-05", desc: "Przeciążenie prądowe trawersy wygarniacza (Serwonapęd Y2)" },
        { code: "PLC-BLM-06", desc: "Detekcja zanieczyszczenia dolnego szkiełka głowicy optycznej" }
    ],
    1: [
        { code: "PLC-TUBE-01", desc: "Przekroczony dopuszczalny moment chwytaka obrotowego (Oś B)" },
        { code: "PLC-TUBE-02", desc: "Zacięcie podajnika automatycznego w kasecie separacji wiązki" },
        { code: "PLC-TUBE-03", desc: "Fotokomórka załadunku: Odchyłka prostoliniowości profilu" },
        { code: "PLC-TUBE-04", desc: "Błąd sekwencji otwarcia suportów prowadzących profil długi" },
        { code: "PLC-TUBE-05", desc: "Blokada mechaniczna zrzutnika uciętych detali na stół tylny" },
        { code: "PLC-TUBE-06", desc: "Zużycie dyszy tnącej powyżej limitu tolerancji wiązki" }
    ]
};

// Stan modułu Manual-MES
let currentMode = "manual";
let selectedOperator = OPERATORS_LIST[0];
let selectedMachine = STATIONS_LIST[0];
let selectedFault = null;
let durationType = "live";
let durationMinutes = 0;

// Zmienne stopera czasu rzeczywistego (Manual)
let liveTimerInterval = null;
let liveSeconds = 0;
let isLiveRunning = false;

// Stan modułu AUTO-MES (PLC)
let autoMachineId = 0;
let isPlcRunning = true;
let plcSeconds = 0;
let plcTimerInterval = null;
let activePlcError = null;

// 1. Inicjalizacja komponentu
function initTerminal() {
    renderOperators();
    renderMachines();
    renderFaults();
    updateManualActionButtons();
    startPlcTimer();
    if (window.lucide) lucide.createIcons();
}

// 2. Przełącznik trybu MANUAL-MES / AUTO-MES
function setTerminalMode(mode) {
    currentMode = mode;
    const manualView = document.getElementById("view-manual-mes");
    const autoView = document.getElementById("view-auto-mes");
    const btnManual = document.getElementById("mode-btn-manual");
    const btnAuto = document.getElementById("mode-btn-auto");

    if (mode === "manual") {
        manualView.classList.remove("hidden");
        autoView.classList.add("hidden");
        btnManual.className = "flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-extrabold bg-gold-500 text-graphite-950 shadow transition flex items-center justify-center gap-2";
        btnAuto.className = "flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-graphite-800 transition flex items-center justify-center gap-2";
    } else {
        manualView.classList.add("hidden");
        autoView.classList.remove("hidden");
        btnAuto.className = "flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-extrabold bg-cyan-500 text-graphite-950 shadow transition flex items-center justify-center gap-2";
        btnManual.className = "flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-graphite-800 transition flex items-center justify-center gap-2";
    }
}

// 3. Renderowanie i wybór Operatora (Krok 1)
function renderOperators() {
    const container = document.getElementById("operators-grid");
    if (!container) return;
    container.innerHTML = "";

    OPERATORS_LIST.forEach(op => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = selectedOperator && selectedOperator.id === op.id;
        btn.className = `p-3 rounded-xl border-2 text-left transition font-semibold text-xs flex items-center gap-2 ${
            isActive 
                ? "border-gold-500 bg-gold-500/20 text-white shadow-md" 
                : "border-graphite-750 bg-graphite-900 text-slate-300 hover:border-graphite-600 hover:text-white"
        }`;
        btn.onclick = () => selectOperator(op);
        btn.innerHTML = `
            <div class="w-6 h-6 rounded-md ${isActive ? 'bg-gold-500 text-graphite-950' : 'bg-graphite-800 text-slate-400'} flex items-center justify-center text-[10px] font-bold font-mono-numbers">
                ${op.name.split(' ').map(n => n[0]).join('')}
            </div>
            <span class="truncate">${op.name}</span>
        `;
        container.appendChild(btn);
    });

    const badge = document.getElementById("active-operator-badge");
    if (badge && selectedOperator) {
        badge.innerText = `Aktywny: ${selectedOperator.name}`;
    }
}

function selectOperator(op) {
    selectedOperator = op;
    renderOperators();
}

// 4. Renderowanie i wybór Maszyny (Krok 2)
function renderMachines() {
    const container = document.getElementById("machines-grid");
    if (!container) return;
    container.innerHTML = "";

    STATIONS_LIST.forEach(m => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = selectedMachine && selectedMachine.id === m.id;
        btn.className = `p-3.5 rounded-xl border-2 text-left transition ${
            isActive 
                ? "border-gold-500 bg-gold-500/15 shadow-md" 
                : "border-graphite-750 bg-graphite-900 hover:border-graphite-600"
        }`;
        btn.onclick = () => selectMachine(m);
        btn.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-xs font-mono-numbers font-extrabold ${isActive ? 'text-gold-400' : 'text-slate-400'}">${m.code}</span>
                <span class="w-2 h-2 rounded-full ${isActive ? 'bg-gold-400' : 'bg-slate-600'}"></span>
            </div>
            <h4 class="text-xs font-bold text-white mt-1 truncate">${m.name}</h4>
        `;
        container.appendChild(btn);
    });

    const badge = document.getElementById("active-machine-badge");
    if (badge && selectedMachine) {
        badge.innerText = `Wybrano: ${selectedMachine.code} (${selectedMachine.name})`;
    }
}

function selectMachine(m) {
    selectedMachine = m;
    renderMachines();
}

// 5. Renderowanie i wybór Usterki (Krok 3)
function renderFaults() {
    const container = document.getElementById("faults-grid");
    if (!container) return;
    container.innerHTML = "";

    FAULT_CATALOG.forEach(f => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = selectedFault && selectedFault.code === f.code;
        btn.className = `p-3.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
            isActive 
                ? "border-gold-500 bg-gold-500/20 shadow-md" 
                : "border-graphite-750 bg-graphite-900 hover:border-graphite-600"
        }`;
        btn.onclick = () => selectFault(f);
        btn.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="text-[11px] font-mono-numbers font-bold px-2 py-0.5 rounded ${isActive ? 'bg-gold-500 text-graphite-950 font-extrabold' : 'bg-graphite-800 text-slate-300'}">${f.code}</span>
                <span class="text-[10px] text-slate-400">${f.dept}</span>
            </div>
            <p class="text-xs font-bold text-white mt-2">${f.name}</p>
        `;
        container.appendChild(btn);
    });
}

function selectFault(f) {
    selectedFault = f;
    renderFaults();
}

// 6. Obsługa Czasu i Stopera (Krok 4)
function setTimeMode(mode) {
    durationType = mode;
    clearPresetSelection();
    document.getElementById("time-btn-live").className = "p-3.5 rounded-xl border-2 border-gold-500 bg-gold-500/15 text-white font-extrabold text-xs transition flex flex-col items-center justify-center gap-1 shadow-md";
    document.getElementById("custom-duration-input").value = "";
    updateManualActionButtons();
}

function setTimePreset(minutes) {
    stopLiveTimerInternal();
    durationType = "preset";
    durationMinutes = minutes;
    clearPresetSelection();

    const targetBtn = document.getElementById(`time-btn-${minutes}`);
    if (targetBtn) {
        targetBtn.className = "time-preset-btn p-3.5 rounded-xl border-2 border-gold-500 bg-gold-500/20 text-gold-300 font-extrabold text-xs shadow-md transition flex items-center justify-center";
    }

    document.getElementById("time-btn-live").className = "p-3.5 rounded-xl border-2 border-graphite-750 bg-graphite-900 text-slate-400 font-bold text-xs transition flex flex-col items-center justify-center gap-1";
    document.getElementById("custom-duration-input").value = "";
    updateManualActionButtons();
}

function setCustomTime() {
    stopLiveTimerInternal();
    const val = parseInt(document.getElementById("custom-duration-input").value, 10);
    if (!isNaN(val) && val > 0) {
        durationType = "custom";
        durationMinutes = val;
        clearPresetSelection();
        document.getElementById("time-btn-live").className = "p-3.5 rounded-xl border-2 border-graphite-750 bg-graphite-900 text-slate-400 font-bold text-xs transition flex flex-col items-center justify-center gap-1";
    }
    updateManualActionButtons();
}

function clearPresetSelection() {
    document.querySelectorAll(".time-preset-btn").forEach(btn => {
        btn.className = "time-preset-btn p-3.5 rounded-xl border-2 border-graphite-750 bg-graphite-900 text-slate-200 font-bold text-xs hover:border-gold-400 transition flex items-center justify-center";
    });
}

function toggleLiveTimer() {
    if (durationType !== "live") {
        setTimeMode("live");
    }

    if (!isLiveRunning) {
        isLiveRunning = true;
        liveSeconds = 0;
        liveTimerInterval = setInterval(() => {
            liveSeconds++;
            const mins = Math.floor(liveSeconds / 60);
            const secs = liveSeconds % 60;
            const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            document.getElementById("live-timer-display").innerText = str;
        }, 1000);

        const btnToggle = document.getElementById("btn-live-toggle");
        btnToggle.className = "px-8 py-4 bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-sm rounded-xl transition shadow-xl flex items-center justify-center gap-2 animate-pulse";
        btnToggle.innerHTML = `<i data-lucide="square" class="w-5 h-5"></i> STOP AWARII`;
        if (window.lucide) lucide.createIcons();

        document.getElementById("btn-manual-dispatch").disabled = true;
        document.getElementById("btn-manual-dispatch").classList.add("opacity-40", "cursor-not-allowed");
    } else {
        stopLiveTimerInternal();
        durationMinutes = Math.max(1, Math.ceil(liveSeconds / 60));
        updateManualActionButtons();
    }
}

function stopLiveTimerInternal() {
    if (liveTimerInterval) {
        clearInterval(liveTimerInterval);
        liveTimerInterval = null;
    }
    isLiveRunning = false;
}

function updateManualActionButtons() {
    const btnToggle = document.getElementById("btn-live-toggle");
    const btnDispatch = document.getElementById("btn-manual-dispatch");

    if (durationType === "live") {
        btnToggle.classList.remove("hidden");
        if (!isLiveRunning) {
            btnToggle.className = "px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-graphite-950 font-extrabold text-sm rounded-xl transition shadow-xl flex items-center justify-center gap-2";
            btnToggle.innerHTML = `<i data-lucide="play" class="w-5 h-5"></i> START AWARII`;
            btnDispatch.disabled = false;
            btnDispatch.classList.remove("opacity-40", "cursor-not-allowed");
        }
    } else {
        btnToggle.classList.add("hidden");
        btnDispatch.disabled = false;
        btnDispatch.classList.remove("opacity-40", "cursor-not-allowed");
    }
    if (window.lucide) lucide.createIcons();
}

// 7. Wysłanie zgłoszenia ręcznego do szyny MES (Krok 5)
function dispatchManualTelemetry() {
    if (!selectedFault) {
        alert("Wymóg Poka-Yoke: Zaznacz kod usterki przed nadaniem meldunku.");
        return;
    }

    const calculatedMinutes = durationType === "live" 
        ? Math.max(1, Math.ceil(liveSeconds / 60)) 
        : durationMinutes;

    if (calculatedMinutes <= 0) {
        alert("Wymóg Poka-Yoke: Wprowadź poprawny czas trwania awarii.");
        return;
    }

    const noteInput = document.getElementById("manual-operator-note");
    const noteText = noteInput.value.trim() || `Zgłoszenie z terminala: ${selectedFault.name}`;
    const calculatedCost = calculatedMinutes * selectedFault.defaultCostMin;

    const payload = {
        machineId: selectedMachine.id,
        machineName: selectedMachine.name,
        stationCode: selectedMachine.code,
        faultCode: selectedFault.code,
        faultDescription: selectedFault.name,
        durationMin: calculatedMinutes,
        operatorName: selectedOperator.name,
        operatorNote: noteText,
        responsibleDept: selectedFault.dept,
        costTotalPLN: calculatedCost,
        source: "MANUAL-MES"
    };

    if (typeof publishTelemetryEvent === "function") {
        publishTelemetryEvent(payload);
    }

    // Reset formularza z zachowaniem tożsamości operatora i przypisanej maszyny
    selectedFault = null;
    renderFaults();

    stopLiveTimerInternal();
    liveSeconds = 0;
    document.getElementById("live-timer-display").innerText = "00:00";
    noteInput.value = "";
    setTimeMode("live");

    const statusInd = document.getElementById("manual-status-indicator");
    statusInd.innerHTML = `<span class="text-gold-400 font-bold">Meldunek nadany do magistrali MES (+2.0s bufor). Stanowisko gotowe.</span>`;
    setTimeout(() => {
        statusInd.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Gotowość do rejestracji meldunku`;
    }, 4000);
}

// 8. Logika AUTO-MES (Interfejs I/O Sterowników PLC)
function selectAutoMachine(id) {
    autoMachineId = id;
    document.querySelectorAll(".auto-mach-btn").forEach((btn, idx) => {
        if (idx === id) {
            btn.className = "auto-mach-btn p-5 rounded-2xl border-2 border-cyan-500 bg-cyan-500/10 text-left transition shadow-lg";
        } else {
            btn.className = "auto-mach-btn p-5 rounded-2xl border-2 border-graphite-750 bg-graphite-900 text-left transition hover:border-cyan-400";
        }
    });

    if (isPlcRunning) {
        resetPlcNormalState();
    }
}

function startPlcTimer() {
    if (plcTimerInterval) clearInterval(plcTimerInterval);
    plcSeconds = 0;
    plcTimerInterval = setInterval(() => {
        plcSeconds++;
        const mins = Math.floor(plcSeconds / 60);
        const secs = plcSeconds % 60;
        const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        const el = document.getElementById("plc-state-timer");
        if (el) el.innerText = str;
    }, 1000);
}

function triggerPlcStop() {
    if (isPlcRunning) {
        isPlcRunning = false;
        startPlcTimer();

        // Losowanie 1 z 6 błędów dedykowanych dla wybranej maszyny
        const errors = PLC_ERRORS[autoMachineId] || PLC_ERRORS[0];
        activePlcError = errors[Math.floor(Math.random() * errors.length)];

        // Aktualizacja interfejsu w stan awaryjny
        const card = document.getElementById("plc-status-card");
        card.className = "bg-graphite-900 border-2 border-rose-500 p-6 rounded-2xl space-y-4 shadow-xl";

        const icon = document.getElementById("plc-status-icon");
        icon.className = "w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-400 animate-pulse";
        icon.innerHTML = `<i data-lucide="alert-octagon" class="w-6 h-6"></i>`;

        const cycleText = document.getElementById("plc-cycle-text");
        cycleText.className = "text-xs font-mono-numbers font-bold text-rose-400 uppercase tracking-wider block";
        cycleText.innerText = "STAN STEROWNIKA: ZATRZYMANIE AWARYJNE (ALARM = TRUE)";

        document.getElementById("plc-active-title").innerText = activePlcError.desc;

        const errBox = document.getElementById("plc-error-details");
        errBox.classList.remove("hidden");
        document.getElementById("plc-error-code").innerText = `REJESTR PLC: ${activePlcError.code}`;
        document.getElementById("plc-error-desc").innerText = activePlcError.desc;

        const btnToggle = document.getElementById("btn-plc-toggle");
        btnToggle.className = "px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-graphite-950 font-extrabold text-xs rounded-xl transition shadow-lg flex items-center justify-center gap-2";
        btnToggle.innerHTML = `<i data-lucide="rotate-ccw" class="w-4 h-4"></i> KASUJ BŁĄD PLC (RESET CYKLU)`;

        document.getElementById("btn-plc-dispatch").classList.remove("hidden");
    } else {
        resetPlcNormalState();
    }
    if (window.lucide) lucide.createIcons();
}

function resetPlcNormalState() {
    isPlcRunning = true;
    activePlcError = null;
    startPlcTimer();

    const card = document.getElementById("plc-status-card");
    card.className = "bg-graphite-900 border-2 border-emerald-500/50 p-6 rounded-2xl space-y-4";

    const icon = document.getElementById("plc-status-icon");
    icon.className = "w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400";
    icon.innerHTML = `<i data-lucide="check-circle-2" class="w-6 h-6"></i>`;

    const cycleText = document.getElementById("plc-cycle-text");
    cycleText.className = "text-xs font-mono-numbers font-bold text-emerald-400 uppercase tracking-wider block";
    cycleText.innerText = "STAN STEROWNIKA: PRACA AUTOMATYCZNA (CYCLE_RUN = TRUE)";

    document.getElementById("plc-active-title").innerText = "Brak aktywnych kodów błędu w rejestrze PLC";
    document.getElementById("plc-error-details").classList.add("hidden");

    const btnToggle = document.getElementById("btn-plc-toggle");
    btnToggle.className = "px-6 py-3.5 bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-xs rounded-xl transition shadow-lg flex items-center justify-center gap-2";
    btnToggle.innerHTML = `<i data-lucide="octagon-alert" class="w-4 h-4"></i> ZATRZYMAJ MASZYNĘ (SYGNAŁ PLC)`;

    document.getElementById("btn-plc-dispatch").classList.add("hidden");
    if (window.lucide) lucide.createIcons();
}

function dispatchPlcTelemetry() {
    if (!activePlcError) return;

    const calcMins = Math.max(1, Math.ceil(plcSeconds / 60));
    const targetMach = STATIONS_LIST[autoMachineId];

    const payload = {
        machineId: targetMach.id,
        machineName: targetMach.name,
        stationCode: targetMach.code,
        faultCode: activePlcError.code,
        faultDescription: activePlcError.desc,
        durationMin: calcMins,
        operatorName: "INTERFEJS PLC I/O",
        operatorNote: `Automatyczny zrzut rejestru sterownika: ${activePlcError.code}`,
        responsibleDept: "UR - Automatyka PLC",
        costTotalPLN: calcMins * 75,
        source: "AUTO-MES"
    };

    if (typeof publishTelemetryEvent === "function") {
        publishTelemetryEvent(payload);
    }

    alert(`Alarm ${activePlcError.code} został przetransmitowany do szyny zdarzeń MES.`);
    resetPlcNormalState();
}

// Inicjalizacja skryptu
window.addEventListener("DOMContentLoaded", initTerminal);