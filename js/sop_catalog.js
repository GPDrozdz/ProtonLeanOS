/**
 * Proton Lean OS - Rejestr Kart Standaryzacji Pracy (SOP) v1.0
 * - 10 kompletnych instrukcji dla całego parku maszynowego (G-01 .. G-10)
 * - Każda instrukcja zawiera 10 kroków operacyjnych (BHP/ŚOI -> Uruchomienie -> Weryfikacja materiału -> Produkcja -> LOTO & 5S)
 * - Dedykowane miniatury infografik technicznych SVG + rozwijany akordeon szczegółów
 */

const SOP_LIBRARY = [
    {
        id: "SOP-001",
        stationCode: "L-01 / G-01",
        area: "CIĘCIE LASEROWE 2D",
        title: "Obsługa i Przygotowanie Lasera Płytowego BLM CNC",
        issueDate: "14.03.2026",
        revision: "Rev. 2.1",
        author: "Inż. Procesu / Technologia",
        approver: "Kierownik Produkcji PK1",
        ppe: ["Okulary ochronne OD6+ (1070 nm)", "Rękawice antyprzecięciowe kat. D", "Obuwie robocze S3"],
        hazards: "Promieniowanie laserowe klasy 4, ostre krawędzie arkuszy, ruchomy stół paletowy.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><path d="M32 14v18" stroke="#eab308" stroke-width="3" stroke-linecap="round"/><polygon points="27,32 37,32 32,40" fill="#fde047"/><line x1="32" y1="40" x2="32" y2="48" stroke="#f59e0b" stroke-width="2" stroke-dasharray="2 2"/><line x1="12" y1="48" x2="52" y2="48" stroke="#64748b" stroke-width="3"/></svg>`,
        steps: [
            "Załóż wymagane środki ochrony indywidualnej (okulary ochronne z filtrem, rękawice antyprzecięciowe, obuwie S3) i sprawdź drożność strefy wygrodzenia oraz kurtyn świetlnych.",
            "Wykonaj obchód wizualny maszyny: skontroluj stan rusztu stołu roboczego, brak spiętrzonego ażuru oraz czystość prowadnic osi X/Y.",
            "Załącz wyłącznik główny zasilania, uruchom agregat chłodniczy (chiller) i zweryfikuj temperaturę wody chłodzącej rezonator oraz głowicę.",
            "Otwórz zawór główny azotu/tlenu i potwierdź na manometrach ciśnienie robocze w strefie zielonej zgodnie z tabelą cięcia.",
            "Zdemontuj kasetę ochronną głowicy, skontroluj czystość dolnego szkiełka ochronnego oraz stan otworu dyszy tnącej; w razie przepalenia wymień dyszę i wykonaj kalibrację pojemnościową.",
            "Zweryfikuj rodzaj, gatunek (np. S235JR, S355J2, 1.4301) oraz grubość arkusza blachy załadowanego na paletę z kartą technologiczną zlecenia i wytopem.",
            "Wczytaj właściwy program NC (nesting) z serwera DNC, dopasuj bazę zerową arkusza i potwierdź dobór gazu oraz ogniskowej w sterowniku.",
            "Uruchom cięcie pierwszego detalu próbnego (FAI), sprawdź prostopadłość krawędzi, brak gradu oraz zmierz kluczowe wymiary suwmiarką.",
            "Po zatwierdzeniu detalu wzorcowego prowadź cykl automatyczny, kontrolując na bieżąco odciąg pyłów filtracyjnych oraz odbiór gotowych detali na palety FIFO.",
            "Po zakończeniu zmiany wyłącz rezonator i zasilanie główne, wyczyść strefę wokół stołu paletowego zgodnie ze standardem 5S i zdaj raport w terminalu MES."
        ]
    },
    {
        id: "SOP-002",
        stationCode: "L-02 / G-02",
        area: "CIĘCIE LASEROWE 3D",
        title: "Eksploatacja Lasera do Rur i Profili BLM Adige",
        issueDate: "19.03.2026",
        revision: "Rev. 1.8",
        author: "Inż. Procesu CNC",
        approver: "Główny Technolog",
        ppe: ["Okulary ochronne laserowe", "Rękawice antyprzecięciowe", "Ochronniki słuchu"],
        hazards: "Obracający się profil w uchwycie przelotowym, automatyczny podajnik wiązki, ostre wióry.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><rect x="10" y="28" width="44" height="10" rx="2" fill="none" stroke="#94a3b8" stroke-width="2.5"/><rect x="22" y="22" width="8" height="22" rx="1.5" fill="#eab308"/><line x1="42" y1="15" x2="42" y2="28" stroke="#fde047" stroke-width="2.5"/></svg>`,
        steps: [
            "Skontroluj strefę załadunku wiązki oraz stół odbiorczy pod kątem braku przeszkód i potwierdź sprawność przycisków E-STOP na pulpicie oraz obudowie.",
            "Sprawdź czystość rolek szczęk uchwytu obrotowego oraz suportów prowadzących – usuń ewentualny nagar i opiłki metaliczne.",
            "Uruchom zasilanie główne, układ hydrauliczny zacisków oraz system odciągu dymów spawalniczo-laserowych.",
            "Sprawdź prostoliniowość i przekrój profili lub rur w wiązce wejściowej oraz zweryfikuj ich gatunek stali i ściankę z dokumentacją zlecenia.",
            "Skontroluj stan dyszy tnącej 3D oraz centrowanie wiązki na taśmie kontrolnej przed załadunkiem pierwszego odcinka materiału.",
            "Ustaw w sterowniku długość handlową sztangi (np. 6000 mm), wymiary przekroju oraz aktywuj pomiar spoiny wzdłużnej profilu.",
            "Przeprowadź załadunek pierwszej sztangi z kasety podajnika i wykonaj cięcie kontrolne pierwszego detalu z partii.",
            "Zweryfikuj kąt cięcia, geometrię otworów oraz brak przebarwień termicznych na krawędziach odciętego profilu.",
            "Nadzoruj automatyczny rozładunek gotowych odcinków do pojemników transportowych, zapobiegając ich zakleszczeniu na zsuwni.",
            "Zatrzymaj cykl po opróżnieniu podajnika, wyłącz zasilanie maszyny, oczyść strefę uchwytu oraz odłóż narzędzia pomiarowe na tablicę cieni."
        ]
    },
    {
        id: "SOP-003",
        stationCode: "G-03",
        area: "CIĘCIE TERMICZNE",
        title: "Obsługa Wycinarki Plazmowej CNC ze Stołem Wodnym",
        issueDate: "04.04.2026",
        revision: "Rev. 1.5",
        author: "Mistrz Wydziału Cięcia",
        approver: "Specjalista BHP / UR",
        ppe: ["Przyłbica lub okulary DIN 5–8", "Rękawice skórzane trudnopalne", "Ochronniki słuchu"],
        hazards: "Promieniowanie łuku plazmowego UV/IR, wysoka temperatura detali, opary metaliczne.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><polygon points="26,14 38,14 35,30 29,30" fill="#64748b"/><path d="M32 30 L28 46 L32 42 L36 46 Z" fill="#eab308"/><line x1="12" y1="48" x2="52" y2="48" stroke="#475569" stroke-width="3"/></svg>`,
        steps: [
            "Załóż okulary przyciemniane do cięcia plazmowego, rękawice spawalnicze oraz ochronniki słuchu; sprawdź stan uziemienia stołu roboczego.",
            "Skontroluj poziom wody w wannie stołu lub drożność kanałów odciągu sekcyjnego oraz stan rusztów podporowych.",
            "Włącz agregat plazmowy, osuszacz powietrza sprężonego oraz wentylację wyciągową stanowiska.",
            "Odkręć dyszę palnika i sprawdź stopień wypalenia elektrody, dyszy wirowej oraz osłony – wymień zużyte części eksploatacyjne parami.",
            "Zweryfikuj ciśnienie gazu plazmowego i osłonowego na panelu agregatu zgodnie z tabelą prądową dla danej grubości blachy.",
            "Potwierdź gatunek i grubość arkusza ułożonego na ruszcie z kartą przewodnikową zlecenia oraz oczyść powierzchnię ze zgorzeliny i rdzy.",
            "Ustaw punkt bazowy arkusza, wczytaj program rozkroju i zweryfikuj aktywność regulatora wysokości palnika (THC).",
            "Wykonaj cięcie testowe, skontroluj ukosowanie krawędzi oraz przyleganie żużla na spodzie detalu.",
            "Prowadź rozkrój arkusza, kontrolując stabilność łuku głównego oraz bezpieczny odbiór gorących detali za pomocą chwytaków magnetycznych.",
            "Wyłącz źródło plazmy i zasilanie główne po zakończeniu pracy, usuń odpady z rusztu do pojemnika na złom i uporządkuj stanowisko."
        ]
    },
    {
        id: "SOP-004",
        stationCode: "G-01 / G-04",
        area: "OBRÓBKA PLASTYCZNA",
        title: "Obsługa Giętarki CNC do Rur i Profili Zamkniętych",
        issueDate: "11.04.2026",
        revision: "Rev. 2.0",
        author: "Technolog Obróbki Plastycznej",
        approver: "Kierownik Produkcji PK1",
        ppe: ["Okulary ochronne", "Rękawice mechaniczne dopasowane", "Obuwie S3"],
        hazards: "Strefa obrotu ramienia gnącego, wysuwający się trzpień wewnętrzny, ryzyko przygniecenia.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><circle cx="32" cy="34" r="10" fill="none" stroke="#eab308" stroke-width="3"/><path d="M14 44 L32 44 A10 10 0 0 0 42 34 L42 16" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/></svg>`,
        steps: [
            "Sprawdź wygrodzenie strefy omiatania ramienia gnącego oraz przetestuj działanie wyłącznika linkowego i nożnego pedału sterującego.",
            "Skontroluj poziom i temperaturę oleju hydraulicznego oraz brak wycieków na siłownikach zacisku i docisku.",
            "Uruchom pompę hydrauliczną maszyny i wykonaj zerowanie wszystkich osi serwonapędów (Y, B, C).",
            "Zweryfikuj profil lub rurę wejściową (przekrój, grubość ścianki, położenie szwu spawalniczego oraz gatunek materiału) z rysunkiem wykonawczym.",
            "Sprawdź dobór matrycy gnącej, listwy ślizgowej oraz trzpienia wewnętrznego pod kątem średnicy i promienia gięcia R.",
            "Uruchom automatyczne smarowanie trzpienia i potwierdź podawanie środka smarnego przed wprowadzeniem pierwszego odcinka.",
            "Wczytaj program gięcia, załaduj pierwszy profil z zachowaniem właściwej orientacji szwu i wykonaj gięcie pierwszej sztuki (FAI).",
            "Zmierz kąty gięcia kątomierzem elektronicznym, sprawdź brak owalizacji oraz pofałdowania ścianki wewnętrznej łuku.",
            "Realizuj partię produkcyjną, odkładając wygięte detale na dedykowane stojaki transportowe w sposób chroniący geometrię.",
            "Wyłącz agregat hydrauliczny i zasilanie główne po zakończeniu zlecenia, oczyść oprzyrządowanie ze smaru i wykonaj przegląd 5S."
        ]
    },
    {
        id: "SOP-005",
        stationCode: "P-01 / G-05",
        area: "CIĘCIE MECHANICZNE",
        title: "Obsługa Piły Tarczowej Automatycznej do Profili",
        issueDate: "28.04.2026",
        revision: "Rev. 1.6",
        author: "Mistrz Wydziału Przygotowania",
        approver: "Narzędziownia / BHP",
        ppe: ["Okulary ochronne szczelne", "Ochronniki słuchu", "Zakaz luźnych rękawic przy tarczy"],
        hazards: "Wirująca tarcza zębata HSS/VHM, ostre wióry metalowe, zacisk imadła pneumatycznego.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><circle cx="32" cy="30" r="13" fill="none" stroke="#eab308" stroke-width="3" stroke-dasharray="4 3"/><circle cx="32" cy="30" r="4" fill="#fde047"/><line x1="12" y1="46" x2="52" y2="46" stroke="#94a3b8" stroke-width="3"/></svg>`,
        steps: [
            "Zdejmij luźne elementy odzieży i biżuterię, załóż szczelne okulary ochronne oraz ochronniki słuchu; sprawdź stan osłony ruchomej tarczy.",
            "Skontroluj poziom chłodziwa w zbiorniku oraz stężenie emulsji za pomocą refraktometru (zakres 6–8%).",
            "Otwórz osłonę głowicy przy odłączonym napędzie i sprawdź stan uzębienia tarczy tnącej (brak wyłamanych zębów węglikowych i stępienia).",
            "Włącz zasilanie główne piły, układ pneumatyczny imadeł oraz wygarniacz ślimakowy wiórów.",
            "Zweryfikuj gatunek stali (np. stal węglowa vs nierdzewna) i wymiar profilu wejściowego na magazynie podawczym z kartą zlecenia.",
            "Dobierz prędkość obrotową tarczy oraz posuw głowicy odpowiednio do gatunku materiału i grubości ścianki profilu.",
            "Ustaw długość cięcia na zderzaku NC, zamocuj materiał w imadle głównym i wykonaj cięcie pierwszego odcinka próbnego.",
            "Zmierz długość uciętego detalu przymiarem legalizowanym, sprawdź prostopadłość czoła oraz brak gratu na krawędziach.",
            "Uruchom cykl automatyczny cięcia wiązki/profilu, kontrolując ciągły strumień chłodziwa na strefę skrawania oraz odbiór wiórów.",
            "Wyłącz napęd główny i zasilanie po zakończeniu pracy, usuń wióry ze stołu i szczęk imadła oraz uzupełnij kartę kontroli TPM."
        ]
    },
    {
        id: "SOP-006",
        stationCode: "G-06",
        area: "GIĘCIE KRAWĘDZIOWE",
        title: "Obsługa Prasy Krawędziowej CNC z Kurtyną DSP",
        issueDate: "09.05.2026",
        revision: "Rev. 2.2",
        author: "Inż. Procesu / BHP",
        approver: "Kierownik Produkcji PK1",
        ppe: ["Okulary ochronne", "Rękawice antyprzecięciowe", "Obuwie ochronne S3"],
        hazards: "Strefa zgniotu między stemplem a matrycą, podrywanie długiego arkusza podczas gięcia.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><polygon points="24,14 40,14 32,30" fill="#eab308"/><polygon points="16,36 28,36 32,44 36,36 48,36 48,48 16,48" fill="#64748b"/></svg>`,
        steps: [
            "Skontroluj strefę roboczą przed belką gnącą, potwierdź brak osób postronnych i sprawdź działanie dwustopniowego pedału bezpieczeństwa.",
            "Włącz zasilanie główne prasy oraz sterownik CNC i przeprowadź procedurę referencyjną belki (osie Y1/Y2) oraz zderzaków tylnych (X, R).",
            "Przetestuj system optoelektroniczny ochrony palców (kurtyna DSP) za pomocą wzorca kontrolnego przed wykonaniem pierwszego suwu.",
            "Zweryfikuj stan krawędzi roboczej stempla oraz rowka V matrycy – usuń wszelkie opiłki i zabrudzenia mogące odcisnąć się na detalu.",
            "Sprawdź gatunek, grubość oraz kierunek walcowania wykrojki blachy z rysunkiem technologicznym i kartą zlecenia.",
            "Wczytaj program gięcia, potwierdź siłę nacisku (tonaże nie mogą przekraczać dopuszczalnego obciążenia narzędzi) oraz kompensację strzałki ugięcia.",
            "Dociśnij pierwszą wykrojkę równomiernie do palców zderzaka tylnego i wykonaj gięcie próbne pierwszej sztuki (FAI).",
            "Zmierz kąty gięcia oraz wymiary półek detalu, wprowadzając ewentualną korektę kąta w sterowniku CNC.",
            "Wykonuj kolejne detale zgodnie z sekwencją gięć na ekranie, kontrolując podparcie długich arkuszy podczas podnoszenia.",
            "Po zakończeniu zmiany opuść belkę w pozycję spoczynkową, wyłącz pompę i zasilanie główne oraz uporządkuj strefę wokół prasy."
        ]
    },
    {
        id: "SOP-007",
        stationCode: "R-01 / G-07",
        area: "SPAWANIE ZROBOTYZOWANE",
        title: "Obsługa Celi Zrobotyzowanej Fanuc z Obrotnikiem",
        issueDate: "21.05.2026",
        revision: "Rev. 1.9",
        author: "Inżynier Robotyki / Spawalnik IWE",
        approver: "Kierownik Produkcji PK1",
        ppe: ["Przyłbica samościemniająca", "Rękawice spawalnicze", "Odzież trudnopalna"],
        hazards: "Szybki ruch ramienia robota w przestrzeni celi, łuk spawalniczy, obrót stołu pozycjonera.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><circle cx="20" cy="44" r="5" fill="#64748b"/><path d="M20 44 L28 24 L42 28 L46 38" fill="none" stroke="#eab308" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="46" cy="41" r="2.5" fill="#fde047"/></svg>`,
        steps: [
            "Skontroluj zamknięcie bram wygrodzenia, sprawność rygli bezpieczeństwa, skanerów strefowych oraz brak osób wewnątrz celi robota.",
            "Sprawdź poprawność działania złącza antykolizyjnego palnika oraz stan pancerza prowadzącego drut spawalniczy.",
            "Uruchom kontroler robota w trybie AUTO, źródło spawalnicze MIG/MAG oraz odciąg stanowiskowy dymów spawalniczych.",
            "Wykonaj cykl automatycznego czyszczenia dyszy gazowej na stacji TPM (frezowanie odprysków, wtrysk preparatu antyodpryskowego, obcinanie drutu).",
            "Sprawdź ciśnienie i wydatek gazu osłonowego (14–16 l/min) oraz zgodność gatunku i średnicy drutu z kartą WPS.",
            "Zweryfikuj przygotowanie elementów wsadowych (czystość krawędzi, brak oleju i rdzy) oraz załaduj detale do przyrządu spawalniczego.",
            "Zamknij dociski pneumatyczne przyrządu i potwierdź na panelu obecność wszystkich detali oraz właściwy numer programu spawania.",
            "Opuszcź strefę załadunku, potwierdź gotowość kurtyny bezpieczeństwa i uruchom cykl spawania pierwszej sztuki (FAI).",
            "Po obrocie stołu przeprowadź kontrolę wizualną VT spoin (brak podtopień, kraterów i porowatości) przed odłożeniem konstrukcji.",
            "Zatrzymaj celę w pozycji domowej (HOME) na koniec zmiany, wyłącz źródło i kontroler oraz oczyść przyrządy spawalnicze."
        ]
    },
    {
        id: "SOP-008",
        stationCode: "S-02 / G-08",
        area: "SPAWANIE MANUALNE",
        title: "Spawanie Manualne MIG/MAG Konstrukcji Stalowych",
        issueDate: "03.06.2026",
        revision: "Rev. 2.4",
        author: "Główny Spawalnik IWE",
        approver: "Kontrola Jakości / BHP",
        ppe: ["Przyłbica spawalnicza", "Rękawice spawalnicze długie", "Fartuch trudnopalny"],
        hazards: "Promieniowanie łuku, gorące odpryski metalu, dymy spawalnicze, porażenie prądem.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><path d="M16 42 L34 28 L42 32" fill="none" stroke="#94a3b8" stroke-width="3.5" stroke-linecap="round"/><circle cx="45" cy="34" r="4" fill="#eab308"/><path d="M45 26v-4M51 30l3-2M51 38l3 2" stroke="#fde047" stroke-width="2" stroke-linecap="round"/></svg>`,
        steps: [
            "Załóż przyłbicę spawalniczą, fartuch i rękawice trudnopalne; ustaw parawany ochronne wokół stanowiska oraz uruchom ramię wyciągu dymów.",
            "Sprawdź stan izolacji przewodów spawalniczych, pewność zamocowania zacisku masowego do stołu oraz czystość rowków teowych.",
            "Włącz półautomat spawalniczy, otwórz zawór butli/instalacji Ar+CO2 i ustaw przepływ gazu rotametrem (14–16 l/min).",
            "Skontroluj stan końcówki prądowej, łącznika oraz czystość dyszy gazowej palnika – oczyść i zabezpiecz preparatem antyodpryskowym.",
            "Zweryfikuj atest hutniczy 3.1 drutu spawalniczego oraz gatunek spawanych elementów z wymaganiami Instrukcji Technologicznej Spawania (WPS).",
            "Ustaw natężenie prądu, napięcie łuku oraz prędkość podawania drutu zgodnie z zakresem kwalifikowanym w karcie WPS.",
            "Ułóż i zablokuj elementy konstrukcji w przyrządzie bazującym, wykonaj spoiny sczepne i skontroluj przekątne oraz kąty geometryczne.",
            "Wykonaj spoiny ciągłe zgodnie z kolejnością spawania minimalizującą odkształcenia cieplne konstrukcji.",
            "Oczyść spoiny z odprysków, przeprowadź 100% kontroli wizualnej (VT) według normy PN-EN ISO 5817 i oznacz wyrób swoim numerem spawacza.",
            "Zakręć dopływ gazu osłonowego, wyłącz źródło prądu, odwieś uchwyt na wieszak magnetyczny i oczyść stół traserski."
        ]
    },
    {
        id: "SOP-009",
        stationCode: "K-02 / G-09",
        area: "PRZYGOTOWANIE POWIERZCHNI",
        title: "Obsługa Śrutowni Komorowej / Przedgalwaniki",
        issueDate: "15.06.2026",
        revision: "Rev. 1.3",
        author: "Technolog Powłok / BHP",
        approver: "Kierownik Produkcji PK1",
        ppe: ["Ochronniki słuchu", "Okulary ochronne", "Maska przeciwpyłowa P3", "Rękawice"],
        hazards: "Wyrzut śrutu staliwnego pod wysokim ciśnieniem, zapylenie, transport podwieszany.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><rect x="14" y="16" width="36" height="32" rx="4" fill="none" stroke="#64748b" stroke-width="2.5"/><circle cx="26" cy="28" r="2" fill="#eab308"/><circle cx="38" cy="26" r="2" fill="#fde047"/><circle cx="32" cy="36" r="2" fill="#eab308"/><circle cx="24" cy="38" r="1.5" fill="#fde047"/></svg>`,
        steps: [
            "Sprawdź szczelność kurtyn gumowych komory, zamki drzwi serwisowych oraz sprawność sygnalizacji świetlno-dźwiękowej pracy turbin.",
            "Skontroluj stan techniczny trawersy załadunkowej, haków oraz zawiesi technologicznych przed podwieszeniem konstrukcji.",
            "Włącz system odpylania filtracyjnego, separator śrutu oraz napęd główny śrutowni.",
            "Zweryfikuj poziom śrutu staliwnego w zasobniku głównym i w razie potrzeby uzupełnij ścierniwo właściwej granulacji.",
            "Sprawdź konstrukcję stalową przed załadunkiem: potwierdź wykonanie wszystkich otworów odpowietrzających i technologicznych oraz brak tłustych plam.",
            "Zawieś wyroby na trawersie z zachowaniem bezpiecznych odstępów uniemożliwiających ich zderzanie podczas obrotu.",
            "Wprowadź ładunek do komory, zamknij drzwi wejściowe i wybierz program śrutowania odpowiedni dla grubości ścianki i stopnia skorodowania.",
            "Uruchom cykl rzutowy turbin i kontroluj pobór prądu na amperomierzach (stabilny strumień śrutu na każdą turbinę).",
            "Po zakończeniu cyklu i zatrzymaniu turbin wyjedź trawersą, przedmuchaj kieszenie detalu i zweryfikuj stopień czystości powierzchni (Sa 2.5).",
            "Wyłącz odpylanie i zasilanie główne na koniec zmiany, zamieć rozsypany śrut wokół komory i zdaj stanowisko w standardzie 5S."
        ]
    },
    {
        id: "SOP-010",
        stationCode: "M-01 / G-10",
        area: "MONTAŻ KOŃCOWY",
        title: "Montaż Końcowy Kontenerów i Weryfikacja Jakości",
        issueDate: "24.06.2026",
        revision: "Rev. 2.5",
        author: "Lider Montażu / Jakość FTY",
        approver: "Kierownik Produkcji PK1",
        ppe: ["Okulary ochronne", "Rękawice montażowe", "Obuwie S3", "Ochronniki słuchu"],
        hazards: "Praca z narzędziami pneumatycznymi i kluczami dynamometrycznymi, ciężkie skrzydła drzwiowe.",
        svgIcon: `<svg viewBox="0 0 64 64" class="w-11 h-11 shrink-0"><rect x="4" y="8" width="56" height="48" rx="8" fill="#151b24" stroke="#324055" stroke-width="2"/><path d="M22 22 L42 42" stroke="#eab308" stroke-width="4" stroke-linecap="round"/><circle cx="20" cy="20" r="5" fill="none" stroke="#fde047" stroke-width="2.5"/><circle cx="44" cy="44" r="5" fill="none" stroke="#fde047" stroke-width="2.5"/></svg>`,
        steps: [
            "Skontroluj porządek na stanowisku montażowym, drożność przejść oraz dostępność podestów roboczych i zawiesi.",
            "Sprawdź ciśnienie w sieci pneumatycznej, stan przewodów zasilających oraz ważność naklejki legalizacyjnej na kluczach dynamometrycznych.",
            "Pobierz wózek kompletacyjny (Kitting) dla bieżącego zlecenia i zweryfikuj zgodność kompletu okuć, rygli, zawiasów oraz uszczelek z listą BOM.",
            "Sprawdź typ oraz powłokę lakierniczą/cynkową korpusu kontenera z kartą zlecenia i dokumentacją klienta przed rozpoczęciem uzbrajania.",
            "Zamontuj zawiasy oraz skrzydła drzwiowe z użyciem dedykowanych szablonów pozycjonujących, weryfikując równe szczeliny obwodowe.",
            "Zainstaluj mechanizmy ryglowania, prowadnice oraz klamki zabezpieczające, stosując łączniki o klasie wytrzymałości zgodnej z rysunkiem.",
            "Dokręć wszystkie połączenia śrubowe kluczem dynamometrycznym nastawionym na wymagany moment obrotowy i oznacz śruby markerem kontrolnym.",
            "Zamontuj uszczelki obwodowe drzwi oraz przeprowadź próbę otwierania, zamykania i ryglowania skrzydeł bez nadmiernego oporu.",
            "Naklej tabliczki znamionowe, znaki ostrzegawcze BHP oraz wypełnij kartę kontroli końcowej (FTY) przed zwolnieniem wyrobu na plac wyrobów gotowych.",
            "Odłóż wszystkie narzędzia ręczne i pneumatyczne na tablicę cieni stanowiska, usuń opakowania po komponentach i uporządkuj pole montażowe."
        ]
    }
];

