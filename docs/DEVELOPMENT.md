# Przewodnik po kodzie

Rozszerzenie AAA: `src/model/radius.ts` ocenia uwierzytelnianie, autoryzację NAS/VLAN, accounting i zdarzenia; `RadiusEditor.tsx` konfiguruje konta, NAS i supplicantów. `reconcileDhcp` najpierw przygotowuje adresację infrastruktury, potem przelicza dostęp i dopiero przydziela adresy klientom. Wewnętrzne próby `controlPlane` używają tego samego silnika routingu/usług/ACL, ale bez ponownego wywoływania AAA/DHCP, co zapobiega rekurencji. `transferVlan` egzekwuje przypisany VLAN wyłącznie na kontrolowanym łączu, a uplinki nadal wymagają poprawnych trunków. Stan importowanej sesji nie jest dowodem autoryzacji.

`modernInfrastructure.ts` dodaje gałąź AAA i nowe typy sprzętu do każdej fabryki przykładu, bez zmiany pierwotnego celu lekcji. `radius.test.ts` sprawdza odrzucenia, reautoryzację, VLAN/DHCP, ACL transportu, accounting, brak obejścia przez statyczne IP/import oraz usuwanie zależności. [Instrukcja RADIUS](./RADIUS.md).

Projekt to aplikacja React + TypeScript działająca lokalnie w przeglądarce. Model sieci i silnik symulacji są niezależne od Reacta. Zapis projektu pozostaje zgodny z dotychczasowym JSON-em i kluczem `netweave-project` w localStorage.

## Od czego zacząć

| Folder / plik     | Odpowiedzialność                                                                      |
| ----------------- | ------------------------------------------------------------------------------------- |
| `src/main.tsx`    | Wejście aplikacji i ładowanie CSS.                                                    |
| `src/app/App.tsx` | Koordynacja edytora, narzędzia, zaznaczenie, otwieranie dialogów.                     |
| `src/project/`    | Tworzenie, kopiowanie i usuwanie obiektów; autosave, import/eksport i historia zmian. |
| `src/model/`      | Typy, walidacja projektu, IPv4, topologia, DHCP, DNS i model Internetu; bez Reacta.   |
| `src/devices/`    | Katalog urządzeń, wspólny renderer, wbudowane wektory i rejestr grafik.               |
| `public/devices/` | Grafiki SVG, PNG lub WebP, udostępniane jako `/devices/nazwa.ext`.                    |
| `src/canvas/`     | Plansza SVG, gesty, zoom, geometria obszarów i przesuwanie grup VLAN.                 |
| `src/editors/`    | Dialogi urządzeń, połączeń i VLAN oraz formularze ACL, NAT, tras, DNS i usług.        |
| `src/components/` | Wspólny Modal, biblioteka urządzeń, pomoc i menu kontekstowe.                         |
| `src/simulation/` | Silnik symulacji, próby z Internetu, zegar animacji, hook i panel wyników.            |
| `src/examples/`   | Fabryki projektów demonstracyjnych, scenariusze i menu przykładów.                    |
| `src/styles/`     | Arkusz stylów interfejsu.                                                             |
| `src/tests/`      | Testy Vitest; `fixtures/` przechowuje stary projekt do testów zgodności.              |

`network.ts` zachowuje część eksportów typów i pomocników dla wygody istniejących modułów. Nowy kod może importować typy bezpośrednio z `networkTypes.ts`, a obliczenia IPv4 z `addressing.ts`. Silnik importuje model, model nie importuje silnika.

## Przepływ zmian

1. Dialog pracuje na kopii roboczej; anulowanie nie modyfikuje projektu.
2. Zatwierdzenie trafia do `commit` w `App`, które przerywa trwającą symulację.
3. `useProject.commit` uzupełnia domyślny Internet, przypisuje porty przez `prepareHardware`, przelicza DHCP, zapisuje migawkę historii i usuwa gałąź redo.
4. Autosave zapisuje JSON po krótkiej przerwie. Samo okresowe odnowienie dzierżawy nie dodaje kroku cofania.
5. Silnik symulacji liczy wynik modelu. Hook odtwarza go z animacją, pokazując wynik dopiero na końcu.

Tempo animacji zmienia zegar prezentacji, a nie decyzje ACL czy routingu. Przy zmianie tempa `retimeFlight` zachowuje naliczony czas logiczny. Canvas i dziennik korzystają z tych samych stałych czasu.

## Zasady przy rozbudowie

