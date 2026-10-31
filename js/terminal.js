/**
 * Proton Lean OS - Terminal Operatorski MES (Shop-Floor Logic v2.5)
 * Poka-Yoke czasu, dedykowane słowniki awarii per gniazdo robocze oraz niezależny Uptime PLC.
 */

// Baza operatorów hali
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

// Park maszynowy (10 gniazd)
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

// Dedykowany słownik usterek dopasowany technologicznie do każdego gniazda
const STATION_FAULTS = {
    0: [ // G-01: Laser BLM Płytowy
        { code: "BLM_JAM", name: "Zablokowany stół urobku / ażur", dept: "Logistyka Wewnętrzna", costMin: 75 },
        { code: "LENS_DIRT", name: "Zanieczyszczenie szkła ochronnego głowicy", dept: "UR - Optyka CNC", costMin: 75 },
        { code: "GAS_DROP", name: "Spadek ciśnienia azotu tnącego (< 18 bar)", dept: "Media Gazowe", costMin: 75 },
        { code: "SHEET_COLL", name: "Wykryto kolizję głowicy z wypaczonym arkuszem", dept: "UR - Mechanika", costMin: 75 }
    ],
    1: [ // G-02: Laser BLM Tube
        { code: "TUBE_FEED", name: "Zacięcie podajnika automatycznego wiązki", dept: "UR - Mechanika", costMin: 75 },
        { code: "CHUCK_OVER", name: "Przeciążenie momentu chwytaka obrotowego", dept: "UR - Mechatronika", costMin: 75 },
        { code: "OPTIC_ALIGN", name: "Błąd centrowania wiązki na profilu", dept: "UR - Optyka CNC", costMin: 75 },
        { code: "UNLOAD_JAM", name: "Zablokowany wyrzutnik uciętych rur", dept: "Logistyka Wewnętrzna", costMin: 75 }
    ],
    2: [ // G-03: Wycinarka Plazmowa
        { code: "PLASMA_ARC", name: "Zgaśnięcie łuku głównego plazmy", dept: "UR - Spawalnictwo", costMin: 60 },
        { code: "THC_ERR", name: "Błąd regulatora wysokości palnika (THC)", dept: "UR - Elektronika", costMin: 60 },
        { code: "SLAG_BUILD", name: "Nadmierne zaszlakowanie rusztu wodnego", dept: "Czyszczenie / TPM", costMin: 45 },
        { code: "NOZZLE_BURN", name: "Przepalenie dyszy wirowej palnika", dept: "UR - Oprzyrządowanie", costMin: 50 }
    ],
    3: [ // G-04: Giętarka CNC
        { code: "BEND_TOOL", name: "Wyszczerbienie matrycy gnącej promienia", dept: "UR - Oprzyrządowanie", costMin: 55 },
        { code: "HYDR_TEMP", name: "Przegrzanie oleju hydraulicznego agregatu", dept: "UR - Hydraulika", costMin: 55 },
        { code: "BACK_GAUGE", name: "Błąd pozycjonera zderzaków tylnych osi X", dept: "UR - Mechatronika", costMin: 55 },
        { code: "ANGLE_DEV", name: "Odchyłka kąta gięcia profilu powyżej &plusmn;1.5&deg;", dept: "Jakość / SOP", costMin: 45 }
    ],
    4: [ // G-05: Piła Tarczowa
        { code: "BLADE_TEETH", name: "Wyłamanie zębów węglikowych tarczy", dept: "UR - Narzędziownia", costMin: 50 },
        { code: "COOLANT_LOW", name: "Brak przepływu chłodziwa / emulsji", dept: "TPM / Media", costMin: 40 },
        { code: "CLAMP_SLIP", name: "Uślizg profilu w zacisku imadła pneumatycznego", dept: "UR - Pneumatyka", costMin: 45 },
        { code: "CHIP_JAM", name: "Zablokowany ślimakowy wygarniacz wiórów", dept: "UR - Mechanika", costMin: 45 }
    ],
    5: [ // G-06: Prasa Krawędziowa
        { code: "CROWNING_ERR", name: "Awaria automatycznej kompensacji strzałki", dept: "UR - Mechatronika", costMin: 60 },
        { code: "PRESSURE_VALVE", name: "Zawieszenie zaworu proporcjonalnego tonarzu", dept: "UR - Hydraulika", costMin: 60 },
        { code: "SAFETY_CURTAIN", name: "Zabrudzenie kurtyny optoelektronicznej DSP", dept: "BHP / Automatyka", costMin: 50 },
        { code: "PUNCH_WEAR", name: "Zużycie krawędzi stempla segmentowego", dept: "UR - Oprzyrządowanie", costMin: 50 }
    ],
    6: [ // G-07: Robot Spawalniczy A
        { code: "ROBOT_COLL", name: "Zadziałanie złącza antykolizyjnego palnika", dept: "UR - Robotyka", costMin: 70 },
        { code: "WIRE_FEED", name: "Zablokowanie drutu w pancerzu podajnika", dept: "Spawalnictwo / UR", costMin: 65 },
        { code: "GAS_NOZZLE", name: "Zalepienie dyszy gazowej odpryskami (Brak czyszczenia)", dept: "Stacja TPM Robota", costMin: 50 },
        { code: "POSITIONER_SYN", name: "Błąd synchronizacji osi obrotnika dwustanowiskowego", dept: "UR - Mechatronika", costMin: 70 }
    ],
    7: [ // G-08: Spawanie MIG Manual
        { code: "TORCH_FAIL", name: "Przepalenie wkładu prądowego / rękojeści uchwytu", dept: "Gospodarka Narzędziowa", costMin: 45 },
        { code: "GAS_LEAK", name: "Rozszczelnienie reduktora mieszanki Ar/CO2", dept: "Media Gazowe", costMin: 40 },
        { code: "EARTH_CLAMP", name: "Upalenie zacisku masy stanowiskowej", dept: "UR - Elektryka", costMin: 35 },
        { code: "POROSITY_REJ", name: "Porowatość spoiny: wilgoć lub przeciąg na hali", dept: "Jakość / Spawalnictwo", costMin: 50 }
    ],
    8: [ // G-09: Przedgalwanika
        { code: "HOLE_MISSING", name: "Wykryto brak otworów technologicznych odpowietrzeń", dept: "Kontrola Jakości FTY", costMin: 55 },
        { code: "SLAG_UNGROUND", name: "Pozostawiony żużel i ostre krawędzie spoin", dept: "Obróbka Ślusarska", costMin: 45 },
        { code: "TRAVERSE_CRANE", name: "Awaria wciągnika trawersy załadunkowej", dept: "UR - Dźwignice", costMin: 60 },
        { code: "HOOK_BENT", name: "Zdeformowane zawiesia technologiczne do cynku", dept: "UR - Oprzyrządowanie", costMin: 40 }
    ],
    9: [ // G-10: Montaż Końcowy
        { code: "FITTING_MISS", name: "Brak kompletu okuć rygli kontenerowych", dept: "Logistyka Komponentów", costMin: 55 },
        { code: "TORQUE_DEV", name: "Błąd kalibracji klucza dynamometrycznego", dept: "Gospodarka Narzędziowa", costMin: 50 },
        { code: "RIVET_GUN", name: "Awaria nitownicy pneumatyczno-hydraulicznej", dept: "UR - Pneumatyka", costMin: 45 },
        { code: "SEAL_DEFECT", name: "Wada fabryczna gumowych uszczelek obwodowych", dept: "Dostawcy / Jakość", costMin: 50 }
    ]
};

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
let isLiveFinishedAndReady = false; // Flaga Poka-Yoke: stoper zatrzymany, czas > 0, czeka na wysyłkę

