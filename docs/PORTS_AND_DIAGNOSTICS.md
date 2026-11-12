# Porty, interfejsy, media i diagnostyka

Zakres wdrożenia: konfiguracja obu końców łączy, wiele kart IP, profile kabli i modułów, statyczne budżetowanie PoE oraz audyt projektu. Nie obejmuje jeszcze UPS-ów, instalacji elektrycznej ani scenariuszy awarii w czasie.

## Jak używać

1. Zaznacz urządzenie i wybierz **Porty i PoE** nad planszą albo otwórz tę sekcję w dialogu urządzenia. Dodaj właściwą liczbę gniazd, nazwij je i ustaw ich możliwości. Domyślne profile to punkt startowy, nie identyfikacja konkretnego modelu sprzętu.
2. Zaznacz urządzenie i wybierz **Połącz urządzenie** (także w menu kontekstowym), kliknij port początkowy, wskaż drugie urządzenie na planszy i wybierz jego port. Ustaw medium/długość i zatwierdź **Połącz wybrane porty**. Narzędzie C prowadzi przez te same kroki. Anulowanie nie zajmuje gniazd i nie zapisuje części kabla. Aplikacja nie tworzy dodatkowych gniazd po ich wyczerpaniu. Port fizyczny obsługuje jeden kabel. Radio AP obsługuje wielu klientów, a radio klienta jedną asocjację.
3. Dwuklik kabla otwiera **Porty i połączenie**. Kabel można też znaleźć w **Obiekty → Połączenia** i otworzyć dwuklikiem lub klawiszem Enter. Wybierz port A i B, osobne access/trunk/native VLAN, prędkości i moduły, a także medium, długość oraz etykietę. Zapis obejmuje oba porty i kabel; anulowanie odrzuca całą kopię roboczą.
4. W **Interfejsach IP** włącz osobną konfigurację kart. Każda ma port, IP/DHCP, maskę, VLAN, bramę, metrykę i opcje DNS. Nowe karty wymagają wolnego portu; można go dodać w zakładce portów.
5. W **Diagnostyce** sprawdź błędy i ostrzeżenia. Przycisk przy zgłoszeniu otwiera urządzenie lub kabel. Panel pokazuje też decyzje ostatniego zakończonego testu, identyfikatory ACL i translacje NAT.

W panelu symulacji pola interfejsu źródła i celu są widoczne także przed włączeniem osobnej konfiguracji kart. Przyciski pod polami otwierają bezpośrednio właściwy edytor. Można wskazać interfejs źródłowy i docelowy lub pozostawić automatyczny wybór źródła. Dodatkowy IP można podać bezpośrednio jako cel. Najwolniejsze łącze na ścieżce oznacza limit skonfigurowanego profilu, nie pomiar przepustowości aplikacji.

Panel portów przypomina front urządzenia: osobne grupy RJ45, SFP/SFP+, radia Wi-Fi i kart wirtualnych. Każde gniazdo ma nazwę, podpowiedź oraz stan tekstowy. Zielony oznacza aktywny link, szary brak podłączenia, czarny port administracyjnie wyłączony. Podłączony port bez działającego linku jest szary, z oznaczeniem „brak linku”. Kliknięcie gniazda w edytorze urządzenia pokazuje jego szczegółową konfigurację.

W trakcie łączenia zajęte, wyłączone i niezgodne gniazda są zablokowane. Radio AP pozostaje współdzielone, radio klienta ma jedną asocjację. VM jest przypisywana do hypervisora bez zużywania fizycznego portu. Puste gniazda SFP+ sugerują DAC, moduły LX/LR — OS2, a SX/SR — OM3; medium można zmienić przed zapisem. Brak optyki lub inne błędy profilu są pokazane przed zatwierdzeniem; można zapisać nieaktywne łącze do dalszej konfiguracji. Starsze projekty bez przypisanych portów nadal korzystają z migracji automatycznej.

## Reguły sieciowe i źródła

### Porty i 802.1Q

Tryb access przesyła ramki nietagowane. Trunk taguje dozwolone VLAN-y, a native VLAN może wysyłać bez tagu. Odbiornik przypisuje ramkę nietagowaną do własnego PVID. Dlatego różne native VLAN-y mogą połączyć niewłaściwe domeny L2, podczas gdy poprawnie tagowany ruch innych VLAN-ów nadal działa. Nie traktujemy takiej rozbieżności jak fizycznie odłączonego kabla. Można włączyć tagowanie native przy nadawaniu. Podstawa: [Cisco — konfiguracja trunków](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan-trunks.html).

Lista allowed jest sprawdzana osobno na obu końcach. Tryb automatyczny zachowuje logiczne ustawienia dotychczasowego połączenia. Dla nowej, dokładnej konfiguracji wybierz jawny access/trunk. VLAN 0 pozostaje umownym oznaczeniem WAN/połączenia routowanego bez opisanego VLAN-u; nie oznacza wysyłania tagu 802.1Q VID 0.

