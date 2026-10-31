/**
 * Proton Lean OS - Industrial Telemetry Bus Module
 * Magistrala zdarzeniowa oparta o BroadcastChannel API z symulacją opóźnienia sieciowego.
 */

const BUS_CHANNEL_NAME = 'proton_telemetry_bus';
const NETWORK_LATENCY_MS = 2000; // 2 sekundy symulacji propagacji sieci zakładowej

// Inicjalizacja instancji magistrali
const telemetryBus = new BroadcastChannel(BUS_CHANNEL_NAME);

/**
 * Publikacja meldunku telemetrycznego z terminala operatorskiego do szyny zakładowej.
 * @param {Object} payload Obiekt zdarzenia (id maszyny, kod usterki, czas, notatka, koszt)
 */
function publishTelemetryEvent(payload) {
    if (!payload) return;

    // Emisja pakietu do BroadcastChannel
    telemetryBus.postMessage(payload);

    // Kopia zapasowa w localStorage na wypadek odświeżenia okna
    try {
        localStorage.setItem('proton_last_event', JSON.stringify(payload));
    } catch (e) {
        console.warn('[Bus] Błąd zapisu do localStorage:', e);
    }

    console.log(`[Bus Transmit] Wyemitowano pakiet #${payload.eventId} do magistrali.`);
}

/**
 * Subskrypcja zdarzeń telemetrycznych z szyny z uwzględnieniem 2-sekundowego opóźnienia.
 * @param {Function} onEventReceived Callback wywoływany po upływie opóźnienia z odebranym pakietem
 */
function subscribeTelemetryEvents(onEventReceived) {
    telemetryBus.onmessage = (event) => {
        const payload = event.data;
        if (!payload) return;

        console.log(`[Bus Receive] Wykryto pakiet #${payload.eventId}. Buforowanie przez ${NETWORK_LATENCY_MS} ms...`);

        // Sztuczne opóźnienie propagacji sieciowej
        setTimeout(() => {
            console.log(`[Bus Deliver] Dostarczono pakiet #${payload.eventId} do modułu decyzyjnego.`);
            if (typeof onEventReceived === 'function') {
                onEventReceived(payload);
            }
        }, NETWORK_LATENCY_MS);
    };
}