// Stan modułu AUTO-MES (PLC)
let autoMachineId = 0;
let isPlcAlarm = false;
let globalPlcUptimeSeconds = 14280; // Start z realistyczną historią ciągłej pracy (3h 58m)
let globalPlcUptimeInterval = null;
let plcAlarmSeconds = 0;
let plcAlarmInterval = null;
let activePlcError = null;

// 1. Inicjalizacja komponentu
function initTerminal() {
    renderOperators();
    renderMachines();
    renderFaultsForMachine(selectedMachine.id);
    updatePokaYokeActionButtons();
    startGlobalPlcUptimeCounter();
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
        btnManual.className = "flex-1 sm:flex-initial px-6 py-3 rounded-lg text-xs sm:text-sm font-extrabold bg-gold-500 text-graphite-950 shadow-md transition flex items-center justify-center gap-2";
        btnAuto.className = "flex-1 sm:flex-initial px-6 py-3 rounded-lg text-xs sm:text-sm font-extrabold text-slate-300 hover:text-white hover:bg-graphite-850 transition flex items-center justify-center gap-2";
    } else {
        manualView.classList.add("hidden");
        autoView.classList.remove("hidden");
        btnAuto.className = "flex-1 sm:flex-initial px-6 py-3 rounded-lg text-xs sm:text-sm font-extrabold bg-cyan-500 text-graphite-950 shadow-md transition flex items-center justify-center gap-2";
        btnManual.className = "flex-1 sm:flex-initial px-6 py-3 rounded-lg text-xs sm:text-sm font-extrabold text-slate-300 hover:text-white hover:bg-graphite-850 transition flex items-center justify-center gap-2";
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
        btn.className = `p-3.5 sm:p-4 rounded-xl border-2 text-left transition font-bold text-xs sm:text-sm flex items-center gap-3 ${
            isActive 
                ? "border-gold-500 bg-gold-500/25 text-white shadow-xl shadow-gold-500/10" 
                : "border-graphite-750 bg-graphite-950 text-slate-300 hover:border-graphite-600 hover:text-white"
        }`;
        btn.onclick = () => selectOperator(op);
        btn.innerHTML = `
            <div class="w-8 h-8 rounded-lg ${isActive ? 'bg-gold-500 text-graphite-950 font-extrabold' : 'bg-graphite-850 text-slate-400 font-bold'} flex items-center justify-center text-xs font-mono-numbers">
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

// 4. Renderowanie i wybór Maszyny (Krok 2 - z filtrowaniem usterek)
function renderMachines() {
    const container = document.getElementById("machines-grid");
    if (!container) return;
    container.innerHTML = "";

    STATIONS_LIST.forEach(m => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = selectedMachine && selectedMachine.id === m.id;
        btn.className = `p-4 sm:p-4.5 rounded-xl border-2 text-left transition ${
            isActive 
                ? "border-gold-500 bg-gold-500/20 shadow-xl shadow-gold-500/10" 
                : "border-graphite-750 bg-graphite-950 hover:border-graphite-600"
        }`;
        btn.onclick = () => selectMachine(m);
        btn.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-xs sm:text-sm font-mono-numbers font-extrabold ${isActive ? 'text-gold-400' : 'text-slate-400'}">${m.code}</span>
                <span class="w-2.5 h-2.5 rounded-full ${isActive ? 'bg-gold-400 shadow-sm shadow-gold-400' : 'bg-slate-700'}"></span>
            </div>
            <h4 class="text-xs sm:text-sm font-extrabold text-white mt-1.5 truncate">${m.name}</h4>
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
    // Dynamiczne przefiltrowanie słownika usterek pod wybraną maszynę
    renderFaultsForMachine(m.id);
    selectedFault = null;
    checkDispatchReadiness();
}

// 5. Renderowanie Usterek per Maszyna + Kafelek INNE/NOWE (Krok 3)
function renderFaultsForMachine(machineId) {
    const container = document.getElementById("faults-grid");
    if (!container) return;
    container.innerHTML = "";

    const faults = STATION_FAULTS[machineId] || STATION_FAULTS[0];

    // 4 Usterki technologiczne
    faults.forEach(f => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = selectedFault && selectedFault.code === f.code;
        btn.className = `p-4 sm:p-4.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
            isActive 
                ? "border-gold-400 bg-gold-500/25 fault-active-glow" 
                : "border-graphite-750 bg-graphite-950 hover:border-gold-500/60 fault-glow"
        }`;
        btn.onclick = () => selectFault(f);
        btn.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <span class="text-xs font-mono-numbers font-extrabold px-2.5 py-1 rounded-md ${isActive ? 'bg-gold-500 text-graphite-950' : 'bg-gold-500/15 text-gold-400 border border-gold-400/40'} tracking-wider">
                    ${f.code}
                </span>
                <span class="text-[11px] text-slate-400 font-semibold truncate">${f.dept}</span>
            </div>
            <p class="text-xs sm:text-sm font-extrabold text-white mt-2.5 leading-snug">${f.name}</p>
        `;
        container.appendChild(btn);
    });

    // 5. Stały Kafelek: INNE / NOWA USTERKA
    const otherFault = {
        code: "FAULT_OTHER",
        name: "Inna / Nieskatalogowana usterka (Wpisz objaw poniżej)",
        dept: "Nowy incydent hali",
        costMin: 50,
        isCustom: true
    };
    const otherBtn = document.createElement("button");
    otherBtn.type = "button";
    const isOtherActive = selectedFault && selectedFault.code === "FAULT_OTHER";
    otherBtn.className = `p-4 sm:p-4.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
        isOtherActive 
            ? "border-amber-400 bg-amber-500/25 fault-active-glow" 
            : "border-amber-500/50 bg-graphite-950 hover:border-amber-400"
    }`;
    otherBtn.onclick = () => selectFault(otherFault);
    otherBtn.innerHTML = `
        <div class="flex justify-between items-start gap-2">
            <span class="text-xs font-mono-numbers font-extrabold px-2.5 py-1 rounded-md ${isOtherActive ? 'bg-amber-400 text-graphite-950' : 'bg-amber-500/20 text-amber-300 border border-amber-400/50'} tracking-wider">
                INNE / NOWE
            </span>
            <span class="text-[11px] text-amber-400 font-bold">Wymaga opisu</span>
        </div>
        <p class="text-xs sm:text-sm font-extrabold text-amber-200 mt-2.5 leading-snug">Zgłoś nieskatalogowaną przyczynę &rarr;</p>
    `;
    container.appendChild(otherBtn);
}

