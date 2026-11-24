/**
 * Proton Lean OS - Silnik Wnioskowania AI Multi-Model Failover (v4.8)
 * - Kaskada oparta na empirycznie zweryfikowanych węzłach HTTP 200 OK:
 *   gemini-3.5-flash-lite -> gemini-3-flash-preview -> gemini-3.5-flash -> gemini-3.8-flash
 * - Lekkie zapytania bez narzutu kompilatora responseSchema (czysty parser JSON + Poka-Yoke)
 * - Zabezpieczenie URL przed konwersją Markdown
 * - Pełny deterministyczny silnik awaryjny Edge Offline (reguły TPM / SMED / BHP)
 */

const STORAGE_KEY_GEMINI = 'proton_gemini_api_key';

const MODEL_CASCADE_5WHY = [
    { name: 'gemini-3.5-flash-lite', timeoutMs: 12000 },
    { name: 'gemini-3-flash-preview', timeoutMs: 14000 },
    { name: 'gemini-3.5-flash', timeoutMs: 14000 },
    { name: 'gemini-3.8-flash', timeoutMs: 15000 }
];

const MODEL_CASCADE_VISION = [
    { name: 'gemini-3-flash-preview', timeoutMs: 18000 },
    { name: 'gemini-3.5-flash', timeoutMs: 18000 },
    { name: 'gemini-3.5-flash-lite', timeoutMs: 18000 },
    { name: 'gemini-3.8-flash', timeoutMs: 20000 }
];

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

    // =========================================================================
    // 1. ANALIZA PRZYCZYNOWA 5-WHY (gemini-3.5-flash-lite + Kaskada Failover)
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
            faultDescription: String(inc.faultDescription || 'Nieokreślone zatrzymanie cyklu maszyny').trim().slice(0, 300),
            durationMin: Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(1440, Math.round(rawDuration)) : 1,
            shiftId: inc.shiftId || 1,
            shiftName: String(inc.shiftName || `Zmiana ${inc.shiftId || 1}`).trim()
        };
    },

    async fetchGemini5Why(modelName, timeoutMs, incident, humanNote) {
        const apiKey = this.getApiKey();
        const url = `${this.getEndpoint(modelName)}?key=${encodeURIComponent(apiKey)}`;

        const prompt = `Jesteś Głównym Inżynierem Lean Manufacturing i Audytorem IATF 16949 w zakładzie konstrukcji stalowych.
Przeprowadź rygorystyczną analizę przyczyn źródłowych metodą 5-Why dla poniższego przestoju produkcyjnego.

DANE ZDARZENIA:
- Maszyna: ${incident.machineName} (${incident.machineId})
- Kod błędu: ${incident.faultCode}
- Opis przestoju: ${incident.faultDescription}
- Czas straty: ${incident.durationMin} minut (${incident.durationMin <= 5 ? 'mikroprzestój' : 'przestój istotny'})
- Zmiana robocza: ${incident.shiftName}
- Obserwacja operatora/lidera z Gemba: "${humanNote || 'Brak dodatkowych uwag'}"

WYMAGANIA:
1. Każde kolejne "Dlaczego" (w1 -> w5) musi wynikać logicznie z poprzedniego i schodzić od objawu mechanicznego/procesowego do systemowej przyczyny źródłowej (brak standardu, brak Poka-Yoke, luka w TPM/SMED).
2. Działanie korygujące (capa) musi być konkretne, techniczne i nie może naruszać zasad BHP (zakaz omijania czujników i kurtyn).
3. Zwróć WYŁĄCZNIE surowy obiekt JSON (bez tekstu przed ani po, bez znaczników markdown) o dokładnie tych kluczach:
{
  "w1": "1. Dlaczego (objaw bezpośredni)",
  "w2": "2. Dlaczego (przyczyna fizyczna)",
  "w3": "3. Dlaczego (stan pośredni)",
  "w4": "4. Dlaczego (luka procesowa)",
  "w5": "Przyczyna Źródłowa: ...",
  "capa": "Konkretne działanie techniczne / Poka-Yoke",
  "owner": "Dział odpowiedzialny (np. Utrzymanie Ruchu / Technologia / Logistyka)"
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
                    generationConfig: {
                        temperature: 0.25
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
    // 2. AUDYT WIZYJNY 5S VISION (gemini-3-flash-preview + Kaskada + Poka-Yoke)
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

        const prompt = `Jesteś bezwzględnym, skrupulatnym Audytorem Wiodącym Lean Manufacturing / 5S oraz Inspektorem BHP na hali produkcyjnej i w warsztacie przemysłowym.
Twoim zadaniem jest przeprowadzenie głębokiej inspekcji wizyjnej przesłanego zdjęcia stanowiska: "${station.name}" (Kod: ${station.code}, Obszar: ${station.area}).
Wytyczne z obchodu LPA: "${auditorNotes || 'Standardowy audyt 5S + BHP'}".

METODYKA SKANOWANIA OBRAZU (PRZESZUKAJ KAŻDY KWADRANT KADRU):
1. [1S - Selekcja / Sort]: Szukaj zbędnych przedmiotów na stołach, posadzce, parapetach i szafkach (puste butelki, kartony, resztki materiału, nieużywane przyrządy, prywatne rzeczy, śmieci).
2. [2S - Systematyka / Set in Order]: Szukaj narzędzi leżących luzem poza tablicą cieni, nieodłożonych kluczy/wkrętaków/szlifierek, brakujących etykiet, niezabezpieczonych skrzynek, plątaniny przewodów elektrycznych/pneumatycznych na podłodze lub krawędzi stołu.
3. [3S - Sprzątanie / Shine]: Szukaj wiórów metalowych, pyłu, rozlanego oleju/chłodziwa, zacieków, brudnych blatów roboczych, przepełnionych koszy na odpady.
4. [4S - Standaryzacja / Standardize]: Sprawdź czy istnieją wyznaczone strefy odkładcze (żółte/białe linie na posadzce i stołach), czy tablice cieni mają kontury narzędzi, czy instrukcje SOP/BHP są czytelne i zalaminowane.
5. [5S - Samodyscyplina & BHP / Sustain]: Sprawdź zagrożenia potknięciem (kable na przejściu), zastawione drogi ewakuacyjne/gaśnice, brakujące osłony, niezamknięte szafki elektryczne, nieergonomiczne składowanie ciężkich detali.

ZASADY OCENIANIA (SKALA 1.00 - 5.00):
- Bądź surowy i realistyczny. Idealna ocena 4.50–5.00 przysługuje WYŁĄCZNIE sterylnym stanowiskom wzorcowym z tablicami cieni i wyznaczonymi liniami.
- Jeśli widzisz leżące luzem narzędzia, bałagan na stole, plątaninę kabli lub brak oznaczeń stref, obniż odpowiednio punktację (typowy nieuporządkowany warsztat to 2.00 – 3.20 pkt).
- W tablicy "observations" wymień 3 do 5 KONKRETNYCH rzeczy, które faktycznie widzisz na tym zdjęciu (wskaż dokładne miejsce na obrazie, np. "Po lewej stronie stołu leży luzem klucz...", "Na podłodze pod regałem zalegają...").
- Jeśli widzisz pozytywny element (np. czysta posadzka, opisane pojemniki), dodaj go z prefiksem "+ Wzorcowo" w polu "pen". Dla niezgodności wpisz ujemną karę punktową (np. "-0.65 pkt (2S)" lub "-0.90 pkt (BHP/3S)").

Zwróć WYŁĄCZNIE surowy obiekt JSON (bez znaczników markdown) o dokładnie tych kluczach:
{
  "s1": 2.5,
  "s2": 2.0,
  "s3": 2.8,
  "s4": 2.2,
  "s5": 3.0,
  "observations": [
    { "text": "Konkretna obserwacja na zdjęciu...", "pen": "-0.70 pkt (2S)" }
  ],
  "capa": "Konkretne działanie naprawcze 5S / BHP"
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
                        temperature: 0.2
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
                capa: (parsed.capa || 'Uporządkować stanowisko zgodnie ze standardem 5S.').trim(),
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
            score: "2.85",
            s1: "3.00", s2: "2.50", s3: "2.90", s4: "2.85", s5: "3.00",
            observations: [
                { text: `Narzędzia pomocnicze na stanowisku ${station.name} nieodłożone na wyznaczone miejsca po zakończonej operacji`, pen: "-0.75 pkt (2S)" },
                { text: "Brak wyraźnego oznaczenia strefy odkładczej detali oraz przewodów zasilających na blacie", pen: "-0.65 pkt (4S/BHP)" },
                { text: noteText, pen: "-0.30 pkt (LPA)" }
            ],
            capa: "Wdrożyć tablicę cieni dla narzędzi ręcznych, wyznaczyć żółte pola stref buforowych oraz przeprowadzić 5-minutowe sprzątanie na koniec zmiany.",
            source: `Edge Vision (${reasonLabel})`
        };
    },

    // =========================================================================
    // 3. ROZBUDOWANY SILNIK REGUŁOWY 5-WHY OFFLINE (KONTEKSTOWY PER USTERKA)
    // =========================================================================
    runLocalEdgeInference(incident, humanNote, fallbackTriggered = false) {
        const note = (humanNote || '').toLowerCase();
        const desc = ((incident.faultDescription || '') + ' ' + (incident.faultCode || '')).toLowerCase();
        const machine = incident.machineName || 'Gniazdo robocze';

        let w1 = `Przestój na stanowisku ${machine}: ${incident.faultDescription || 'zatrzymanie cyklu'}.`;
        let w2 = "Przekroczenie dopuszczalnych parametrów pracy układu wykonawczego lub sterowania.";
        let w3 = "Brak automatycznej kompensacji lub wczesnego ostrzegania przed degradacją podzespołu.";
        let w4 = "Niewystarczająca częstotliwość kontroli prewencyjnej w ramach autonomicznego utrzymania ruchu (TPM).";
        let w5 = "Przyczyna Źródłowa: Brak wdrożonego standardu Poka-Yoke oraz listy kontrolnej przed uruchomieniem zmiany.";
        let capa = "Wdrożenie obowiązkowej karty kontroli TPM przed startem zmiany oraz doprecyzowanie progów alarmowych.";
        let owner = "Główny Technolog / Utrzymanie Ruchu";

        if (desc.includes('s-001') || desc.includes('przezbrojen') || note.includes('smed')) {
            w1 = `Wydłużony czas przestoju podczas przezbrajania stanowiska ${machine} pod nową partię produkcyjną.`;
            w2 = "Operator wykonywał czynności ustawcze i regulacyjne przy zatrzymanej maszynie (operacje wewnętrzne).";
            w3 = "Brak przygotowanego zestawu narzędzi, matryc i dokumentacji technologicznej przed zakończeniem poprzedniego zlecenia.";
            w4 = "Brak rozdzielenia przezbrojenia wewnętrznego od zewnętrznego zgodnie z metodyką SMED.";
            w5 = "Przyczyna Źródłowa: Brak wózka przezbrojeniowego Kitting oraz brak tablicy cieni przy gnieździe.";
            capa = "Wdrożenie standardu SMED: przygotowanie wózka zestawczego (kitting) na 15 min przed końcem partii oraz szybkozłączy mechanicznych.";
            owner = "Inżynier Procesu / Lean Coordinator";
        } else if (desc.includes('e-309') || desc.includes('tarcz') || desc.includes('dysz') || desc.includes('lens') || note.includes('zużyc')) {
            w1 = `Konieczność awaryjnego zatrzymania ${machine} z powodu utraty jakości cięcia / zużycia elementu optycznego lub tnącego.`;
            w2 = "Przekroczenie żywotności krawędzi skrawającej / zabrudzenie dolnego szkiełka ochronnego głowicy.";
            w3 = "Narzędzie pracowało powyżej nominalnego licznika cykli bez zaplanowanej wymiany lub czyszczenia prewencyjnego.";
            w4 = "Brak licznika zużycia narzędzi w panelu operatorskim oraz brak zapasu części eksploatacyjnych w strefie podręcznej.";
            w5 = "Przyczyna Źródłowa: Brak harmonogramu wymian prewencyjnych (TBM) powiązanego z metrażem cięcia.";
            capa = "Wdrożenie licznika cykli narzędzia w sterowniku (ostrzeżenie przy 85% resursu) oraz karty kontroli optyki przed startem zmiany.";
            owner = "Narzędziownia / Technologia";
        } else if (desc.includes('e-212') || desc.includes('ciśnieni') || desc.includes('podajnik') || note.includes('pneumat')) {
            w1 = `Zatrzymanie podawania materiału na ${machine} wskutek spadku ciśnienia w układzie roboczym.`;
            w2 = "Nieszczelność na szybkozłączu przewodów lub zabrudzenie wkładu filtra-reduktora na zespole przygotowania powietrza.";
            w3 = "Mikro-wycieki powietrza i spadek wydatku na magistrali pozostały niewykryte podczas obchodu.";
            w4 = "Brak wizualnego wskaźnika strefy zielonej/czerwonej na manometrze oraz brak kontroli szczelności w karcie TPM.";
            w5 = "Przyczyna Źródłowa: Brak standaryzacji przeglądów układów pneumatycznych i hydraulicznych (TPM-02).";
            capa = "Oznaczenie zakresu roboczego na manometrze (strefa zielona 6.0–6.5 bar), wymiana szybkozłączy na skręcane oraz dodanie punktu do karty TPM.";
            owner = "Utrzymanie Ruchu (Mechanika)";
        } else if (desc.includes('e-104') || desc.includes('zator') || desc.includes('urobk') || desc.includes('blm_jam')) {
            w1 = `Zablokowanie ciągłego przepływu na ${machine} z powodu przepełnienia stołu odbiorczego urobku.`;
            w2 = "Brak wolnych pojemników transportowych lub nieodebrane gotowe detale przez transport wewnętrzny (Milk-Run).";
            w3 = "Operator musiał opuścić stanowisko w celu poszukiwania pustych palet i ręcznego rozładunku.";
            w4 = "Brak sygnału wizualnego (Kanban / Andon) wzywającego logistykę przy zapełnieniu bufora w 75%.";
            w5 = "Przyczyna Źródłowa: Brak wyznaczonych pól odkładczych FIFO oraz brak zsynchronizowanej pętli logistycznej (Milk-Run).";
            capa = "Wyznaczenie żółtych pól buforowych FIFO przy gnieździe oraz wdrożenie sygnału Kanban dla wózka widłowego przy poziomie 75% bufora.";
            owner = "Logistyka Wewnętrzna / Magazyn";
        } else if (desc.includes('m-019') || desc.includes('czujnik') || desc.includes('bazowan') || desc.includes('sheet_coll')) {
            w1 = `Błąd potwierdzenia pozycji detalu / kolizja z wypaczonym arkuszem na stanowisku ${machine}.`;
            w2 = "Zabrudzenie czoła czujnika lub deformacja materiału wejściowego przekraczająca prześwit głowicy.";
            w3 = "Brak wstępnej weryfikacji płaskości arkusza i przedmuchu strefy bazowania między cyklami.";
            w4 = "Brak osłony mechanicznej oraz brak standardu kontroli geometrii wsadu przed załadunkiem.";
            w5 = "Przyczyna Źródłowa: Brak procedury kontroli wejściowej arkuszy oraz zabezpieczenia strefy bazowania (Poka-Yoke).";
            capa = "Wdrożenie szablonu kontroli płaskości arkuszy przed stołem podawczym oraz automatycznego przedmuchu baz.";
            owner = "Utrzymanie Ruchu (Automatyka)";
        }

        return {
            w1, w2, w3, w4, w5, capa, owner,
            source: fallbackTriggered ? "Edge Engine (Tryb Autonomiczny / Brak połączenia z API)" : "Wbudowany Silnik Regułowy (Edge Expert Offline)"
        };
    }
};

window.GeminiEngine = GeminiEngine;