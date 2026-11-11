/**
 * Proton Lean OS - Gemini Causal Inference Engine (v3.2 Production Ready)
 * Model bazowy: gemini-3.5-flash-lite (Google AI Studio 2026 API)
 * Pełna architektura Dual-Core: Chmura Google REST API + Edge Expert Offline Fallback.
 */

const STORAGE_KEY_GEMINI = 'proton_gemini_api_key';

// Identyfikator modelu z Twojego panelu Google AI Studio
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GeminiEngine = {
    // 1. Dyskretne zarządzanie kluczem API w localStorage
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

    // 2. Główny punkt wejścia wnioskowania przyczynowego
    async analyzeIncident(incidentContext, humanNote) {
        const isOnlineReady = this.hasActiveApiKey() && navigator.onLine;

        console.log(`[GeminiEngine] Uruchamianie analizy w trybie: ${isOnlineReady ? 'ONLINE (Gemini API Cloud)' : 'OFFLINE (Edge Expert Engine)'}`);

        if (isOnlineReady) {
            try {
                return await this.fetchGeminiCloudAnalysis(incidentContext, humanNote);
            } catch (err) {
                console.error('[GeminiEngine] Błąd połączenia z Gemini Cloud API. Płynne przełączenie na Edge Offline:', err);
                return this.runLocalEdgeInference(incidentContext, humanNote, true);
            }
        } else {
            return this.runLocalEdgeInference(incidentContext, humanNote, false);
        }
    },

    // 3. Wnioskowanie Chmurowe: Google Generative Language REST API
    async fetchGeminiCloudAnalysis(incident, humanNote) {
        const apiKey = this.getApiKey();
        const url = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;

        const promptText = `Jesteś bezkompromisowym doradcą inżynierskim, audytorem Lean i kierownikiem Utrzymania Ruchu w fabryce konstrukcji stalowych.
Przeanalizuj usterkę:
Maszyna: ${incident.machineName || 'Gniazdo robocze'} (${incident.stationCode || 'G-01'})
Kod błędu: ${incident.faultCode || 'AWARIA'} - ${incident.faultDescription || 'Przestój'}
Czas trwania: ${incident.durationMin || 30} min (Koszt: ${incident.costTotalPLN || 0} PLN)
Notatka inżynierska z Gemba: "${humanNote || 'Brak dodatkowych uwag'}"

Wymagania:
Zwróć WYŁĄCZNIE czysty obiekt JSON (bez znaczników markdown \`\`\`json) z dokładnie takimi kluczami:
{
  "w1": "Dlaczego 1: bezpośredni skutek fizyczny / zadziałanie zabezpieczenia",
  "w2": "Dlaczego 2: przyczyna mechaniczna, elektryczna lub termiczna",
  "w3": "Dlaczego 3: powód wystąpienia stanu pośredniego",
  "w4": "Dlaczego 4: brak kontroli w procesie lub błąd przygotowania produkcji",
  "w5": "Dlaczego 5 (Root Cause): pierwotna przyczyna systemowa (SOP / CAM / TPM / Jakość dostaw)",
  "capa": "Konkretne techniczne działanie zapobiegawcze (Poka-Yoke / Standaryzacja SOP)",
  "owner": "Dział odpowiedzialny (UR / Technologia / Jakość)"
}`;

        console.log('[GeminiEngine] Wysyłanie żądania POST do modelu:', GEMINI_MODEL);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: promptText }]
                }],
                generationConfig: {
                    temperature: 0.2
                }
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error('[GeminiEngine] Błąd API Google:', response.status, errorDetails);
            throw new Error(`Google API HTTP ${response.status}: ${errorDetails}`);
        }

        const data = await response.json();
        console.log('[GeminiEngine] Pomyślna odpowiedź z Gemini Cloud:', data);

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error("Pusta struktura odpowiedzi z API Google");
        }

        let rawText = data.candidates[0].content.parts[0].text.trim();
        // Oczyszczenie z ewentualnych znaczników markdown
        rawText = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

        const parsed = JSON.parse(rawText);
        parsed.source = `Gemini ${GEMINI_MODEL} Live`;
        return parsed;
    },

    // 4. Wbudowany Silnik Deterministyczny (Edge Expert Inference Engine dla Jurorów/Offline)
    runLocalEdgeInference(incident, humanNote, fallbackTriggered = false) {
        const note = (humanNote || '').toLowerCase();
        const fault = (incident.faultCode || '').toUpperCase();
        const mach = (incident.machineName || '').toLowerCase();

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
        } else if (note.includes('s355') || note.includes('hutnicz') || note.includes('napręż') || note.includes('falowan')) {
            w1 = "Czujnik wysokości głowicy zgłosił błąd odległości ogniskowej i zatrzymał posuw.";
            w2 = "Arkusz blachy po rozkroju uległ lokalnemu odkształceniu termicznemu i uniósł krawędź urobku.";
            w3 = "Naprężenia własne po walcowaniu hutniczym stali S355 zostały uwolnione podczas nagrzewania strefy cięcia.";
            w4 = "Strategia rozkroju w nestingach CAM nie zawierała sekwencji chłodzenia i cięcia naprzemiennego.";
            w5 = "Przyczyna Źródłowa: Brak wytycznych w SOP technologii dla arkuszy powyżej 6 mm z partii o podwyższonym wskaźniku anizotropii materiałowej.";
            capa = "Zmiana parametrów nestingu: wprowadzenie mikromostków 0.8 mm dla detali brzegowych oraz audyt atestów hutniczych 3.1.";
            owner = "Dział Technologii i Przygotowania Produkcji";
        } else if (note.includes('olej') || note.includes('ciśnieni') || note.includes('wyciek') || note.includes('chłodnic')) {
            w1 = "Presostat hydrauliczny zarejestrował spadek ciśnienia docisku poniżej dopuszczalnego progu roboczego.";
            w2 = "Wzrost temperatury medium roboczego powyżej 65°C spowodował spadek lepkości i uślizg zaworów proporcjonalnych.";
            w3 = "Chłodnica agregatu hydraulicznego została zablokowana przez pył szlifierski i opiłki metalu.";
            w4 = "Brak fizycznej osłony strefy chłodzenia przed pyłem z sąsiedniego gniazda obróbki ślusarskiej.";
            w5 = "Przyczyna Źródłowa: Pominięcie w harmonogramie TPM tygodniowej inspekcji filtrów lamelowych agregatu.";
            capa = "Zainstalowanie filtrów zmywalnych na wlocie chłodnicy oraz wdrożenie autonomicznego standardu czyszczenia 3S przez operatora.";
            owner = "Kierownik Utrzymania Ruchu (UR)";
        } else if (fault.includes('JAM') || fault.includes('BLM') || mach.includes('laser')) {
            w1 = "Zadziałał czujnik przeciążenia napędu stołu odbiorczego urobku osi Y.";
            w2 = "Ażur z blachy zakleszczył się pomiędzy rusztem paletowym a trawersą wygarniacza.";
            w3 = "Naroża wyciętych formatek opadły pod kątem z powodu braku punktów wiążących z resztką arkusza.";
            w4 = "Programista CAM usunął mikromostki, dążąc do ułatwienia ręcznego wybijania detali na palecie.";
            w5 = "Przyczyna Źródłowa: Brak kryterium sztywności ażuru w standardzie zatwierdzania programów CNC (SOP-CAM-04).";
            capa = "Standaryzacja matrycy mikromostków w oprogramowaniu CAM oraz odmalowanie pola buforowego na ażury złomowe.";
            owner = "Główny Technolog / Utrzymanie Ruchu";
        } else if (fault.includes('TUBE') || mach.includes('rur')) {
            w1 = "Wózek podajnika automatycznego nie osiągnął pozycji bazowej w zadanym oknie czasowym.";
            w2 = "Profil stalowy zablokował się w pryzmie kasety załadowczej podczas zrzutu wiązki.";
            w3 = "Odchyłka prostoliniowości profilu ze strefy magazynowej przekroczyła 2.5 mm na metrze bieżącym.";
            w4 = "Przyjęto partię profili ze spoiną wzdłużną bez weryfikacji skręcenia osiowego na kontroli dostaw.";
            w5 = "Przyczyna Źródłowa: Brak szablonu sprawdzianu przejezdności profilu przed załadunkiem do kasety podajnika.";
            capa = "Wdrożenie mechanicznego sprawdzianu Poka-Yoke na wejściu do podajnika oraz reklamacja partii hutniczej.";
            owner = "Kontrola Jakości Dostaw (IQC)";
        }

        return {
            w1, w2, w3, w4, w5, capa, owner,
            source: fallbackTriggered ? "Edge Engine (Fallback z powodu błędu chmury)" : "Wbudowany Silnik Regułowy (Edge Expert Offline)"
        };
    }
};

window.GeminiEngine = GeminiEngine;