function selectFault(f) {
    selectedFault = f;
    renderFaultsForMachine(selectedMachine.id);

    const noteInput = document.getElementById("manual-operator-note");
    const noteLabel = document.getElementById("note-label");

    if (f.isCustom) {
        noteInput.classList.remove("border-graphite-750");
        noteInput.classList.add("border-amber-400", "bg-amber-500/10");
        noteLabel.innerHTML = `<span class="text-amber-400 font-extrabold">⚠️ WYMAGANE POKA-YOKE: Wpisz konkretny objaw nowej usterki:</span>`;
        noteInput.focus();
    } else {
        noteInput.classList.remove("border-amber-400", "bg-amber-500/10");
        noteInput.classList.add("border-graphite-750");
        noteLabel.innerHTML = `Krótki objaw / uwagi z hali (opcjonalne):`;
    }

    checkDispatchReadiness();
}

// 6. Poka-Yoke Czasu: Stoper Na Żywo & Kafelki (Krok 4)
function setTimeMode(mode) {
    durationType = mode;
    isLiveFinishedAndReady = false;
    clearPresetSelection();
    document.getElementById("time-btn-live").className = "p-4 rounded-xl border-2 border-gold-500 bg-gold-500/20 text-white font-extrabold text-xs sm:text-sm transition flex flex-col items-center justify-center gap-1.5 shadow-lg";
    document.getElementById("custom-duration-input").value = "";
    updatePokaYokeActionButtons();
}

