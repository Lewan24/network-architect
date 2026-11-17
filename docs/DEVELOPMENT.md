# Rozwój projektu

React + TypeScript + Vite, bez backendu. Dane pozostają lokalnie w przeglądarce; `Network` jest eksportowany do JSON i zapisywany w localStorage pod kluczem `netweave-project`.

## Mapa kodu

| Obszar                            | Odpowiedzialność                                               |
| --------------------------------- | -------------------------------------------------------------- |
| `src/app/`                        | Narzędzia, zaznaczenie, dialogi i tryb zaawansowany            |
| `src/project/`                    | Edycja obiektów i VLAN-ów, autosave, import/eksport, undo/redo |
| `src/model/`                      | Typy, walidacja, IPv4, porty, DHCP, DNS, Wi-Fi/PPSK i RADIUS   |
| `src/simulation/`                 | Silnik komunikacji, panel wyników, skan i zegar animacji       |
| `src/editors/`, `src/components/` | Formularze i wspólne kontrolki                                 |
| `src/canvas/`                     | Plansza SVG, geometria, gesty i obszary VLAN                   |
| `src/devices/`, `public/devices/` | Katalog, renderer i grafiki urządzeń                           |
| `src/examples/`, `src/learning/`  | Fikcyjne topologie, scenariusze i poradnik                     |
| `src/tests/`, `scripts/`          | Testy modelu, próbki, testy przeglądarkowe i eksport poradnika |

Dialog edytuje kopię roboczą. Zapis uzupełnia sprzęt i MAC, przelicza dostęp oraz DHCP i dodaje migawkę historii. Okresowe odnowienie dzierżawy nie jest zmianą użytkownika. Symulacja oblicza wynik niezależnie od tempa animacji.

`networkTypes.ts` definiuje dane, `network.ts` walidację i wspólne eksporty. `ports.ts` odpowiada za fizyczny stan i VLAN-y, `interfaces.ts` za wybór kart i tymczasowych klientów DHCP per NIC. `wifi.ts` oraz `accessMembership.ts` wyznaczają VLAN klienta. `radius.ts` sprawdza AAA przez sondy silnika z `controlPlane`, bez rekurencyjnego ponawiania uwierzytelniania.

## Zasady zmian

- Zachowuj stabilne ID i twórz nowe obiekty zamiast mutować zapisany projekt. Odwołują się do nich ACL, DNS, trasy i VM.
- Przy zmianie schematu aktualizuj `parseNetwork`, walidację, migrację i usuwanie zależności VLAN-ów.
- Typ urządzenia określa możliwości; sama ikona nie nadaje routingu, DHCP ani ACL.
- Dla hostów z wieloma kartami używaj `belongsToVlan`; `Device.ip/vlan/ipMode/lease` są aliasami pierwszej karty.
- Testuj dozwolone i zabronione połączenia oraz odpowiedź. Fabryki przykładów powinny zwracać niezależne dane.
- Próbki testowe muszą być fikcyjne i samodzielne, bez danych klientów i zależności od ich eksportów.
- Zachowuj kompaktowe formularze, etykiety dostępności, fokus, obsługę klawiatury i układ mobilny. Dane przykładowe nie są ustawieniami fabrycznymi producentów.

## Polecenia

| Polecenie                                 | Cel                                      |
| ----------------------------------------- | ---------------------------------------- |
| `npm run dev`                             | Lokalny serwer Vite                      |
| `npm test`                                | Testy Vitest                             |
| `npm run typecheck`                       | Sprawdzenie TypeScript                   |
| `npm run build`                           | Build produkcyjny do `dist/`             |
| `npm run format:check` / `npm run format` | Kontrola / zapis formatowania            |
| `npm run test:ui`                         | Pełny test przeglądarkowy                |
| `npm run test:ppsk-ui`                    | Edytory PPSK, VLAN/DHCP i zapis projektu |
| `npm run docs:guide`                      | Odtworzenie skróconego indeksu poradnika |

Testy UI wymagają Chromium: `npx playwright install chromium`. Używają izolowanych profili, lokalnych serwerów na portach 4180 i 4181 oraz zrzutów w `/tmp/`. `npm run test:ui -- --preview` sprawdza wcześniejszy build; `NETWEAVE_TEST_URL` wskazuje istniejący serwer dla pełnego testu UI.

## Grafiki i treść poradnika

Własne PNG, SVG lub WebP umieść w `public/devices/` i przypisz w `src/devices/deviceArtwork.ts`. Dopasuj `x`, `y`, `width`, `height` do przezroczystych marginesów; punkt `(0, 0)` jest zaczepieniem połączeń. `DeviceGlyph.tsx` obsługuje bibliotekę, planszę i dialogi. Brak wpisu używa `BuiltinDeviceGlyph.tsx`; błędna ścieżka nie uruchamia fallbacku. Ikony interfejsu są niezależne od grafik urządzeń. Style znajdują się w `src/styles/`.

Pełna treść poradnika ma jedno źródło: `src/learning/guideContent.ts`. Po jej zmianie uruchom `npm run docs:guide`. Wygenerowany [indeks](NETWORK_GUIDE.md) zawiera skrót i odsyłacze; nie powiela całego poradnika ani konfiguracji konkretnych organizacji.
