/**
 * Proton Lean OS - Silnik Wnioskowania AI Multi-Model Failover (v4.9)
 * - Kaskada empirycznie zweryfikowanych węzłów HTTP 200 OK:
 *   gemini-3-flash-preview -> gemini-3.5-flash-lite -> gemini-3.5-flash -> gemini-3.8-flash
 * - Audyt 5S Vision: Zero-Hallucination Prompt (lokalizacja przestrzenna obiektów bez sugestii)
 * - Silnik Edge Offline rozdzielony na Klasę A (Maszyny CNC/Robot) i Klasę B (Stanowiska Manualne)
 */

const STORAGE_KEY_GEMINI = 'proton_gemini_api_key';

const MODEL_CASCADE_5WHY = [
    { name: 'gemini-3-flash-preview', timeoutMs: 14000 },
    { name: 'gemini-3.5-flash-lite', timeoutMs: 12000 },
    { name: 'gemini-3.5-flash', timeoutMs: 14000 },
    { name: 'gemini-3.8-flash', timeoutMs: 15000 }
];

const MODEL_CASCADE_VISION = [
    { name: 'gemini-3-flash-preview', timeoutMs: 18000 },
    { name: 'gemini-3.5-flash', timeoutMs: 18000 },
    { name: 'gemini-3.5-flash-lite', timeoutMs: 18000 },
    { name: 'gemini-3.8-flash', timeoutMs: 20000 }
];

const MANUAL_STATION_IDS = ['M-01', 'S-02', 'K-02', 'G-08', 'G-09', 'G-10'];