function setTimePreset(minutes) {
    stopLiveTimerInternal();
    durationType = "preset";
    durationMinutes = minutes;
    isLiveFinishedAndReady = false;
    clearPresetSelection();

    const targetBtn = document.getElementById(`time-btn-${minutes}`);
    if (targetBtn) {
        targetBtn.className = "time-preset-btn p-4 rounded-xl border-2 border-gold-500 bg-gold-500/25 text-gold-300 font-extrabold text-xs sm:text-sm shadow-xl transition flex items-center justify-center";
    }

    document.getElementById("time-btn-live").className = "p-4 rounded-xl border-2 border-graphite-750 bg-graphite-950 text-slate-400 font-bold text-xs sm:text-sm transition flex flex-col items-center justify-center gap-1.5";
    document.getElementById("custom-duration-input").value = "";
    updatePokaYokeActionButtons();
}

function setCustomTime() {
    stopLiveTimerInternal();
    const val = parseInt(document.getElementById("custom-duration-input").value, 10);
    if (!isNaN(val) && val > 0) {
        durationType = "custom";
        durationMinutes = val;
        isLiveFinishedAndReady = false;
        clearPresetSelection();
        document.getElementById("time-btn-live").className = "p-4 rounded-xl border-2 border-graphite-750 bg-graphite-950 text-slate-400 font-bold text-xs sm:text-sm transition flex flex-col items-center justify-center gap-1.5";
    } else {
        durationMinutes = 0;
    }
    updatePokaYokeActionButtons();
}

