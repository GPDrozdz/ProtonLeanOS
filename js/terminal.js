/**
 * Proton Lean OS - Operator Terminal Logic
 * Obsługa formularza meldunkowego na hali produkcyjnej i integracja z szyną zdarzeń.
 */

// Domyślnie wybrana usterka (Wąskie gardło #1)
let activeFault = {
    code: 'BLM_JAM',
    desc: 'Zablokowany stół usuwania urobku / brak odbioru',
    duration: 51,
    cost: 75,
    dept: 'Logistyka Wewnętrzna'
};

/**
 * Wybór kodu usterki ze słownika awarii
 */
function selectFault(code, desc, duration, cost, dept) {
    activeFault = { code, desc, duration, cost, dept };
    
    const durationInput = document.getElementById('fault-duration');
    if (durationInput) {
        durationInput.value = duration;
    }
    
    // Wizualna aktualizacja aktywności kafelków
    document.querySelectorAll('.fault-btn').forEach(btn => {
        btn.className = "fault-btn p-3.5 rounded-xl border-2 border-graphite-750 bg-graphite-900 text-left hover:border-gold-400 transition";
    });

    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.className = "fault-btn p-3.5 rounded-xl border-2 border-gold-500/60 bg-gold-500/10 text-left hover:border-gold-400 transition";
    }
}

/**
 * Złożenie i nadanie pakietu telemetrycznego do magistrali
 */
function dispatchTelemetryEvent() {
    const btn = document.getElementById('btn-dispatch');
    const status = document.getElementById('transmit-status');
    const stationSelect = document.getElementById('station-select');
    const durationInput = document.getElementById('fault-duration');
    const noteInput = document.getElementById('operator-note');

    if (!btn || !stationSelect || !durationInput || !noteInput) return;

    const stationId = parseInt(stationSelect.value);
    const duration = parseInt(durationInput.value) || activeFault.duration;
    const note = noteInput.value.trim() || "Brak dodatkowego komentarza operatora.";

    // Przygotowanie ustandaryzowanego pakietu JSON
    const payload = {
        timestamp: new Date().toISOString(),
        eventId: 'EV-' + Math.floor(1000 + Math.random() * 9000),
        machineId: stationId,
        faultCode: activeFault.code,
        faultDescription: activeFault.desc,
        durationMin: duration,
        costTotalPLN: duration * activeFault.cost,
        operatorNote: note,
        responsibleDept: activeFault.dept
    };

    // Wizualna informacja o transmisji po stronie terminala
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Nadawanie do bufora MES...`;
    if (status) {
        status.innerHTML = `<span class="w-2 h-2 rounded-full bg-gold-400 animate-ping"></span> Przesyłanie pakietu telemetrii...`;
    }
    if (window.lucide) lucide.createIcons();

    // Wysłanie pakietu za pośrednictwem modułu bus.js
    if (typeof publishTelemetryEvent === 'function') {
        publishTelemetryEvent(payload);
    } else {
        console.error('[Terminal] Błąd: Brak zdefiniowanej funkcji publishTelemetryEvent z pliku bus.js!');
    }

    // Przywrócenie stanu gotowości przycisku
    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="radio" class="w-5 h-5"></i> Nadaj Meldunek do Magistrali Zakładowej`;
        if (status) {
            status.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Wysłano pomyślnie (Pakiet: ${payload.eventId})`;
        }
        if (window.lucide) lucide.createIcons();
    }, 600);
}

// Inicjalizacja ikon Lucide po załadowaniu drzewa DOM
window.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) {
        lucide.createIcons();
    }
});