Równoległe kable mają osobne porty, krzywe na planszy i identyfikatory w śladzie pakietu. Wybierane jest łącze przenoszące właściwy VLAN; nie powstaje automatycznie agregacja LACP ani większa przepustowość.

### Adresowanie i trasy

Host wybiera aktywną kartę według najdłuższego pasującego prefiksu, potem metryki. Brak dopasowania connected wymaga bramy na właściwej karcie. Maska hosta jest niezależna od opisu VLAN-u: zbyt szeroka maska może powodować nieskuteczne ARP zamiast wysłania pakietu do routera. Dodatkowa karta nie włącza przekazywania między sieciami. Podstawa decyzji local/remote i multihomingu: [RFC 1122, część 3.3.1](https://www.rfc-editor.org/rfc/rfc1122.html).

Router, firewall i switch L3 mogą mieć jawne statyczne interfejsy IP powiązane z portami. Są one źródłem tras connected, obok wspólnej konfiguracji SVI w sieciach. Następny skok trasy statycznej może być osiągalny przez switch w tej samej sieci L2 — nie wymaga jednego bezpośredniego kabla. Model nie rozwiązuje rekursywnie kolejnych tras do adresu next-hop. Nie zastępuje OSPF/BGP. Zasady routingu porównano z [RFC 1812](https://www.rfc-editor.org/rfc/rfc1812.html).

Dla hostów DHCP identyfikuje klienta per karta. IP, maska, router i DNS są przechowywane w dzierżawie; każda karta odnawia się osobno. Jawne interfejsy routowane w tej wersji wymagają adresacji statycznej. ISP/DHCP na zewnętrznym WAN nie jest emulowane. Zasady dzierżaw i opcji: [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131.html), [RFC 2132](https://www.rfc-editor.org/rfc/rfc2132.html).

### Prędkość, duplex, miedź i optyka

Model wybiera najwyższą wspólną prędkość zgodną z portami, modułami i profilem medium. Wymuszenie różnych prędkości daje brak linku. Rozbieżność duplexu przy 10/100 jest ostrzeżeniem o degradacji, nie arbitralnym odłączeniem. Zasady porównano z [Cisco — autonegocjacja i duplex](https://www.cisco.com/c/en/us/support/docs/lan-switching/ethernet/10561-3.html).

| Profil          | Przyjęty zakres                                                             |
| --------------- | --------------------------------------------------------------------------- |
| Cat 5e          | Do 100 m, prędkości do 5 Gb/s; 5G zgłasza wymóg kwalifikacji toru.          |
| Cat 6           | Do 100 m dla prędkości do 5 Gb/s; 10G do 55 m, z ostrzeżeniem powyżej 37 m. |
| Cat 6A          | Do 100 m, do 10 Gb/s.                                                       |
| 1000BASE-SX     | OM3/OM4 do 550 m.                                                           |
| 1000BASE-LX/LH  | OS2 do 10 km.                                                               |
| 10GBASE-SR      | OM3 do 300 m, OM4 do 400 m.                                                 |
| 10GBASE-LR      | OS2 do 10 km.                                                               |
| Pasywny DAC 10G | Dwa porty SFP+, do 7 m, bez osobnych modułów optycznych.                    |

Źródła: [NBASE-T / Fluke — kwalifikacja Cat 5e/6 dla 2,5/5G](https://archive.nbaset.ethernetalliance.org/fluke-networks-will-existing-cable-plant-support-2-5-5gbase-t/), [ICC — granice 10G na Cat 6](https://icc.com/help/can-icc-cat6-solution-support-10gbase-t/), [Cisco — profile SFP+](https://www.cisco.com/c/en_in/products/collateral/interfaces-modules/transceiver-modules/data_sheet_c78-455693.html), [Juniper EX2300 — pasywne DAC do 7 m](https://www.juniper.net/documentation/us/en/hardware/ex2300/topics/topic-map/ex2300-network-cable-transceiver-planning.html).

To jawne profile projektowe. Nie symulujemy treningu PHY, BER, strat w złączach, polaryzacji włókien, budżetu optycznego w dB, przeciążeń ani zachowania sprzętowego downshift. Przyjęta niższa prędkość zgodna z kablem nie jest obietnicą identycznej autonegocjacji konkretnego NIC. Rzeczywisty tor wymaga pomiaru i zgodności z dokumentacją urządzenia. Obsługa 1G w SFP+ zależy od sprzętu — ustaw listę możliwości portu zgodnie z jego specyfikacją. Długość jest metadanymi użytkownika, niezależnymi od odległości ikon na planszy; wartość startowa wynosi 3 m.

### PoE

Budżet switcha jest liczony po stronie PSE, a zapotrzebowanie odbiornika po stronie PD. Rezerwujemy najniższą klasę gwarantującą zadany pobór, z zapasem strat kanału.

| Klasa         | Rezerwacja PSE | Moc dostępna PD |
| ------------- | -------------- | --------------- |
| 1             | 4 W            | 3,84 W          |
| 2             | 7 W            | 6,49 W          |
| 3 / profil af | 15,4 W         | 12,95 W         |
| 4 / at        | 30 W           | 25,5 W          |
| 5             | 45 W           | 40 W            |
| 6 / bt Type 3 | 60 W           | 51 W            |
| 7             | 75 W           | 62 W            |
| 8 / bt Type 4 | 90 W           | 71,3 W          |

Podstawa: [Cisco — af/at i moc PSE/PD](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/troubleshooting/g_power_over_ethernet.html), [HPE Aruba — klasy 802.3bt](https://arubanetworking.hpe.com/techdocs/AOS-S/16.10/MCG/WC/content/wc/def-ter-802.3bt.htm).

Dwie kamery po 12 W potrzebują w tym konserwatywnym modelu 30,8 W budżetu, nie 24 W. Odbiornik pozostaje bez zasilania, jeśli brakuje odpowiedniego PSE, klasy, miedzi w zasięgu albo całkowitego budżetu. Nie wykorzystujemy arbitralnego przelicznika procentowego strat. Kolejność rezerwacji jest stabilna według ID odbiorników. Nie emulujemy sygnatur elektrycznych, negocjacji LLDP, priorytetów konkretnego firmware ani PoE passthrough.

Brak PoE wpływa na dostępność w DHCP i ruchu danych, lecz nie zmienia zapisanego przełącznika „online”. Poprawa budżetu przywraca możliwość działania. Lokalny zasilacz jest na razie traktowany jako dostępny; UPS, energia i awarie w czasie pozostają kolejnym etapem.

## Scenariusze odbioru

- zgodny port i kabel, zajęte gniazdo, brak wolnego portu, wyłączony port;
- wiele klientów radia AP oraz pojedyncza asocjacja radia klienta;
- autonegocjacja profilu, wymuszone różne prędkości i duplex mismatch;
- kanał miedziany 100/100,1 m, Cat 6 powyżej zakresu 10G, Cat 5e/5G z ostrzeżeniem;
- brak/niewłaściwa para modułów, OM3/OM4/OS2, granice SR/LR i DAC;
- native mismatch z działającym ruchem tagowanym, tagowanie native, filtr trunku i access;
- dwa kable między switchami obsługujące różne VLAN-y, ze śladem konkretnego kabla;
- niezależne DHCP dwóch kart, source IP i source port, prefiks przed metryką;
- brak routingu przez zwykły host z dwiema kartami, błędna maska i brama, wyłączona karta;
- statyczne interfejsy L3 i next-hop przez switch, trasa odpowiedzi oraz DNAT na dodatkowy NIC;
- klasy PoE af/at/bt, straty PSE/PD, wyczerpanie budżetu i odzyskanie łączności po jego poprawieniu;
- kopiowanie wielu interfejsów z unikalnymi IP, import/eksport, undo/redo i istniejące laboratorium.

Testy regresyjne są w `src/tests/hardware.test.ts`, `interfaces.test.ts`, `diagnostics.test.ts` oraz dotychczasowych zestawach. Test przeglądarkowy w osobnym profilu Chromium obejmował anulowanie zagnieżdżonej edycji VLAN-u, zapis/anulowanie/cofnięcie zmiany portu, dodanie i zapis NIC oraz edycję kabla; nie zgłosił błędów JavaScript. Kontrola skali na 422 urządzeniach i 421 łączach wykonała audyt w około 0,26 s w środowisku deweloperskim — to pomiar pomocniczy, nie gwarancja dla każdego projektu.

## Utrzymanie

- `model/portConnections.ts`: jawne końce kabla, zajętość, zgodność gniazd i sugestie medium.
- `components/PortPanel.tsx` oraz `editors/PortConnectionDialog.tsx`: wspólny panel gniazd i wybór obu końców.
- `model/ports.ts`: profile, normalizacja, fizyczna dostępność, kodowanie VLAN i rezerwacje PoE.
- `model/interfaces.ts`: wybór NIC, powiązanie z portem, klienci DHCP per karta i sąsiedztwo L2 next-hop.
- `model/hardwareValidation.ts`: walidacja granic importu i zapisu formularzy.
- `model/diagnostics.ts`: zgłoszenia z identyfikatorem urządzenia/kabla i działaniem naprawczym.
- `editors/PortFields.tsx`, `PortsEditor.tsx`, `InterfacesEditor.tsx`, `LinkDialog.tsx`: formularze kopii roboczych.
- `components/DiagnosticsDialog.tsx`: audyt oraz podgląd ostatniego wyniku.
- `canvas/linkGeometry.ts`: osobne krzywe kabli równoległych i tor markera pakietu.

Starsze pliki bez portów są nadal odczytywane. Edytor przypisuje im bazowy profil i wolne gniazda, zachowując tryb automatyczny dla starych ustawień VLAN. Jeżeli dawny diagram przekracza rzeczywistą liczbę portów wybranego profilu, diagnostyka wymaga uzupełnienia sprzętu; nie dopisujemy fikcyjnych gniazd. W laboratorium AP gościnny ma jawnie dwa RJ45, a switch CCTV zasila dwie kamery z budżetu 60 W.