function clearPresetSelection() {
    document.querySelectorAll(".time-preset-btn").forEach(btn => {
        btn.className = "time-preset-btn p-4 rounded-xl border-2 border-graphite-750 bg-graphite-950 text-slate-200 font-extrabold text-xs sm:text-sm hover:border-gold-400 transition flex items-center justify-center";
    });
}

// Stoper Na Żywo z blokadą zerowego czasu i ponownego startu
function toggleLiveTimer() {
    if (durationType !== "live") {
        setTimeMode("live");
    }

    if (!isLiveRunning) {
        // Start pomiaru
        isLiveRunning = true;
        isLiveFinishedAndReady = false;
        liveSeconds = 0;
        liveTimerInterval = setInterval(() => {
            liveSeconds++;
            const mins = Math.floor(liveSeconds / 60);
            const secs = liveSeconds % 60;
            const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            document.getElementById("live-timer-display").innerText = str;
        }, 1000);

        const btnToggle = document.getElementById("btn-live-toggle");
        btnToggle.className = "px-10 py-5 bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-sm sm:text-base rounded-xl transition shadow-xl flex items-center justify-center gap-2.5 animate-pulse";
        btnToggle.innerHTML = `<i data-lucide="square" class="w-6 h-6"></i> STOP AWARII`;
        
        // Poka-Yoke: Przycisk przesyłania jest w trakcie biegu bezwzględnie ukryty
        document.getElementById("btn-manual-dispatch").classList.add("hidden");
    } else {
        // Zatrzymanie pomiaru
        if (liveSeconds === 0) {
            alert("Wymóg Poka-Yoke: Czas awarii wynosi 00:00. Zarejestruj rzeczywisty czas trwania.");
            return;
        }

        stopLiveTimerInternal();
        durationMinutes = Math.max(1, Math.ceil(liveSeconds / 60));
        isLiveFinishedAndReady = true;

        // Poka-Yoke: Przycisk START zostaje wygaszony, pojawia się złoty PRZEŚLIJ
        updatePokaYokeActionButtons();
    }
    if (window.lucide) lucide.createIcons();
}