function renderSopCards() {
    const container = document.getElementById('sop-cards-container');
    if (!container) return;

    container.innerHTML = SOP_LIBRARY.map((sop, idx) => `
        <div class="glass-card rounded-xl border border-slate-800 hover:border-amber-500/50 transition overflow-hidden">
            <!-- Nagłówek karty (Klikalny akordeon) -->
            <button type="button" onclick="toggleSopCard('${sop.id}')" class="w-full p-4 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 hover:bg-slate-900 transition">
                <div class="flex items-center gap-3.5">
                    ${sop.svgIcon}
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono text-[10px] font-bold">
                                ${sop.id} • ${sop.stationCode}
                            </span>
                            <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-semibold">
                                ${sop.area}
                            </span>
                            <span class="text-[11px] font-mono text-slate-400">
                                Utworzono: <strong class="text-slate-200">${sop.issueDate}</strong> (${sop.revision})
                            </span>
                        </div>
                        <h3 class="font-bold text-sm sm:text-base text-white mt-1.5">${sop.title}</h3>
                    </div>
                </div>

                <div class="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span id="sop-toggle-label-${sop.id}" class="text-xs font-bold text-amber-400 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        Rozwiń 10 kroków ▼
                    </span>
                </div>
            </button>

            <!-- Rozwijana treść procedury SOP -->
            <div id="sop-body-${sop.id}" class="${idx === 0 ? '' : 'hidden'} p-4 sm:p-5 bg-slate-950/90 border-t border-slate-800 space-y-4">
                <!-- Pasek metadanych w standardzie dokumentacji -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                    <div>
                        <span class="text-[10px] font-mono uppercase text-slate-400 block">Opracował / Zatwierdził:</span>
                        <span class="text-slate-200 font-semibold">${sop.author} / ${sop.approver}</span>
                    </div>
                    <div>
                        <span class="text-[10px] font-mono uppercase text-slate-400 block">Identyfikacja Zagrożeń (BHP):</span>
                        <span class="text-rose-300 font-medium">${sop.hazards}</span>
                    </div>
                    <div>
                        <span class="text-[10px] font-mono uppercase text-slate-400 block">Wymagane ŚOI (PPE):</span>
                        <div class="flex flex-wrap gap-1 mt-1">
                            ${sop.ppe.map(item => `<span class="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">${item}</span>`).join('')}
                        </div>
                    </div>
                </div>

                <!-- 10 ponumerowanych kroków procedury -->
                <div>
                    <h4 class="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-2.5">
                        Sekwencja Operacyjna Stanowiska (Kroki 1 – 10):
                    </h4>
                    <ol class="space-y-2">
                        ${sop.steps.map((stepText, sIdx) => `
                            <li class="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-200 leading-relaxed">
                                <span class="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                                    ${sIdx + 1}
                                </span>
                                <span>${stepText}</span>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
        </div>
    `).join('');
}

function toggleSopCard(sopId) {
    const body = document.getElementById(`sop-body-${sopId}`);
    const label = document.getElementById(`sop-toggle-label-${sopId}`);
    if (!body) return;

    const isHidden = body.classList.contains('hidden');
    if (isHidden) {
        body.classList.remove('hidden');
        if (label) label.innerText = 'Zwiń procedurę ▲';
    } else {
        body.classList.add('hidden');
        if (label) label.innerText = 'Rozwiń 10 kroków ▼';
    }
}

window.addEventListener('DOMContentLoaded', renderSopCards);