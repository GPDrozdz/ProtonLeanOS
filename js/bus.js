/**
 * Proton Lean OS - Szyna Telemetryczna MES (MQTT over WebSocket + Time-Series Context)
 * Wersja: v3.9 (Auto-Shift Detection & ISO Timestamp Injection)
 * Obsługuje komunikację w czasie rzeczywistym między terminalem shop-floor a kokpitem zarządczym.
 */

const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC = 'proton_lean_os/krosno_fab_pk1/session_telemetry_v1';
const LOCAL_BUS_STORAGE_KEY = 'proton_mes_live_events_v3';

const MESBus = {
    client: null,
    isConnected: false,
    listeners: [],
    clientId: 'proton_node_' + Math.random().toString(16).substring(2, 10),

    /**
     * Wyznacza kontekst produkcyjny (zmiana robocza oraz data produkcyjna) na podstawie zegara systemowego.
     * Zmiana I:   06:00 - 13:59
     * Zmiana II:  14:00 - 21:59
     * Zmiana III: 22:00 - 05:59 (godziny 00:00-05:59 należą do zmiany nocnej rozpoczętej dnia poprzedniego)
     */
    getProductionTimeContext(dateObj = new Date()) {
        const hour = dateObj.getHours();
        let shiftId = 1;
        let shiftName = 'Zmiana I (06-14)';
        const prodDate = new Date(dateObj);

        if (hour >= 6 && hour < 14) {
            shiftId = 1;
            shiftName = 'Zmiana I (06-14)';
        } else if (hour >= 14 && hour < 22) {
            shiftId = 2;
            shiftName = 'Zmiana II (14-22)';
        } else {
            shiftId = 3;
            shiftName = 'Zmiana III (22-06)';
            // Jeśli jest po północy (00:00 - 05:59), zdarzenie należy do doby produkcyjnej rozpoczętej o 22:00 wczoraj
            if (hour < 6) {
                prodDate.setDate(prodDate.getDate() - 1);
            }
        }

        const year = prodDate.getFullYear();
        const month = String(prodDate.getMonth() + 1).padStart(2, '0');
        const day = String(prodDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const timeFormatted = dateObj.toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return {
            isoTimestamp: dateObj.toISOString(),
            dateStr: dateStr,
            timeFormatted: timeFormatted,
            shiftId: shiftId,
            shiftName: shiftName
        };
    },

    init(onStatusChange) {
        if (typeof mqtt === 'undefined') {
            console.warn('[MES Bus] Brak biblioteki MQTT.js. Praca w trybie lokalnym (Offline Storage Bus).');
            if (onStatusChange) onStatusChange(false);
            this.initStorageSync();
            return;
        }

        try {
            this.client = mqtt.connect(MQTT_BROKER_URL, {
                clientId: this.clientId,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 4000
            });

            this.client.on('connect', () => {
                this.isConnected = true;
                console.log(`[MES Bus] Połączono z brokerem MQTT (${this.clientId})`);
                this.client.subscribe(MQTT_TOPIC, (err) => {
                    if (!err) {
                        console.log(`[MES Bus] Zasubskrybowano kanał: ${MQTT_TOPIC}`);
                    }
                });
                if (onStatusChange) onStatusChange(true);
            });

            this.client.on('message', (topic, message) => {
                if (topic === MQTT_TOPIC) {
                    try {
                        const payload = JSON.parse(message.toString());
                        // Ignorujemy własne echa z tego samego okna przeglądarki
                        if (payload._senderId === this.clientId) return;

                        const enriched = this.enrichPayloadWithTime(payload);
                        this.saveToLocalBuffer(enriched);
                        this.notifyListeners(enriched);
                    } catch (e) {
                        console.error('[MES Bus] Błąd parsowania pakietu telemetrycznego:', e);
                    }
                }
            });

            this.client.on('offline', () => {
                this.isConnected = false;
                console.warn('[MES Bus] Utrata połączenia z siecią. Aktywny lokalny bufor awaryjny.');
                if (onStatusChange) onStatusChange(false);
            });

            this.client.on('error', (err) => {
                this.isConnected = false;
                console.error('[MES Bus] Błąd szyny MQTT:', err);
                if (onStatusChange) onStatusChange(false);
            });
        } catch (err) {
            console.error('[MES Bus] Wyjątek inicjalizacji MQTT:', err);
            if (onStatusChange) onStatusChange(false);
        }

        // Nasłuch na komunikację między kartami przeglądarki (LocalStorage Event)
        this.initStorageSync();
    },

    initStorageSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === LOCAL_BUS_STORAGE_KEY && e.newValue) {
                try {
                    const events = JSON.parse(e.newValue);
                    if (Array.isArray(events) && events.length > 0) {
                        const latest = events[0];
                        if (latest._senderId !== this.clientId) {
                            this.notifyListeners(latest);
                        }
                    }
                } catch (err) {
                    console.warn('[MES Bus] Błąd synchronizacji między kartami:', err);
                }
            }
        });
    },

    // Gwarantuje, że każdy pakiet ma twardy timestamp, dateStr i shiftId
    enrichPayloadWithTime(rawPayload) {
        const now = rawPayload.timestamp ? new Date(rawPayload.timestamp) : new Date();
        const timeCtx = this.getProductionTimeContext(now);

        return {
            ...rawPayload,
            id: rawPayload.id || ('EVT-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            timestamp: timeCtx.isoTimestamp,
            dateStr: rawPayload.dateStr || timeCtx.dateStr,
            timeFormatted: rawPayload.timeFormatted || timeCtx.timeFormatted,
            shiftId: rawPayload.shiftId || timeCtx.shiftId,
            shiftName: rawPayload.shiftName || timeCtx.shiftName,
            isLiveEvent: true
        };
    },

    publishEvent(eventData) {
        const enrichedPayload = this.enrichPayloadWithTime({
            ...eventData,
            _senderId: this.clientId
        });

        // 1. Zapis w lokalnym buforze trwałym
        this.saveToLocalBuffer(enrichedPayload);

        // 2. Rozgłoszenie do lokalnych słuchaczy w bieżącym oknie
        this.notifyListeners(enrichedPayload);

        // 3. Wysyłka w chmurę MQTT (jeśli online)
        if (this.client && this.isConnected) {
            this.client.publish(MQTT_TOPIC, JSON.stringify(enrichedPayload), { qos: 1 });
            console.log(`[MES Bus] Wysłano meldunek [${enrichedPayload.shiftName} | ${enrichedPayload.dateStr}]:`, enrichedPayload);
        } else {
            console.log(`[MES Bus Offline] Zapisano meldunek lokalnie [${enrichedPayload.shiftName} | ${enrichedPayload.dateStr}]:`, enrichedPayload);
        }

        return enrichedPayload;
    },

    saveToLocalBuffer(eventObj) {
        try {
            const raw = localStorage.getItem(LOCAL_BUS_STORAGE_KEY);
            const existing = raw ? JSON.parse(raw) : [];
            // Deduplikacja po ID zdarzenia
            if (!existing.some(item => item.id === eventObj.id)) {
                existing.unshift(eventObj);
                // Trzymamy maksymalnie 300 ostatnich zdarzeń live w buforze
                if (existing.length > 300) existing.length = 300;
                localStorage.setItem(LOCAL_BUS_STORAGE_KEY, JSON.stringify(existing));
            }
        } catch (err) {
            console.warn('[MES Bus] Błąd zapisu do bufora localStorage:', err);
        }
    },

    getStoredLiveEvents() {
        try {
            const raw = localStorage.getItem(LOCAL_BUS_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (err) {
            return [];
        }
    },

    clearStoredLiveEvents() {
        localStorage.removeItem(LOCAL_BUS_STORAGE_KEY);
    },

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    },

    notifyListeners(payload) {
        this.listeners.forEach(cb => {
            try {
                cb(payload);
            } catch (err) {
                console.error('[MES Bus] Błąd w funkcji odbiorcy:', err);
            }
        });
    }
};

window.MESBus = MESBus;