function stopLiveTimerInternal() {
    if (liveTimerInterval) {
        clearInterval(liveTimerInterval);
        liveTimerInterval = null;
    }
    isLiveRunning = false;
}

// Logika widoczności przycisków akcji (Start/Stop vs Prześlij)
function updatePokaYokeActionButtons() {
    const btnToggle = document.getElementById("btn-live-toggle");
    const btnDispatch = document.getElementById("btn-manual-dispatch");

    if (durationType === "live") {
        if (isLiveRunning) {
            btnToggle.classList.remove("hidden");
            btnDispatch.classList.add("hidden");
        } else if (isLiveFinishedAndReady) {
            // Zakończono pomiar - ukryj START, pokaż PRZEŚLIJ
            btnToggle.classList.add("hidden");
            btnDispatch.classList.remove("hidden");
            btnDispatch.innerHTML = `<i data-lucide="send" class="w-6 h-6"></i> PRZEŚLIJ MELDUNEK (${durationMinutes} MIN)`;
        } else {
            // Stan początkowy - pokaż START, ukryj PRZEŚLIJ
            btnToggle.classList.remove("hidden");
            btnToggle.className = "px-10 py-5 bg-emerald-500 hover:bg-emerald-400 text-graphite-950 font-extrabold text-sm sm:text-base rounded-xl transition shadow-xl flex items-center justify-center gap-2.5";
            btnToggle.innerHTML = `<i data-lucide="play" class="w-6 h-6"></i> START AWARII`;
            btnDispatch.classList.add("hidden");
        }
    } else {
        // Tryb kafelkowy (10, 20, 30 min, Inny) - brak startu, od razu przesył
        btnToggle.classList.add("hidden");
        btnDispatch.classList.remove("hidden");
        btnDispatch.innerHTML = `<i data-lucide="send" class="w-6 h-6"></i> PRZEŚLIJ MELDUNEK (${durationMinutes || 0} MIN)`;
    }

    checkDispatchReadiness();
    if (window.lucide) lucide.createIcons();
}

function checkDispatchReadiness() {
    const btnDispatch = document.getElementById("btn-manual-dispatch");
    const noteInput = document.getElementById("manual-operator-note");
    const noteVal = noteInput.value.trim();

    let isReady = true;

    // Warunek 1: Czy wybrano usterkę?
    if (!selectedFault) isReady = false;

    // Warunek 2: Jeśli usterka to INNE/NOWE, czy pole opisu nie jest puste?
    if (selectedFault && selectedFault.isCustom && noteVal.length < 3) {
        isReady = false;
    }

    // Warunek 3: Czy czas > 0?
    const calcMins = durationType === "live" ? durationMinutes : durationMinutes;
    if (calcMins <= 0) isReady = false;

    if (isReady) {
        btnDispatch.disabled = false;
        btnDispatch.classList.remove("opacity-40", "cursor-not-allowed");
    } else {
        btnDispatch.disabled = true;
        btnDispatch.classList.add("opacity-40", "cursor-not-allowed");
    }
}

