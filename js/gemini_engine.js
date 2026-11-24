/**
 * Proton Lean OS - Silnik Wnioskowania AI Multi-Model Failover (v4.2)
 * - Kaskada modeli chmurowych: gemini-3.8-flash -> gemini-2.5-flash -> gemini-flash-latest
 * - Automatyczne przełączanie przy błędach HTTP 503 (High Demand) / 429 (Rate Limit)
 * - Zachowana obsługa kluczy AQ... oraz AIza...
 * - Pełny deterministyczny silnik awaryjny Edge Offline (Poka-Yoke + reguły TPM/SMED)
 */

const STORAGE_KEY_GEMINI = 'proton_gemini_api_key';

// Kaskada aktywnych modeli zweryfikowanych na Twoim koncie AI Studio
const MODEL_CASCADE_5WHY = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest'
];

const MODEL_CASCADE_VISION = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest'
];

const ENGINE_TIMEOUT_5WHY_MS = 18000;
const ENGINE_TIMEOUT_VISION_MS = 25000;

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
        return k.length > 20 && !k.startsWith('/*');
    },

    getEndpoint(modelName) {
        return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    },

    // =========================================================================
    // 1. ANALIZA PRZYCZYNOWA 5-WHY (Kaskada modeli + Edge Fallback)
    // =========================================================================
    async analyzeIncident(incident, humanNote = '') {
        if (!this.hasActiveApiKey()) {
            return this.runLocalEdgeInference(incident, humanNote, false);
        }

        let lastError = null;
        for (const modelName of MODEL_CASCADE_5WHY) {
            try {
                return await this.fetchGemini5Why(modelName, incident, humanNote);
            } catch (err) {
                lastError = err;
                console.warn(`[5-Why Failover] Model ${modelName} niedostępny (${err.message}) – próbuję kolejny węzeł...`);
            }
        }

        console.error('[5-Why Cloud Error - wszystkie węzły chmury zajęte, przełączam na Edge Fallback]:', lastError);
        return this.runLocalEdgeInference(incident, humanNote, true);
    },

    async fetchGemini5Why(modelName, incident, humanNote) {
        const apiKey = this.getApiKey();
        const url = `${this.getEndpoint(modelName)}?key=${encodeURIComponent(apiKey)}`;

        const prompt = `Jesteś Głównym Inżynierem Lean Manufacturing i Audytorem IATF 16949 w zakładzie konstrukcji stalowych.
Przeprowadź rygorystyczną analizę przyczyn źródłowych metodą 5-Why dla poniższego przestoju produkcyjnego.

DANE ZDARZENIA:
- Maszyna: ${incident.machineName} (${incident.machineId})
- Kod błędu: ${incident.faultCode || 'N/A'}
- Opis przestoju: ${incident.faultDescription}
- Czas straty: ${incident.durationMin} minut
- Zmiana robocza: ${incident.shiftName || 'Zmiana ' + incident.shiftId}
- Obserwacja operatora/lidera z Gemba: "${humanNote || 'Brak dodatkowych uwag'}"

WYMAGANIA:
1. Każde kolejne "Dlaczego" (w1 -> w5) musi wynikać logicznie z poprzedniego i schodzić od objawu mechanicznego/procesowego do systemowej przyczyny źródłowej (brak standardu, brak Poka-Yoke, luka w TPM/SMED).
2. Działanie korygujące (capa) musi być konkretne, techniczne i nie może naruszać zasad BHP (zakaz omijania czujników i kurtyn).
3. Zwróć WYŁĄCZNIE czysty obiekt JSON bez znaczników markdown.`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('Przekroczono limit czasu 18s')), ENGINE_TIMEOUT_5WHY_MS);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.25,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                w1: { type: "STRING" },
                                w2: { type: "STRING" },
                                w3: { type: "STRING" },
                                w4: { type: "STRING" },
                                w5: { type: "STRING" },
                                capa: { type: "STRING" },
                                owner: { type: "STRING" }
                            },
                            required: ["w1", "w2", "w3", "w4", "w5", "capa", "owner"]
                        }
                    }
                })
            });

            clearTimeout(timer);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Pusta odpowiedź z modelu Gemini 5-Why');

            const parsed = JSON.parse(rawText);
            return {
                ...parsed,
                source: `Gemini ${modelName} Live (Cloud AI)`
            };
        } finally {
            clearTimeout(timer);
        }
    },

    // =========================================================================
    // 2. AUDYT WIZYJNY 5S VISION (Kaskada modeli + Skan Siatkowy Niezgodności)
    // =========================================================================
    async analyzeVisual5S(imageBase64, station, auditorNotes = '') {
        if (!imageBase64) {
            return this.runLocalVisionFallback(station, auditorNotes, 'Brak zdjęcia – ocena na podstawie wywiadu LPA');
        }

        const prepared = await this.prepareImageForVision(imageBase64);
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

        if (!this.hasActiveApiKey()) {
            return this.runLocalVisionFallback(station, auditorNotes, 'Tryb Offline (Brak klucza API)');
        }

        let lastError = null;
        for (const modelName of MODEL_CASCADE_VISION) {
            try {
                return await this.fetchGeminiVision5S(modelName, prepared.base64Data, prepared.mimeType, station, auditorNotes);
            } catch (err) {
                lastError = err;
                console.warn(`[5S Vision Failover] Model ${modelName} niedostępny (${err.message}) – próbuję kolejny węzeł...`);
            }
        }

        console.error('[5S Vision Cloud Error - wszystkie węzły chmury zajęte, przełączam na Edge Fallback]:', lastError);
        return this.runLocalVisionFallback(station, auditorNotes, 'Edge Fallback (Przeciążenie serwerów API)');
    },

    async fetchGeminiVision5S(modelName, base64Data, mimeType, station, auditorNotes) {
        const apiKey = this.getApiKey();
        const url = `${this.getEndpoint(modelName)}?key=${encodeURIComponent(apiKey)}`;

        const prompt = `Jesteś bezwzględnym, skrupulatnym Audytorem Wiodącym Lean Manufacturing / 5S oraz Inspektorem BHP na hali produkcyjnej i w warsztacie przemysłowym.
Twoim zadaniem jest przeprowadzenie głębokiej inspekcji wizyjnej przesłanego zdjęcia stanowiska: "${station.name}" (Kod: ${station.code}, Obszar: ${station.area || 'Hala Produkcyjna'}).
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

Zwróć WYŁĄCZNIE czysty obiekt JSON zgodny ze schematem.`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('Przekroczono limit czasu 25s')), ENGINE_TIMEOUT_VISION_MS);

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
                        temperature: 0.2,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                s1: { type: "NUMBER" },
                                s2: { type: "NUMBER" },
                                s3: { type: "NUMBER" },
                                s4: { type: "NUMBER" },
                                s5: { type: "NUMBER" },
                                observations: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            text: { type: "STRING" },
                                            pen: { type: "STRING" }
                                        },
                                        required: ["text", "pen"]
                                    }
                                },
                                capa: { type: "STRING" }
                            },
                            required: ["s1", "s2", "s3", "s4", "s5", "observations", "capa"]
                        }
                    }
                })
            });

            clearTimeout(timer);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Pusta odpowiedź z modelu Gemini Vision');

            const parsed = JSON.parse(rawText);

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
                observations: parsed.observations || [],
                capa: parsed.capa || 'Uporządkować stanowisko zgodnie ze standardem 5S.',
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
                const maxDim = 1280;
                const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);

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
                    isTooDark: avgLum < 18
                });
            };
            img.onerror = () => {
                resolve({
                    base64Data: dataUrl.split(',')[1] || '',
                    mimeType: 'image/jpeg',
                    isTooDark: false
                });
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