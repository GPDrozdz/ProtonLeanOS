/**
 * Proton Lean OS - Industrial Telemetry Bus (v3.0 Secure Prototyping Engine)
 * Hybrydowa magistrala MQTT over WebSocket + LocalStorage Fallback.
 * Połączenie Dashboard <-> Terminal pomiędzy niezależnymi urządzeniami w czasie rzeczywistym.
 */

// Konfiguracja bezpiecznego kanału WebSocket (TLS Port 8084)
const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

// Dedykowany, trudny do odgadnięcia temat przemysłowy dla Twojej instancji
const MQTT_TOPIC_TELEMETRY = 'proton_lean_os/krosno_fab_pk1/session_telemetry_v1';
const STORAGE_BUS_KEY = 'proton_telemetry_bus_event';

let mqttClient = null;
let registeredTelemetryCallbacks = [];

// 1. Inicjalizacja klienta MQTT
function initMqttBus() {
    if (typeof mqtt === 'undefined') {
        console.warn('[MES Bus] Biblioteka MQTT nie została załadowana. Przełączono w tryb pamięci lokalnej.');
        setupLocalStorageFallback();
        return;
    }

    // Unikalne ID klienta dla każdego urządzenia/karty
    const clientId = 'proton_node_' + Math.random().toString(16).substring(2, 10);

    try {
        mqttClient = mqtt.connect(MQTT_BROKER_URL, {
            clientId: clientId,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 2500,
            keepalive: 30
        });

        mqttClient.on('connect', () => {
            console.log(`%c[MES Bus] Połączono z brokerem MQTT (${clientId})`, 'color: #10b981; font-weight: bold;');
            mqttClient.subscribe(MQTT_TOPIC_TELEMETRY, { qos: 1 }, (err) => {
                if (!err) {
                    console.log(`[MES Bus] Zasubskrybowano kanał: ${MQTT_TOPIC_TELEMETRY}`);
                }
            });
            updateBusStatusUI(true);
        });

        mqttClient.on('message', (topic, message) => {
            if (topic === MQTT_TOPIC_TELEMETRY) {
                try {
                    const rawPayload = JSON.parse(message.toString());
                    console.log('[MES Bus] Zdarzenie odebrane z sieci MQTT:', rawPayload);
                    dispatchToSubscribers(rawPayload);
                } catch (e) {
                    console.error('[MES Bus] Błąd parsowania ramki telemetrii MQTT:', e);
                }
            }
        });

        mqttClient.on('error', (err) => {
            console.warn('[MES Bus] Błąd połączenia MQTT:', err.message);
            updateBusStatusUI(false);
        });

        mqttClient.on('offline', () => {
            console.warn('[MES Bus] Utrata połączenia z siecią. Aktywny lokalny bufor awaryjny.');
            updateBusStatusUI(false);
        });

    } catch (err) {
        console.error('[MES Bus] Błąd krytyczny inicjalizacji MQTT:', err);
        setupLocalStorageFallback();
    }

    // Równoległy nasłuch zdarzeń wewnątrz jednego komputera (karta obok karty)
    setupLocalStorageFallback();
}

// 2. Lokalny nasłuch awaryjny (LocalStorage Fallback)
function setupLocalStorageFallback() {
    window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_BUS_KEY && event.newValue) {
            try {
                const payload = JSON.parse(event.newValue);
                dispatchToSubscribers(payload);
            } catch (e) {
                console.error('[MES Bus] Błąd odczytu fallbacku Storage:', e);
            }
        }
    });
}

// 3. Rozesłanie zdarzenia do subskrybentów (np. handleIncomingTelemetry w dashboard.js)
function dispatchToSubscribers(payload) {
    registeredTelemetryCallbacks.forEach(callback => {
        try {
            callback(payload);
        } catch (err) {
            console.error('[MES Bus] Błąd w obsłudze zdarzenia przez odbiornik:', err);
        }
    });
}

// 4. Publikacja zdarzenia z Terminala na wszystkie urządzenia w sieci
function publishTelemetryEvent(payload) {
    const enrichedPayload = {
        ...payload,
        eventId: 'EV-' + Date.now().toString().slice(-4),
        transmittedAt: new Date().toLocaleTimeString().slice(0, 5)
    };

    // A. Emisja przez sieć MQTT (dla innych komputerów i telefonów)
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(MQTT_TOPIC_TELEMETRY, JSON.stringify(enrichedPayload), { qos: 1 }, (err) => {
            if (err) {
                console.error('[MES Bus] Błąd publikacji pakietu MQTT:', err);
            } else {
                console.log('[MES Bus] Pakiet pomyślnie wyemitowany do brokera MQTT.');
            }
        });
    }

    // B. Równoległy zapis lokalny (dla obecnego urządzenia)
    try {
        localStorage.setItem(STORAGE_BUS_KEY, JSON.stringify(enrichedPayload));
    } catch (e) {
        console.warn('[MES Bus] Zapis w localStorage zablokowany:', e);
    }
}

// 5. Rejestracja funkcji odbiorczej w Dashboardzie
function subscribeTelemetryEvents(callback) {
    if (typeof callback === 'function') {
        registeredTelemetryCallbacks.push(callback);
    }
}

// 6. Wizualny wskaźnik stanu szyny danych w stopce
function updateBusStatusUI(isOnline) {
    const statusLabels = document.querySelectorAll('.bus-status-indicator');
    statusLabels.forEach(el => {
        el.innerHTML = isOnline 
            ? `<span class="text-emerald-400 font-bold">MQTT ONLINE (Chmura)</span>` 
            : `<span class="text-amber-400 font-bold">LOKALNY (Offline)</span>`;
    });
}

// Uruchomienie magistrali
initMqttBus();