// 7. Wysłanie zgłoszenia ręcznego do szyny MES
function dispatchManualTelemetry() {
    if (!selectedFault) {
        alert("Wymóg Poka-Yoke: Zaznacz kod usterki przed nadaniem meldunku.");
        return;
    }

    const noteInput = document.getElementById("manual-operator-note");
    const noteText = noteInput.value.trim();

    if (selectedFault.isCustom && noteText.length < 3) {
        alert("Wymóg Poka-Yoke: Dla nowej/innej usterki wpisanie objawu jest obowiązkowe.");
        noteInput.focus();
        return;
    }

    const calculatedMinutes = durationType === "live" ? durationMinutes : durationMinutes;
    if (calculatedMinutes <= 0) {
        alert("Wymóg Poka-Yoke: Wprowadź poprawny czas trwania awarii.");
        return;
    }

    const faultName = selectedFault.isCustom ? `[NOWA]: ${noteText}` : selectedFault.name;
    const finalNote = noteText || `Zgłoszenie z terminala: ${selectedFault.name}`;
    const calculatedCost = calculatedMinutes * selectedFault.costMin;

    const payload = {
        machineId: selectedMachine.id,
        machineName: selectedMachine.name,
        stationCode: selectedMachine.code,
        faultCode: selectedFault.code,
        faultDescription: faultName,
        durationMin: calculatedMinutes,
        operatorName: selectedOperator.name,
        operatorNote: finalNote,
        responsibleDept: selectedFault.dept,
        costTotalPLN: calculatedCost,
        source: "MANUAL-MES"
    };

    if (typeof publishTelemetryEvent === "function") {
        publishTelemetryEvent(payload);
    }

    // Reset stanu po wysłaniu z zachowaniem tożsamości operatora i stanowiska
    selectedFault = null;
    renderFaultsForMachine(selectedMachine.id);

    stopLiveTimerInternal();
    liveSeconds = 0;
    durationMinutes = 0;
    isLiveFinishedAndReady = false;
    document.getElementById("live-timer-display").innerText = "00:00";
    noteInput.value = "";
    setTimeMode("live");

    const statusInd = document.getElementById("manual-status-indicator");
    statusInd.innerHTML = `<span class="text-gold-400 font-bold">Meldunek nadany do magistrali MES (+2.0s bufor). Stanowisko gotowe.</span>`;
    setTimeout(() => {
        statusInd.innerHTML = `<span class="w-3 h-3 rounded-full bg-emerald-400"></span> Gotowość do rejestracji meldunku`;
    }, 4000);
}

// 8. Logika AUTO-MES (Ciągły licznik Uptime PLC)
function startGlobalPlcUptimeCounter() {
    if (globalPlcUptimeInterval) clearInterval(globalPlcUptimeInterval);
    globalPlcUptimeInterval = setInterval(() => {
        if (!isPlcAlarm) {
            globalPlcUptimeSeconds++;
            const hrs = Math.floor(globalPlcUptimeSeconds / 3600);
            const mins = Math.floor((globalPlcUptimeSeconds % 3600) / 60);
            const secs = globalPlcUptimeSeconds % 60;
            const str = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const el = document.getElementById("plc-uptime-display");
            if (el) el.innerText = str;
        }
    }, 1000);
}

function selectAutoMachine(id) {
    autoMachineId = id;
    document.querySelectorAll(".auto-mach-btn").forEach((btn, idx) => {
        if (idx === id) {
            btn.className = "auto-mach-btn p-5 sm:p-6 rounded-2xl border-2 border-cyan-500 bg-cyan-500/10 text-left transition shadow-lg";
        } else {
            btn.className = "auto-mach-btn p-5 sm:p-6 rounded-2xl border-2 border-graphite-750 bg-graphite-950 text-left transition hover:border-cyan-400";
        }
    });

    // Przełączenie maszyny NIE KASUJE zegara, jeśli maszyna jest w trybie normalnym
    if (!isPlcAlarm) {
        resetPlcNormalState();
    }
}

