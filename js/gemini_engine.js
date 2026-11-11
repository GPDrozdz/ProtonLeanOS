/**
 * Proton Lean OS - Gemini Causal & Vision Engine (v3.9 Production Hardened & Strict Lean)
 * Model bazowy: gemini-3.8-flash (Google AI Studio REST API)
 * Wdrożone usprawnienia inżynierskie:
 * - Bezwzględny profil audytora Lean/IATF 16949 (surowa skala ocen)
 * - Matematyczny Poka-Yoke ocen (normalizacja stringów i rekalkulacja średniej)
 * - Network Hard Timeout (AbortController na 9 sekund)
 * - Pre-flight Check oświetlenia kadru (histogram jasności w Canvas)
 * - Telemetria zużycia tokenów i opóźnienia sieciowego (Latency & OPEX)
 */

const STORAGE_KEY_GEMINI = 'proton_gemini_api_key';
const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Konfiguracja limitów sieciowych silnika
const ENGINE_NETWORK_TIMEOUT_MS = 9000; // 9 sekund na odpowiedź chmury
const MIN_IMAGE_BRIGHTNESS_THRESHOLD = 20; // Minimalna średnia jasność RGB (0-255)

const GeminiEngine = {
    getApiKey() {
        return localStorage.getItem(STORAGE_KEY_GEMINI) || '';
    },

    setApiKey(key) {
        if (key && key.trim()) {
            localStorage.setItem(STORAGE_KEY_GEMINI, key.trim());
        } else {
            localStorage.removeItem(STORAGE_KEY_GEMINI);
        }
    },

    hasActiveApiKey() {
        const k = this.getApiKey();
        return Boolean(k && k.length > 20);
    },

    // Pomocnik: Bezpieczny fetch z sztywnym limitem czasu (AbortController)
    async fetchWithTimeout(url, options, timeoutMs = ENGINE_NETWORK_TIMEOUT_MS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`Przekroczono limit czasu odpowiedzi API (${timeoutMs / 1000}s).`);
            }
            throw err;
        }
    },

    // =========================================================================
    // 1. WNIOSKOWANIE PRZYCZYNOWE 5-WHY (SZTAB KRYZYSOWY CAPA)
    // =========================================================================
    async analyzeIncident(incidentContext, humanNote) {
        const isOnlineReady = this.hasActiveApiKey() && navigator.onLine;

        if (isOnlineReady) {
            try {
                return await this.fetchGeminiCloudAnalysis(incidentContext, humanNote);
            } catch (err) {
                console.warn('[GeminiEngine] Błąd zapytania 5-Why do chmury. Przełączenie na Edge Fallback:', err.message);
                return this.runLocalEdgeInference(incidentContext, humanNote, true);
            }
        } else {
            return this.runLocalEdgeInference(incidentContext, humanNote, false);
        }
    },

    async fetchGeminiCloudAnalysis(incident, humanNote) {
        const startTime = performance.now();
        const apiKey = this.getApiKey();
        const url = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;

        const promptText = `Jesteś bezkompromisowym doradcą inżynierskim, audytorem Lean i kierownikiem Utrzymania Ruchu w fabryce konstrukcji stalowych.
Przeanalizuj usterkę:
Maszyna: ${incident.machineName || 'Gniazdo robocze'} (${incident.stationCode || 'G-01'})
Kod błędu: ${incident.faultCode || 'AWARIA'} - ${incident.faultDescription || 'Przestój'}
Czas trwania: ${incident.durationMin || 30} min (Koszt: ${incident.costTotalPLN || 0} PLN)
Notatka inżynierska z Gemba: "${humanNote || 'Brak dodatkowych uwag'}"

Wymagania:
Zwróć obiekt JSON z dokładnie takimi kluczami:
{
  "w1": "Dlaczego 1: bezpośredni skutek fizyczny / zadziałanie zabezpieczenia",
  "w2": "Dlaczego 2: przyczyna mechaniczna, elektryczna lub termiczna",
  "w3": "Dlaczego 3: powód wystąpienia stanu pośredniego",
  "w4": "Dlaczego 4: brak kontroli w procesie lub błąd przygotowania produkcji",
  "w5": "Dlaczego 5 (Root Cause): pierwotna przyczyna systemowa (SOP / CAM / TPM / Jakość dostaw)",
  "capa": "Konkretne techniczne działanie zapobiegawcze (Poka-Yoke / Standaryzacja)",
  "owner": "Dział odpowiedzialny (UR / Technologia / Jakość)"
}`;

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.15,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Google API HTTP ${response.status}: ${err}`);
        }

        const data = await response.json();
        const latencyMs = Math.round(performance.now() - startTime);
        const tokensUsed = data.usageMetadata ? data.usageMetadata.totalTokenCount : 'N/A';

        let rawText = data.candidates[0].content.parts[0].text.trim();
        rawText = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

        const parsed = JSON.parse(rawText);
        parsed.source = `Gemini ${GEMINI_MODEL} Live (${latencyMs}ms | ${tokensUsed} tok)`;
        return parsed;
    },

    // =========================================================================
    // 2. MODUŁ 5S VISION (RYGORYSTYCZNY AUDYT MULTIMODALNY + POKA-YOKE)
    // =========================================================================
    async analyzeVisual5S(imageBase64, stationMeta, auditorNotes) {
        const isOnlineReady = this.hasActiveApiKey() && navigator.onLine && Boolean(imageBase64);

        if (!isOnlineReady) {
            console.log('[5S Vision] Tryb Edge Offline / brak załączonego zdjęcia.');
            return this.generateDeterministicVisionReport(stationMeta, auditorNotes);
        }

        try {
            const startTime = performance.now();

            // Krok A: Skalowanie, kompresja i weryfikacja oświetlenia (Pre-flight Check)
            const { compressedBase64, avgBrightness } = await this.processAndValidateImage(imageBase64);

            if (avgBrightness < MIN_IMAGE_BRIGHTNESS_THRESHOLD) {
                console.warn('[5S Vision] Wykryto niedoświetlony kadr. Zgłoszenie uchybienia oświetlenia.');
                return {
                    score: "1.80",
                    s1: "2.00", s2: "2.00", s3: "1.50", s4: "1.50", s5: "2.00",
                    observations: [
                        { text: `Kadr skrajnie niedoświetlony (jasność matrycy: ${Math.round(avgBrightness)}/255). Uniemożliwia pełną weryfikację.`, pen: "-1.50 pkt (BHP/3S)" },
                        { text: "Brak normatywnego oświetlenia stanowiskowego nad strefą roboczą", pen: "-1.00 pkt (4S)" }
                    ],
                    capa: "Wymiana oprawy oświetleniowej na LED 500 lux w strefie roboczej oraz powtórzenie inspekcji.",
                    source: "Pre-flight Check (Błąd ekspozycji kadru)"
                };
            }

            // Krok B: Zapytanie do modelu w chmurze
            const apiKey = this.getApiKey();
            const url = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;

            const promptText = `Jesteś bezwzględnym, surowym Głównym Audytorem Lean Manufacturing i IATF 16949 w fabryce konstrukcji stalowych.
Twoim zadaniem jest bezkompromisowa eliminacja marnotrawstwa (Muda), zagrożeń BHP i niestabilności procesu.
NIE BĄDŹ ŁAGODNY. Oceniaj krytycznie i rygorystycznie.

Przeanalizuj przesłane zdjęcie stanowiska: "${stationMeta.name}" (Kod: ${stationMeta.code}).
Wytyczne inżyniera z Gemba: "${auditorNotes || 'Brak uwag - pełny rygor audytorski'}".

ZASADY PUNKTACJI (Skala 1.00 - 5.00):
- 1.00 - 2.20: Stan krytyczny, bałagan, zagrożenie wypadkiem, narzędzia porozrzucane, brak wyznaczonych stref.
- 2.21 - 3.20: Przeciętny warsztat z licznymi odchyleniami od standardu (brak standaryzacji, brud, wióry, plątanina kabli).
- 3.21 - 4.10: Stan akceptowalny, drobne uchybienia, wyznaczone strefy, widoczny TPM.
- 4.11 - 5.00: Wzorzec światowej klasy (World Class 5S), pełne tablice cieni, idealny porządek, zero zbędnych przedmiotów.

KRYTERIA OCENY FILARÓW:
- 1S (Sortowanie): Czy na stole/wokół maszyny leżą przedmioty niepotrzebne, złom, zbędne pudełka, podwójne narzędzia?
- 2S (Systematyka): Czy każde narzędzie ma swoje wyznaczone miejsce? Czy narzędzia leżą luzem na blatach lub korpusie maszyny?
- 3S (Sprzątanie/TPM): Czy widoczne są wióry metalowe, zacieki oleju, pył, brudne prowadnice?
- 4S (Standaryzacja): Czy są namalowane żółte linie pól buforowych, piktogramy BHP, etykiety, instrukcje stanowiskowe (SOP)?
- 5S (Samodyscyplina): Czy stanowisko wygląda na utrzymywane w reżimie dziennym, czy sprzątane "od święta"?

WYMAGANIA DOTYCZĄCE ODPOWIEDZI:
1. Wystaw surowe oceny cząstkowe s1-s5 (wartości numeryczne).
2. Jeśli na zdjęciu widać bałagan, ocena łączna MUSI być niska (< 3.00)!
3. Wskaż od 2 do 4 konkretnych, bezlitosnych obserwacji z karami punktowymi (np. "-0.80 pkt (2S) - klucze rzucone luzem na stole roboczym bez tablicy cieni").
4. Sformułuj konkretne, twarde inżynierskie zadanie CAPA (Poka-Yoke / wdrożenie standardu technicznego).

Zwróć obiekt JSON:
{
  "score": "2.45",
  "s1": "2.50",
  "s2": "2.10",
  "s3": "2.80",
  "s4": "2.30",
  "s5": "2.50",
  "observations": [
    { "text": "Klucz wiertarski i narzędzia skrawające leżą bezpośrednio na stole roboczym", "pen": "-0.90 pkt (2S)" },
    { "text": "Zalegające nieusunięte wióry stalowe w rowkach teowych stołu", "pen": "-0.70 pkt (3S)" },
    { "text": "Brak wyznaczonej strefy bufora wejściowego na detale", "pen": "-0.60 pkt (4S)" }
  ],
  "capa": "Wdrożenie tablicy cieni na narzędzia wiertarskie oraz instalacja pistoletu odciągu wiórów zintegrowanego z krańcówką osłony."
}`;

            const response = await this.fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: promptText },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: compressedBase64
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                        maxOutputTokens: 2048
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[5S Vision] Google API zwróciło błąd ${response.status}. Przełączanie na Edge Fallback.`, errText);
                return this.generateDeterministicVisionReport(stationMeta, auditorNotes, true);
            }

            const data = await response.json();
            const latencyMs = Math.round(performance.now() - startTime);
            const tokensUsed = data.usageMetadata ? data.usageMetadata.totalTokenCount : 'N/A';

            let rawText = data.candidates[0].content.parts[0].text.trim();
            rawText = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

            const parsed = JSON.parse(rawText);

            // Krok C: Matematyczny Poka-Yoke (Wymuszenie spójności ocen)
            const validatedReport = this.enforceMathematicalIntegrity(parsed);
            validatedReport.source = `Gemini Vision Live (${latencyMs}ms | ${tokensUsed} tok)`;

            return validatedReport;

        } catch (err) {
            console.warn('[5S Vision] Przechwycono błąd chmury lub timeout. Aktywacja bezpiecznego Edge Fallback:', err.message);
            return this.generateDeterministicVisionReport(stationMeta, auditorNotes, true);
        }
    },

    // Pomocnik: Matematyczny Poka-Yoke dla ocen 5S
    enforceMathematicalIntegrity(report) {
        const parseScore = (val) => {
            if (typeof val === 'number') return Math.max(1.0, Math.min(5.0, val));
            if (!val) return 2.50;
            const cleanStr = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
            const parsed = parseFloat(cleanStr);
            return isNaN(parsed) ? 2.50 : Math.max(1.0, Math.min(5.0, parsed));
        };

        const s1 = parseScore(report.s1);
        const s2 = parseScore(report.s2);
        const s3 = parseScore(report.s3);
        const s4 = parseScore(report.s4);
        const s5 = parseScore(report.s5);

        // Ścisła średnia arytmetyczna
        const calculatedScore = (s1 + s2 + s3 + s4 + s5) / 5;

        return {
            ...report,
            s1: s1.toFixed(2),
            s2: s2.toFixed(2),
            s3: s3.toFixed(2),
            s4: s4.toFixed(2),
            s5: s5.toFixed(2),
            score: calculatedScore.toFixed(2),
            observations: Array.isArray(report.observations) ? report.observations : [
                { text: "Wykryto niezgodności z procedurą operacyjną 5S", pen: "-0.50 pkt (4S)" }
            ],
            capa: report.capa || "Wdrożenie kart inspekcji autonomicznej 5S dla operatora gniazda."
        };
    },

    // Pomocnik: Kompresja w locie oraz Pre-flight Check jasności (Canvas)
    processAndValidateImage(base64Str) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1024;

                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Analiza histogramu jasności (RGB sample)
                let avgBrightness = 128;
                try {
                    const imgData = ctx.getImageData(0, 0, width, height);
                    const data = imgData.data;
                    let colorSum = 0;
                    const sampleStep = 8; // Próbkowanie co 8 piksel dla wydajności
                    let count = 0;

                    for (let i = 0; i < data.length; i += 4 * sampleStep) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        colorSum += (r * 0.299 + g * 0.587 + b * 0.114);
                        count++;
                    }
                    avgBrightness = colorSum / count;
                } catch (e) {
                    console.warn('[GeminiEngine] Analiza jasności pominięta:', e);
                }

                const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                const cleanBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
                resolve({ compressedBase64: cleanBase64, avgBrightness });
            };
            img.onerror = () => {
                resolve({
                    compressedBase64: base64Str.replace(/^data:image\/\w+;base64,/, ''),
                    avgBrightness: 128
                });
            };
            img.src = base64Str;
        });
    },

    // =========================================================================
    // 3. DETERMINISTYCZNY SILNIK REGULARNY (SUROWY EDGE EXPERT OFFLINE)
    // =========================================================================
    generateDeterministicVisionReport(stationMeta, auditorNotes, isFallback = false) {
        const note = (auditorNotes || '').toLowerCase();
        const stationName = (stationMeta.name || '').toLowerCase();

        let s1 = "2.80", s2 = "2.30", s3 = "2.90", s4 = "2.40", s5 = "2.60";
        let obs = [
            { text: "Brak wyznaczonego pola odkładczego - detale i złom wymieszane", pen: "-0.80 pkt (1S/2S)" },
            { text: "Przewody zasilające i pneumatyczne leżą luźno w strefie operatora", pen: "-0.70 pkt (BHP/4S)" },
            { text: "Zabrudzenia korpusu maszyny i brak aktualnej karty TPM", pen: "-0.60 pkt (3S/5S)" }
        ];
        let capa = "Wyznaczenie pól odkładczych żółtą taśmą 50 mm, montaż podwieszanego ramienia przewodów i wdrożenie karty TPM-01.";

        if (note.includes('wiertark') || stationName.includes('wiertark')) {
            s1 = "2.50"; s2 = "2.10"; s3 = "2.60"; s4 = "2.20"; s5 = "2.40";
            obs = [
                { text: "Wióry metalowe zalegają na stole i korpusie wiertarki", pen: "-0.90 pkt (3S)" },
                { text: "Klucz wiertarski oraz wiertła leżą luzem bez dedykowanej tablicy cieni", pen: "-0.85 pkt (2S)" },
                { text: "Brak wyznaczonej strefy bufora wejściowego na detale", pen: "-0.65 pkt (4S)" }
            ];
            capa = "Instalacja magnetycznej tablicy cieni na narzędzia, pędzla do wiórów na sprężynie oraz pojemnika kwarantanny braków.";
        } else if (note.includes('drut') || note.includes('uchwyt') || note.includes('palnik') || stationName.includes('spawa')) {
            s1 = "3.00"; s2 = "2.40"; s3 = "2.70"; s4 = "2.60"; s5 = "2.50";
            obs = [
                { text: "Uchwyt roboczy i przewody odłożone poza strefę bezpieczną", pen: "-0.80 pkt (2S)" },
                { text: "Odpryski spawalnicze zalegające w szczelinach stołu traserskiego", pen: "-0.65 pkt (3S)" },
                { text: "Pojemniki z drutem spawalniczym bez czytelnego atestu 3.1", pen: "-0.40 pkt (4S)" }
            ];
            capa = "Wdrożenie magnetycznego uchwytu szybkiego odkładania palnika i standaryzacja czyszczenia stołu po zmianie.";
        } else if (stationName.includes('laser')) {
            s1 = "2.60"; s2 = "2.70"; s3 = "3.10"; s4 = "2.50"; s5 = "2.60";
            obs = [
                { text: "Ażury i urobek po cięciu wystają poza obrys stołu wymiany palet", pen: "-0.85 pkt (1S/BHP)" },
                { text: "Brak oznaczenia kontenera na drobne odpady kwasowe", pen: "-0.60 pkt (4S)" }
            ];
            capa = "Odmalowanie żółtej strefy buforowej urobku i montaż dodatkowego kosza na odpady drobne.";
        }

        const rawReport = {
            s1, s2, s3, s4, s5,
            observations: obs,
            capa: capa
        };

        const validated = this.enforceMathematicalIntegrity(rawReport);
        validated.source = isFallback ? "Edge Vision (Autonomiczny Fallback po limicie API)" : "Wbudowany Silnik Regułowy (Edge Offline)";
        return validated;
    },

    runLocalEdgeInference(incident, humanNote, fallbackTriggered = false) {
        const note = (humanNote || '').toLowerCase();
        let w1 = "Zadziałał czujnik przeciążenia napędu lub obwód bezpieczeństwa gniazda.";
        let w2 = "Opory mechaniczne przekroczyły prąd progowy falownika posuwu.";
        let w3 = "Element obrabiany lub odpad wszedł w kolizję z elementami roboczymi maszyny.";
        let w4 = "Parametry tolerancji geometrycznej lub nestingu nie uwzględniły właściwości partii materiału.";
        let w5 = "Brak ustandaryzowanej procedury SOP weryfikacji naprężeń arkuszy oraz kontroli zużycia oprzyrządowania.";
        let capa = "Wdrożenie obowiązkowej karty kontroli parametrów w oprogramowaniu CAM oraz audyt TPM stołu roboczego.";
        let owner = "Główny Technolog / Utrzymanie Ruchu";

        if (note.includes('wiertark') || note.includes('reaguje') || note.includes('zasilan')) {
            w1 = "Brak reakcji układu napędowego wrzeciona na sygnał startu cyklu roboczego.";
            w2 = "Obwód sterowania 24V DC nie podaje sygnału zezwolenia na falownik główny.";
            w3 = "Zadziałał wyłącznik krańcowy osłony lub nastąpiło wybicie zabezpieczenia termicznego silnika.";
            w4 = "Operator pominął procedurę resetu obwodu E-STOP po poprzednim przezbrojeniu narzędzia.";
            w5 = "Przyczyna Źródłowa: Brak czytelnej sygnalizacji stanu blokad Poka-Yoke na pulpicie operatora.";
            capa = "Montaż diody LED stanu obwodu zezwolenia pracy oraz weryfikacja styków krańcówki osłony.";
            owner = "Utrzymanie Ruchu (Automatyka)";
        }

        return {
            w1, w2, w3, w4, w5, capa, owner,
            source: fallbackTriggered ? "Edge Engine (Fallback z powodu limitu chmury)" : "Wbudowany Silnik Regułowy (Edge Expert Offline)"
        };
    }
};

window.GeminiEngine = GeminiEngine;