- Nie zmieniaj urządzeń ani VLAN-ów w miejscu. Zachowuj stabilne ID; odwołują się do nich ACL, DNS, trasy i hosty VM.
- Dodając rodzaj urządzenia, zacznij od `Kind`, katalogu i grafiki. Potem określ jego możliwości w modelu: routing, ACL, DHCP, usługi i przekazywanie ruchu. Nowa ikona sama nie nadaje tych możliwości.
- Dodając przykład, dopisz fabrykę do `networkExamples`. Fabryka powinna za każdym razem tworzyć niezależne obiekty.
- Zmieniając format JSON, utrzymaj migrację w `parseNetwork` i dodaj test importu starego projektu.
- Dla zmian protokołów testuj zarówno dozwolony ruch, jak i blokady oraz drogę powrotną. Pomyślny wynik modelu nie zastępuje testu fizycznych urządzeń.
- Style pozostają w `src/styles/workspace.css`, z klasami odpowiadającymi komponentom; refaktoryzacja nie wprowadza nowego systemu wizualnego.

## Polecenia

```sh
npm run dev
npm run format
npm run format:check
npm run typecheck
npm test
npm run build
```

Prettier formatuje TypeScript, JSX, CSS i dokumentację. TypeScript ma włączone `strict`, `noUnusedLocals` i `noUnusedParameters`, żeby nie pozostawiać nieużywanych importów, zmiennych i parametrów.

Instrukcja własnych grafik: [DEVICE_ARTWORK.md](./DEVICE_ARTWORK.md).

## Obszary sieci

Obszar odpowiada VLAN-owi i obejmuje jego urządzenia. `src/canvas/networkAreas.ts` oblicza wyłącznie obrys izometryczny z aktualnych pozycji. Import starszych projektów usuwa dawne pole `areaShape`; kwadraty i prostokąty nie są już rysowane ani konfigurowane.

Dwuklik obszaru, Enter na obszarze z fokusem lub wybór VLAN-u w panelu bocznym otwiera edycję konkretnej sieci. Obszary bez urządzeń nie są rysowane; ich karty są nadal dostępne w zarządzaniu sieciami.

## Karty i edycja sieci

- `src/editors/VlanDialog.tsx` udostępnia globalny katalog kart; zapis dotyczy jednej sieci i trafia od razu do historii projektu.
- `VlanCards.tsx` pokazuje nazwę, ID, CIDR, bramę/SVI, serwer i pulę DHCP, dzierżawę, relay, DNS i liczbę urządzeń. Ten sam komponent działa w zakładce „Sieci i DHCP” urządzenia, gdzie zmiany pozostają robocze do zatwierdzenia całego urządzenia.
- `VlanEditorDialog.tsx` edytuje kopię jednej sieci. Anulowanie nie zmienia kart. Zatwierdzenie waliduje całą listę sieci, a w katalogu globalnym także statyczne adresy urządzeń przez `applyVlans`.
- `ScopeFields.tsx` zawiera współdzielone formularze bramy, DHCP i DNS; `NetworkScopes.tsx` osadza karty w dialogu urządzenia.
- `src/project/vlanEditing.ts` proponuje wolny ID i prywatną podsieć /24. Wykrywa odwołania z urządzeń, Wi-Fi, VLAN-ów switchy, portów i ACL, blokując zmianę ID lub usunięcie używanej sieci.

Dialog edycji jest otwierany po zamontowaniu nadrzędnego okna. Zdarzenia anulowania oraz zatwierdzania nie propagują się do formularza urządzenia. Zapis globalny korzysta z autosave, undo/redo i eksportu JSON.

## Kategorie i audyt urządzeń

`src/devices/deviceCatalog.ts` zawiera `deviceCategories` i wymagane pole `category` każdego rodzaju urządzenia. Dodanie nowego rodzaju do `Kind` wymaga przypisania go do kategorii; biblioteka grupuje wpisy automatycznie. Wyszukiwanie rozwija pasujące sekcje i obejmuje nazwę, opis i nazwę kategorii. Menu kontekstowe pustej planszy nie powiela biblioteki.

[Audyt zachowania urządzeń](./DEVICE_BEHAVIOR_AUDIT.md) zawiera źródła techniczne, poprawki i jawne ograniczenia symulacji.

## Porty, karty IP i diagnostyka

Opis funkcji, źródła i macierz scenariuszy: [PORTS_AND_DIAGNOSTICS.md](./PORTS_AND_DIAGNOSTICS.md).