function triggerPlcStop() {
    if (!isPlcAlarm) {
        // Wystąpienie awarii
        isPlcAlarm = true;
        plcAlarmSeconds = 0;
        
        if (plcAlarmInterval) clearInterval(plcAlarmInterval);
        plcAlarmInterval = setInterval(() => {
            plcAlarmSeconds++;
            const mins = Math.floor(plcAlarmSeconds / 60);
            const secs = plcAlarmSeconds % 60;
            const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const el = document.getElementById("plc-state-timer");
            if (el) el.innerText = str;
        }, 1000);

        // Losowanie 1 z 6 dedykowanych błędów
        const errors = PLC_ERRORS[autoMachineId] || PLC_ERRORS[0];
        activePlcError = errors[Math.floor(Math.random() * errors.length)];

        // UI w stan alarmu
        const card = document.getElementById("plc-status-card");
        card.className = "bg-graphite-950 border-2 border-rose-500 p-6 sm:p-7 rounded-2xl space-y-5 shadow-2xl";

        const icon = document.getElementById("plc-status-icon");
        icon.className = "w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-400 animate-pulse";
        icon.innerHTML = `<i data-lucide="alert-octagon" class="w-7 h-7"></i>`;

        const cycleText = document.getElementById("plc-cycle-text");
        cycleText.className = "text-xs sm:text-sm font-mono-numbers font-bold text-rose-400 uppercase tracking-wider block";
        cycleText.innerText = "STAN STEROWNIKA: ZATRZYMANIE AWARYJNE (ALARM = TRUE)";

        document.getElementById("plc-active-title").innerText = activePlcError.desc;
        document.getElementById("plc-timer-label").innerText = "Czas trwania awarii";

        const errBox = document.getElementById("plc-error-details");
        errBox.classList.remove("hidden");
        document.getElementById("plc-error-code").innerText = `REJESTR PLC: ${activePlcError.code}`;
        document.getElementById("plc-error-desc").innerText = activePlcError.desc;

        const btnToggle = document.getElementById("btn-plc-toggle");
        btnToggle.className = "px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-graphite-950 font-extrabold text-xs sm:text-sm rounded-xl transition shadow-xl flex items-center justify-center gap-2.5";
        btnToggle.innerHTML = `<i data-lucide="rotate-ccw" class="w-5 h-5"></i> KASUJ BŁĄD PLC (RESET CYKLU)`;

        document.getElementById("btn-plc-dispatch").classList.remove("hidden");
    } else {
        // Reset błędu
        resetPlcNormalState();
    }
    if (window.lucide) lucide.createIcons();
}

function resetPlcNormalState() {
    isPlcAlarm = false;
    activePlcError = null;
    if (plcAlarmInterval) clearInterval(plcAlarmInterval);

    const card = document.getElementById("plc-status-card");
    card.className = "bg-graphite-950 border-2 border-emerald-500/50 p-6 sm:p-7 rounded-2xl space-y-5";

    const icon = document.getElementById("plc-status-icon");
    icon.className = "w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400";
    icon.innerHTML = `<i data-lucide="check-circle-2" class="w-7 h-7"></i>`;

    const cycleText = document.getElementById("plc-cycle-text");
    cycleText.className = "text-xs sm:text-sm font-mono-numbers font-bold text-emerald-400 uppercase tracking-wider block";
    cycleText.innerText = "STAN STEROWNIKA: PRACA AUTOMATYCZNA (CYCLE_RUN = TRUE)";

    document.getElementById("plc-active-title").innerText = "Brak aktywnych kodów błędu w rejestrze PLC";
    document.getElementById("plc-timer-label").innerText = "Czas ciągłego cyklu";
    document.getElementById("plc-state-timer").innerText = "RUN";
    document.getElementById("plc-error-details").classList.add("hidden");

    const btnToggle = document.getElementById("btn-plc-toggle");
    btnToggle.className = "px-8 py-4 bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-xs sm:text-sm rounded-xl transition shadow-xl flex items-center justify-center gap-2.5";
    btnToggle.innerHTML = `<i data-lucide="octagon-alert" class="w-5 h-5"></i> ZATRZYMAJ MASZYNĘ (SYGNAŁ PLC)`;

    document.getElementById("btn-plc-dispatch").classList.add("hidden");
    if (window.lucide) lucide.createIcons();
}

function dispatchPlcTelemetry() {
    if (!activePlcError) return;

    const calcMins = Math.max(1, Math.ceil(plcAlarmSeconds / 60));
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