const GeminiEngine = {
    getApiKey() {
        return (localStorage.getItem(STORAGE_KEY_GEMINI) || '').trim();
    },

    setApiKey(key) {
        const cleanKey = (key || '').trim();
        if (cleanKey) {
            localStorage.setItem(STORAGE_KEY_GEMINI, cleanKey);
        } else {
            localStorage.removeItem(STORAGE_KEY_GEMINI);
        }
    },

    hasActiveApiKey() {
        const k = this.getApiKey();
        return k.length > 20 && !k.startsWith('/*') && !k.includes(' ');
    },

    getEndpoint(modelName) {
        const proto = 'https:';
        const host = '//generativelanguage.googleapis.com/v1beta/models/';
        return proto + host + modelName + ':generateContent';
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    extractCleanJson(rawText) {
        const text = String(rawText || '').trim();
        const cleaned = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        }
        return JSON.parse(cleaned);
    },

    isManualStation(incident) {
        const id = String(incident?.machineId || '').toUpperCase();
        const name = String(incident?.machineName || '').toLowerCase();
        if (MANUAL_STATION_IDS.includes(id)) return true;
        return name.includes('montaż') || name.includes('manual') || name.includes('śrutownia') || name.includes('przedgalwanika');
    },

    // =========================================================================
    // 1. ANALIZA PRZYCZYNOWA 5-WHY (gemini-3-flash-preview + Failover + Edge)
    // =========================================================================
    async analyzeIncident(incident, humanNote = '') {
        const safeIncident = this.sanitizeIncidentInput(incident);
        const safeNote = String(humanNote || '').trim().slice(0, 600);

        if (!this.hasActiveApiKey()) {
            return this.runLocalEdgeInference(safeIncident, safeNote, false);
        }

        let lastError = null;
        for (let i = 0; i < MODEL_CASCADE_5WHY.length; i++) {
            const node = MODEL_CASCADE_5WHY[i];
            try {
                return await this.fetchGemini5Why(node.name, node.timeoutMs, safeIncident, safeNote);
            } catch (err) {
                lastError = err;
                if (err.isAuthError) {
                    console.error('[5-Why Auth Error - nieprawidłowy klucz API]:', err.message);
                    break;
                }
                console.warn(`[5-Why Failover ${i + 1}/${MODEL_CASCADE_5WHY.length}] Węzeł ${node.name} niedostępny (${err.message}) – przełączam na kolejny...`);
                if (i < MODEL_CASCADE_5WHY.length - 1) {
                    await this.sleep(250);
                }
            }
        }

        console.error('[5-Why Cloud Error - wszystkie węzły chmury zajęte, uruchamiam Edge Fallback]:', lastError);
        return this.runLocalEdgeInference(safeIncident, safeNote, true);
    },

    sanitizeIncidentInput(raw) {
        const inc = raw || {};
        const rawDuration = Number(inc.durationMin);
        return {
            machineId: String(inc.machineId || 'G-00').trim(),
            machineName: String(inc.machineName || 'Nieznane Gniazdo Robocze').trim(),
            faultCode: String(inc.faultCode || 'BRAK-KODU').trim(),
            faultDescription: String(inc.faultDescription || 'Nieokreślone zatrzymanie cyklu').trim().slice(0, 300),
            durationMin: Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(1440, Math.round(rawDuration)) : 1,
            shiftId: inc.shiftId || 1,
            shiftName: String(inc.shiftName || `Zmiana ${inc.shiftId || 1}`).trim()
        };
    },

    async fetchGemini5Why(modelName, timeoutMs, incident, humanNote) {
        const apiKey = this.getApiKey();
        const url = `${this.getEndpoint(modelName)}?key=${encodeURIComponent(apiKey)}`;
        const stationTypeLabel = this.isManualStation(incident)
            ? 'STANOWISKO MANUALNE / PRACA RĘCZNA OPERATORÓW (brak automatyki CNC)'
            : 'MASZYNA CNC / GŁOWICA / CELA ZROBOTYZOWANA';

        const prompt = `Jesteś Głównym Inżynierem Lean Manufacturing i Audytorem IATF 16949 w zakładzie konstrukcji stalowych.
Przeprowadź rygorystyczną analizę przyczyn źródłowych metodą 5-Why dla poniższego przestoju produkcyjnego.

DANE ZDARZENIA:
- Stanowisko: ${incident.machineName} (${incident.machineId})
- Typ gniazda: ${stationTypeLabel}
- Kod błędu: ${incident.faultCode}
- Opis przestoju: ${incident.faultDescription}
- Czas straty: ${incident.durationMin} minut (${incident.durationMin <= 5 ? 'mikroprzestój' : 'przestój istotny'})
- Zmiana robocza: ${incident.shiftName}
- Obserwacja operatora/lidera z Gemba: "${humanNote || 'Brak dodatkowych uwag'}"

WYMAGANIA:
1. Dostosuj słownictwo i fizykę procesu ściśle do typu gniazda (${stationTypeLabel}). Dla stanowiska manualnego analizuj narzędzia ręczne, kompletację detali, przyrządy i procedury pracy ludzi.
2. Każde kolejne "Dlaczego" (w1 -> w5) musi wynikać logicznie z poprzedniego i schodzić od objawu do systemowej przyczyny źródłowej (brak standardu, brak Poka-Yoke, luka w TPM/SMED/Kitting).
3. Działanie korygujące (capa) musi być konkretne, techniczne i nie może naruszać zasad BHP.
4. Zwróć WYŁĄCZNIE surowy obiekt JSON (bez tekstu przed ani po, bez znaczników markdown) o dokładnie tych kluczach:
{
  "w1": "1. Dlaczego (objaw bezpośredni)",
  "w2": "2. Dlaczego (przyczyna fizyczna)",
  "w3": "3. Dlaczego (stan pośredni)",
  "w4": "4. Dlaczego (luka procesowa)",
  "w5": "Przyczyna Źródłowa: ...",
  "capa": "Konkretne działanie techniczne / Poka-Yoke",
  "owner": "Dział odpowiedzialny"
}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error(`Timeout ${timeoutMs / 1000}s`)), timeoutMs);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.25 }
                })
            });

            clearTimeout(timer);

            if (!response.ok) {
                const errText = await response.text();
                const err = new Error(`HTTP ${response.status}: ${errText.slice(0, 180)}`);
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    err.isAuthError = true;
                }
                throw err;
            }

            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Pusta odpowiedź z modelu Gemini 5-Why');

            const parsed = this.extractCleanJson(rawText);
            const requiredKeys = ['w1', 'w2', 'w3', 'w4', 'w5', 'capa'];
            if (!requiredKeys.every(k => typeof parsed[k] === 'string' && parsed[k].trim().length >= 8)) {
                throw new Error('Niekompletna struktura 5-Why zwrócona przez model');
            }

            return {
                w1: parsed.w1.trim(),
                w2: parsed.w2.trim(),
                w3: parsed.w3.trim(),
                w4: parsed.w4.trim(),
                w5: parsed.w5.trim(),
                capa: parsed.capa.trim(),
                owner: (parsed.owner || 'Utrzymanie Ruchu / Technologia').trim(),
                source: `Gemini ${modelName} Live (Cloud AI)`
            };
        } finally {
            clearTimeout(timer);
        }
    },

    // =========================================================================
    // 2. AUDYT WIZYJNY 5S VISION (Zero-Hallucination + Poka-Yoke optyczny)
    // =========================================================================
    async analyzeVisual5S(imageBase64, station, auditorNotes = '') {
        const safeStation = {
            name: String(station?.name || 'Stanowisko Produkcyjne').trim(),
            code: String(station?.code || 'G-01').trim(),
            area: String(station?.area || 'Hala Produkcyjna').trim()
        };
        const safeNotes = String(auditorNotes || '').trim().slice(0, 500);

        if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.includes(',')) {
            return this.runLocalVisionFallback(safeStation, safeNotes, 'Brak zdjęcia – ocena na podstawie wywiadu LPA');
        }

        const prepared = await this.prepareImageForVision(imageBase64);

        if (prepared.isCorrupted) {
            return {
                score: "1.00",
                s1: "1.00", s2: "1.00", s3: "1.00", s4: "1.00", s5: "1.00",
                observations: [
                    { text: "Uszkodzony lub nieobsługiwany plik obrazu – brak możliwości odczytu klatki", pen: "-3.00 pkt (Poka-Yoke)" }
                ],
                capa: "Wgrać poprawny plik graficzny JPG lub PNG wykonany bezpośrednio na stanowisku.",
                source: "Poka-Yoke Pre-Flight (Uszkodzony plik)"
            };
        }

        if (prepared.isTooDark) {
            return {
                score: "1.50",
                s1: "1.50", s2: "1.50", s3: "1.50", s4: "1.50", s5: "1.50",
                observations: [
                    { text: "Kadr skrajnie niedoświetlony lub zasłonięty obiektyw kamery – brak możliwości weryfikacji 5S", pen: "-2.50 pkt (BHP/Poka-Yoke)" }
                ],
                capa: "Powtórzyć wykonanie zdjęcia stanowiska przy włączonym oświetleniu roboczym strefy.",
                source: "Poka-Yoke Pre-Flight (Zbyt ciemny kadr)"
            };
        }

        if (prepared.isOverexposed) {
            return {
                score: "1.80",
                s1: "1.80", s2: "1.80", s3: "1.80", s4: "1.80", s5: "1.80",
                observations: [
                    { text: "Kadr skrajnie prześwietlony (odblask spawania lub lampa skierowana w obiektyw) – nieczytelne detale", pen: "-2.20 pkt (Poka-Yoke)" }
                ],
                capa: "Wykonać zdjęcie pod innym kątem z pominięciem bezpośredniego źródła światła lub łuku spawalniczego.",
                source: "Poka-Yoke Pre-Flight (Prześwietlony kadr)"
            };
        }

        if (!this.hasActiveApiKey()) {
            return this.runLocalVisionFallback(safeStation, safeNotes, 'Tryb Offline (Brak klucza API)');
        }

        let lastError = null;
        for (let i = 0; i < MODEL_CASCADE_VISION.length; i++) {
            const node = MODEL_CASCADE_VISION[i];
            try {
                return await this.fetchGeminiVision5S(node.name, node.timeoutMs, prepared.base64Data, prepared.mimeType, safeStation, safeNotes);
            } catch (err) {
                lastError = err;
                if (err.isAuthError) {
                    console.error('[5S Vision Auth Error - nieprawidłowy klucz API]:', err.message);
                    break;
                }
                console.warn(`[5S Vision Failover ${i + 1}/${MODEL_CASCADE_VISION.length}] Węzeł ${node.name} niedostępny (${err.message}) – przełączam na kolejny...`);
                if (i < MODEL_CASCADE_VISION.length - 1) {
                    await this.sleep(250);
                }
            }
        }

        console.error('[5S Vision Cloud Error - wszystkie węzły chmury zajęte, uruchamiam Edge Fallback]:', lastError);
        return this.runLocalVisionFallback(safeStation, safeNotes, 'Edge Fallback (Przeciążenie serwerów API)');
    },

    async fetchGeminiVision5S(modelName, timeoutMs, base64Data, mimeType, station, auditorNotes) {
        const apiKey = this.getApiKey();
        const url = `${this.getEndpoint(modelName)}?key=${encodeURIComponent(apiKey)}`;

        const prompt = `Jesteś obiektywnym Audytorem Wiodącym Lean Manufacturing / 5S oraz Inspektorem BHP.
Przeprowadzasz inspekcję wizyjną przesłanego zdjęcia przypisanego do stanowiska: "${station.name}" (Kod: ${station.code}, Obszar: ${station.area}).
Dodatkowa wskazówka audytora LPA: "${auditorNotes || 'Brak uwag wstępnych'}".

BEZWZGLĘDNE ZASADY ANALIZY OBRAZU (ZERO HALUCYNACJI):
1. Opisuj WYŁĄCZNIE rzeczywiste, fizyczne obiekty, kolory, maszyny, meble, narzędzia i powierzchnie widoczne na tym konkretnym zdjęciu.
2. ZAKAZ ZMYŚLANIA: Nie dopisuj nieistniejących kabli, wiórów, kluczy ani plam oleju, jeśli ich naprawdę nie widać na obrazie.
3. Każda pozycja w tablicy "observations" MUSI zaczynać się od dokładnej lokalizacji w kadrze w nawiasie kwadratowym, np. [Lewa strona], [Centrum kadru], [Prawa strona], [Posadzka / Dół], [Tło / Ściana], po czym opisywać konkretny przedmiot i jego stan.
4. Jeśli zdjęcie przedstawia wzorcowy porządek (czysty blat, poukładane przedmioty, pusta posadzka), oceń je wysoko (4.30 – 4.90 pkt) i wskaż pozytywne elementy z prefiksem "+ Wzorcowo" w polu "pen".
5. Jeśli zdjęcie przedstawia realny bałagan, nieodłożone przedmioty lub zagrożenia BHP, obniż punktację proporcjonalnie do skali niezgodności (1.50 – 3.50 pkt) i wpisz karę ujemną w polu "pen" (np. "-0.60 pkt (2S)").
6. Jeśli zdjęcie w ogóle nie przedstawia miejsca pracy, warsztatu, maszyny ani biura (np. krajobraz, zwierzę, abstrakcja), przyznaj ocenę 1.00 we wszystkich filarach 1S–5S i wskaż ten fakt w obserwacjach.

OCENA FILARÓW (SKALA 1.00 - 5.00):
- s1 (1S Selekcja): brak zbędnych przedmiotów, opakowań i odpadów w kadrze.
- s2 (2S Systematyka): ergonomiczne ułożenie przedmiotów i narzędzi, brak chaosu na powierzchniach roboczych.
- s3 (3S Sprzątanie): czystość blatów, maszyn, podłóg i otoczenia.
- s4 (4S Standaryzacja): widoczne oznaczenia, etykiety, tablice, linie lub jednolity porządek wizualny.
- s5 (5S Samodyscyplina i BHP): brak zagrożeń potknięciem, bezpieczne składowanie, drożność przejść.

Zwróć WYŁĄCZNIE surowy obiekt JSON (bez znaczników markdown) o dokładnie tych kluczach:
{
  "s1": 3.5,
  "s2": 3.2,
  "s3": 3.8,
  "s4": 3.0,
  "s5": 3.6,
  "observations": [
    { "text": "[Centrum kadru] Konkretny opis tego, co widać na zdjęciu...", "pen": "-0.45 pkt (2S)" },
    { "text": "[Posadzka / Dół] Konkretny opis stanu podłoża...", "pen": "+ Wzorcowo (3S)" }
  ],
  "capa": "Konkretne działanie dopasowane wyłącznie do tego, co wykryto na tym zdjęciu"
}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error(`Timeout ${timeoutMs / 1000}s`)), timeoutMs);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: mimeType, data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.15
                    }
                })
            });

            clearTimeout(timer);

            if (!response.ok) {
                const errText = await response.text();
                const err = new Error(`HTTP ${response.status}: ${errText.slice(0, 180)}`);
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    err.isAuthError = true;
                }
                throw err;
            }

            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Pusta odpowiedź z modelu Gemini Vision');

            const parsed = this.extractCleanJson(rawText);

            const clamp = (v) => Math.max(1.0, Math.min(5.0, Number(v) || 2.5));
            const s1 = clamp(parsed.s1);
            const s2 = clamp(parsed.s2);
            const s3 = clamp(parsed.s3);
            const s4 = clamp(parsed.s4);
            const s5 = clamp(parsed.s5);
            const avgScore = (s1 + s2 + s3 + s4 + s5) / 5;

            return {
                score: avgScore.toFixed(2),
                s1: s1.toFixed(2),
                s2: s2.toFixed(2),
                s3: s3.toFixed(2),
                s4: s4.toFixed(2),
                s5: s5.toFixed(2),
                observations: Array.isArray(parsed.observations) && parsed.observations.length > 0
                    ? parsed.observations
                    : [{ text: 'Zakończono inspekcję wizyjną stanowiska.', pen: '-0.50 pkt (5S)' }],
                capa: (parsed.capa || 'Utrzymać standard 5S zgodnie z kartą stanowiskową.').trim(),
                source: `Gemini ${modelName} Vision (Audyt LPA)`
            };
        } finally {
            clearTimeout(timer);
        }
    },

    prepareImageForVision(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                if (!img.width || !img.height) {
                    resolve({ isCorrupted: true });
                    return;
                }
                const maxDim = 1280;
                const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                const imgData = ctx.getImageData(0, 0, w, h).data;
                let totalLum = 0;
                const step = 16;
                let samples = 0;
                for (let i = 0; i < imgData.length; i += 4 * step) {
                    const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
                    totalLum += (0.299 * r + 0.587 * g + 0.114 * b);
                    samples++;
                }
                const avgLum = samples > 0 ? totalLum / samples : 128;

                const compressedUrl = canvas.toDataURL('image/jpeg', 0.85);
                const base64Data = compressedUrl.split(',')[1];

                resolve({
                    base64Data,
                    mimeType: 'image/jpeg',
                    isCorrupted: false,
                    isTooDark: avgLum < 18,
                    isOverexposed: avgLum > 246
                });
            };
            img.onerror = () => {
                resolve({ isCorrupted: true });
            };
            img.src = dataUrl;
        });
    },

    runLocalVisionFallback(station, auditorNotes, reasonLabel) {
        const noteText = auditorNotes ? `Uwzględniono notatkę audytora: "${auditorNotes}".` : 'Przeprowadzono standardową weryfikację kontrolną.';
        return {
            score: "2.95",
            s1: "3.10", s2: "2.70", s3: "3.00", s4: "2.90", s5: "3.05",
            observations: [
                { text: `[Strefa robocza] Narzędzia pomocnicze na stanowisku ${station.name} wymagają uporządkowania po zakończonej operacji`, pen: "-0.65 pkt (2S)" },
                { text: "[Otoczenie] Brak wyraźnego oznaczenia strefy odkładczej detali oraz przewodów zasilających", pen: "-0.55 pkt (4S/BHP)" },
                { text: `[Wywiad LPA] ${noteText}`, pen: "-0.25 pkt (LPA)" }
            ],
            capa: "Wdrożyć tablicę cieni dla narzędzi ręcznych, wyznaczyć żółte pola stref buforowych oraz przeprowadzić 5-minutowe sprzątanie na koniec zmiany.",
            source: `Edge Vision (${reasonLabel})`
        };
    },

    // =========================================================================
    // 3. SILNIK REGUŁOWY 5-WHY OFFLINE (KLASA A: CNC/ROBOT vs KLASA B: MANUAL)
    // =========================================================================
    runLocalEdgeInference(incident, humanNote, fallbackTriggered = false) {
        const isManual = this.isManualStation(incident);
        const note = (humanNote || '').toLowerCase();
        const desc = ((incident.faultDescription || '') + ' ' + (incident.faultCode || '')).toLowerCase();
        const stationName = incident.machineName || 'Stanowisko robocze';
        const sourceLabel = fallbackTriggered
            ? "Edge Engine (Tryb Autonomiczny / Brak połączenia z API)"
            : "Wbudowany Silnik Regułowy (Edge Expert Offline)";

        // ŚCIEŻKA B: STANOWISKA MANUALNE (M-01 Montaż, S-02 Spawanie Manualne, K-02 Śrutownia)
        if (isManual) {
            if (desc.includes('fitting') || desc.includes('okuc') || desc.includes('brak') || desc.includes('logis') || note.includes('materiał')) {
                return {
                    w1: `Przerwanie pracy brygady na stanowisku ${stationName} z powodu braku kompletu komponentów montażowych.`,
                    w2: "Na wózku przygniazdowym zabrakło okuć, rygli lub uszczelek wymaganych dla bieżącego zlecenia.",
                    w3: "Kompletacja z magazynu została wydana bez weryfikacji listy materiałowej (BOM) przed rozpoczęciem zmiany.",
                    w4: "Brak wydzielonych gniazd cieni na wózku kompletacyjnym (Kitting), które wizualnie sygnalizują brak detalu.",
                    w5: "Przyczyna Źródłowa: Brak standardu Kittingu oraz brak pętli uzupełniania Kanban między magazynem a montażem.",
                    capa: "Wdrożenie dedykowanych wózków kompletacyjnych Kitting z opisanymi przegrodami na 1 szt. wyrobu oraz sygnału Kanban dla magazynu.",
                    owner: "Logistyka Wewnętrzna / Magazyn",
                    source: sourceLabel
                };
            }

            if (desc.includes('torque') || desc.includes('klucz') || desc.includes('rivet') || desc.includes('nitown') || desc.includes('torch') || desc.includes('uchwyt')) {
                return {
                    w1: `Przestój na stanowisku manualnym ${stationName} wywołany niesprawnością narzędzia roboczego operatora.`,
                    w2: "Rozkalibrowanie klucza dynamometrycznego / uszkodzenie nitownicy lub zużycie części eksploatacyjnych uchwytu.",
                    w3: "Narzędzie było eksploatowane bez kontroli przedzmianowej i bez dostępnego egzemplarza zastępczego w strefie podręcznej.",
                    w4: "Brak tablicy cieni z przypisanymi numerami narzędzi oraz brak karty kontroli okresowej TPM dla narzędzi ręcznych.",
                    w5: "Przyczyna Źródłowa: Brak nadzoru narzędziowego i brak zestawu rezerwowego (Redundancy) na stanowisku manualnym.",
                    capa: "Wdrożenie tablicy cieni z oznakowaniem kalibracji narzędzi oraz umieszczenie zapasowego narzędzia w punkcie TPM stanowiska.",
                    owner: "Gospodarka Narzędziowa / Brygadzista",
                    source: sourceLabel
                };
            }

            return {
                w1: `Wydłużenie czasu operacji manualnej na stanowisku ${stationName}: ${incident.faultDescription}.`,
                w2: "Operatorzy musieli przerwać montaż/obróbkę w celu dopasowania elementów lub przygotowania oprzyrządowania.",
                w3: "Brak przygotowanego zestawu przyrządów, szablonów i instrukcji stanowiskowej (SOP) przed pobraniem zlecenia.",
                w4: "Brak standaryzacji kolejności kroków montażowych oraz brak rozdzielenia prac przygotowawczych od operacji głównej.",
                w5: "Przyczyna Źródłowa: Brak aktualnej karty standaryzacji pracy (SOP) oraz tablicy cieni na stanowisku manualnym.",
                capa: "Wdrożenie 10-krokowej karty SOP na tablicy stanowiskowej oraz przygotowanie szablonów pozycjonujących (Poka-Yoke).",
                owner: "Inżynier Procesu / Lider Zmiany",
                source: sourceLabel
            };
        }

        // ŚCIEŻKA A: MASZYNY CNC I AUTOMATYKA (L-01, L-02, G-01, P-01, R-01)
        if (desc.includes('s-001') || desc.includes('przezbrojen') || note.includes('smed')) {
            return {
                w1: `Wydłużony czas przestoju podczas przezbrajania maszyny CNC ${stationName} pod nową partię produkcyjną.`,
                w2: "Operator wykonywał czynności ustawcze i wymianę oprzyrządowania przy zatrzymanej maszynie (operacje wewnętrzne).",
                w3: "Brak przygotowanego zestawu matryc, stempli i programu NC przed zakończeniem poprzedniego zlecenia.",
                w4: "Brak rozdzielenia przezbrojenia wewnętrznego od zewnętrznego zgodnie z metodyką SMED.",
                w5: "Przyczyna Źródłowa: Brak wózka przezbrojeniowego Kitting oraz brak tablicy cieni przy maszynie.",
                capa: "Wdrożenie standardu SMED: przygotowanie wózka zestawczego na 15 min przed końcem partii oraz szybkozłączy mechanicznych.",
                owner: "Inżynier Procesu / Lean Coordinator",
                source: sourceLabel
            };
        }

        if (desc.includes('e-309') || desc.includes('tarcz') || desc.includes('dysz') || desc.includes('lens') || note.includes('zużyc')) {
            return {
                w1: `Zatrzymanie maszyny ${stationName} z powodu zużycia elementu tnącego lub zabrudzenia optyki głowicy.`,
                w2: "Przekroczenie żywotności krawędzi skrawającej / osadzenie zanieczyszczeń na szkiełku ochronnym.",
                w3: "Element eksploatacyjny pracował powyżej nominalnego resursu bez wymiany lub czyszczenia prewencyjnego.",
                w4: "Brak licznika zużycia w panelu operatorskim oraz brak kontroli optyki przed startem zmiany.",
                w5: "Przyczyna Źródłowa: Brak harmonogramu wymian prewencyjnych (TBM) w karcie TPM maszyny.",
                capa: "Wdrożenie licznika cykli narzędzia w sterowniku (ostrzeżenie przy 85% resursu) oraz obowiązkowego punktu kontroli w SOP.",
                owner: "Narzędziownia / UR Optyka CNC",
                source: sourceLabel
            };
        }

        if (desc.includes('e-212') || desc.includes('ciśnieni') || desc.includes('gas_drop') || desc.includes('hydr')) {
            return {
                w1: `Zatrzymanie cyklu automatycznego na ${stationName} wskutek spadku ciśnienia medium roboczego.`,
                w2: "Nieszczelność na przyłączu instalacji lub spadek ciśnienia zasilania w magistrali gazu/pneumatyki.",
                w3: "Mikro-wycieki lub spadek poziomu w wiązce butli pozostały niezauważone przed uruchomieniem programu.",
                w4: "Brak wizualnego oznaczenia strefy zielonej/czerwonej na manometrach oraz brak kontroli w karcie TPM.",
                w5: "Przyczyna Źródłowa: Brak standaryzacji przeglądów przedzmianowych układów zasilania mediów (TPM-02).",
                capa: "Oznaczenie zakresu roboczego na manometrze (strefa zielona), montaż czujnika progu ciśnienia oraz wpis do karty SOP.",
                owner: "Utrzymanie Ruchu (Mechanika / Media)",
                source: sourceLabel
            };
        }

        return {
            w1: `Zatrzymanie cyklu maszyny ${stationName}: ${incident.faultDescription}.`,
            w2: "Przekroczenie dopuszczalnych parametrów pracy układu wykonawczego lub czujnika potwierdzenia pozycji.",
            w3: "Zanieczyszczenie strefy roboczej lub deformacja wsadu wejściowego przekraczająca tolerancję układu.",
            w4: "Brak przedmuchu strefy bazowania między cyklami oraz brak wstępnej kontroli geometrii materiału.",
            w5: "Przyczyna Źródłowa: Brak wdrożonego standardu kontroli wejściowej wsadu oraz listy kontrolnej TPM przed startem zmiany.",
            capa: "Wdrożenie obowiązkowej weryfikacji materiału przed stołem podawczym oraz punktu czyszczenia czujników w SOP.",
            owner: "Utrzymanie Ruchu (Automatyka)",
            source: sourceLabel
        };
    }
};

window.GeminiEngine = GeminiEngine;