- `model/ports.ts` oblicza fizyczny stan łączy i budżety PoE, przypisuje wolne porty oraz koduje/dekoduje VLAN w obu kierunkach. Nie buforuje mutowalnych obiektów projektu. Krótkotrwały `operationalNetwork` ma nieserializowany indeks portów i stan fizyczny używany podczas przejścia grafu.
- `model/interfaces.ts` wybiera interfejs źródła/celu, rozwiązuje next-hop we wspólnym L2 i buduje tymczasowych klientów DHCP per NIC. Ich ID nie trafiają do zapisu, canvasu ani historii; wynik wraca do `Device.interfaces`. Pola `Device.ip/vlan/ipMode/lease` są zgodnymi wstecz aliasami pierwszej karty.
- Publiczny `simulateNetwork` przelicza dzierżawy, wybiera karty i korzysta z aktywnej fizycznie topologii. Wewnętrzny silnik sprawdza routing, VLAN, ACL, usługi i odpowiedź. `Result.linkPath/returnLinkPath` oraz `traceLinkPath` zachowują konkretne kable, w tym przy łączach równoległych i etapach DNS.
- `hardwareValidation.ts` kontroluje import i zapis. `diagnostics.ts` zwraca błędy/ostrzeżenia/informacje z celem nawigacji i zalecanym działaniem. Brak trasy dla konkretnego celu pozostaje też wynikiem próby, ponieważ sieć lokalna bez bramy nie musi być błędna.
- Formularze `PortFields`, `PortsEditor`, `InterfacesEditor` oraz `LinkDialog` pracują na kopiach. LinkDialog zapisuje razem kabel i zmienione porty obu urządzeń. Diagnostyka otwiera właściwą konfigurację.
- `belongsToVlan` uwzględnia dodatkowe karty przy kartach sieci, obrysach i przesuwaniu grup. Nie licz tylko `device.vlan`, jeśli kod ma obejmować hosty z wieloma interfejsami.

Domyślne profile gniazd są konfigurowalne i nie deklarują zgodności z konkretnym producentem. Nie dopisuj portów przy wyczerpaniu profilu. Zmiany klasy PoE, prędkości albo granic modułów wymagają sprawdzenia dokumentacji i przypadków brzegowych w testach.

## Test dostępności interfejsu

Po instalacji zależności pobierz Chromium poleceniem `npx playwright install chromium`. `npm run test:ui` uruchamia osobny serwer Vite na porcie 4180 i testuje aplikację w izolowanym profilu przeglądarki. Nie korzysta z projektu zapisanego w przeglądarce użytkownika. Serwer i przeglądarka są zamykane po teście.

Test obejmuje pasek narzędzi przy szerokościach 390, 768, 1024 i 1440 px, zakładki wszystkich 15 typów urządzeń, pola portów i IP, listę kabli, nawigację z diagnostyki, zapis i cofnięcie kabla oraz wybór kart i ślad pakietu w symulacji. Plik: `scripts/check-ui.mjs`. W razie błędu zapisuje zrzut `/tmp/netweave-ui-failure.png`.

Po `npm run build` można sprawdzić także produkcyjny pakiet: `npm run test:ui -- --preview`. Zmienna `NETWEAVE_TEST_URL` pozwala wskazać już uruchomioną lokalną aplikację; wówczas skrypt nie uruchamia własnego serwera.

`PortPanel` jest wspólny dla edycji urządzenia, kabla i obu kroków łączenia. `portConnections.ts` waliduje wybrane końce przed atomowym dodaniem kabla; nie rezerwuj portu po samym wyborze pierwszego urządzenia. `PortConnectionDialog` pokazuje zgodność profilu i zapisuje dopiero po zatwierdzeniu obu końców. Test UI sprawdza również kolory/oznaczenia gniazd, zajętość, jawne końce, anulowanie, DAC i przypisanie VM.

Fabryka `createDemoNetwork` definiuje 32 urządzenia, 7 VLAN-ów, jawne porty/trunki i 24 scenariusze. Polityki i wymagania przykładu: [DEMO_NETWORK.md](./DEMO_NETWORK.md). `demoAcceptance.test.ts` obejmuje uprawnienia, DHCP, PoE, awarie istniejących łączy i rozdzielenie obszarów. Przy zmianie polityk demo testy innych mechanizmów powinny jawnie skonfigurować własne wymagane zezwolenia/porty, zamiast polegać na szerokim permit w przykładzie.

## Przykłady i nauka

[EXAMPLE_PROJECTS.md](./EXAMPLE_PROJECTS.md) opisuje katalog w `src/examples/catalog.ts`, fabryki i scenariusze. `Network.exampleId` identyfikuje wzorzec również po imporcie; nie jest uprawnieniem ani wynikiem walidacji. Panel symulacji pobiera scenariusze z katalogu zamiast rozpoznawać tylko pierwotny projekt.

Treść poradnika jest w `src/learning/guideContent.ts`. `npm run docs:guide` generuje z niej [NETWORK_GUIDE.md](./NETWORK_GUIDE.md), aby instrukcja w aplikacji i w repozytorium miała jedno źródło. `FieldHelp` używa natywnego popover w top layer, aby działać nad modalnymi dialogami. Jego klawiaturowy trigger nie jest natywnym elementem labelable — nie przejmuje powiązania etykiety z inputem. Kontrolki zachowują także natywny `title`.

`SettingsSection` porządkuje adresację, bramę, DHCP, DNS, parametry fizyczne i VLAN w portach. ACL ma osobne karty reguł z widocznymi etykietami; kolejność w danych pozostaje kolejnością wykonania. Zapis nadal zatwierdza kopię roboczą i podlega undo/redo.
