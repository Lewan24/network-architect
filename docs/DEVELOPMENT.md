# Przewodnik po kodzie

Projekt to aplikacja React + TypeScript działająca lokalnie w przeglądarce. Model sieci i silnik symulacji są niezależne od Reacta. Zapis projektu pozostaje zgodny z dotychczasowym JSON-em i kluczem `netweave-project` w localStorage.

## Od czego zacząć

| Obszar                  | Pliki                                                                                                                              | Odpowiedzialność                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Start aplikacji         | `src/main.tsx`                                                                                                                     | Montuje Reacta i ładuje CSS.                                                            |
| Koordynacja edytora     | `src/App.tsx`                                                                                                                      | Wybór narzędzia, zaznaczenie, otwieranie dialogów i łączenie akcji z interfejsem.       |
| Projekt i zapis         | `src/useProject.ts`, `src/projectHistory.ts`                                                                                       | Wczytanie, autosave, historia do 50 zmian i okresowe odnowienie DHCP.                   |
| Edycja danych           | `src/projectActions.ts`                                                                                                            | Tworzenie, kopiowanie i usuwanie urządzeń, odpinanie VM. Funkcje zwracają nowe dane.    |
| Model                   | `src/networkTypes.ts`                                                                                                              | Typy urządzeń, VLAN-ów, reguł, testów i wyników. Bez Reacta i kodu wykonawczego.        |
| Katalog urządzeń        | `src/deviceCatalog.ts`                                                                                                             | Nazwy, opisy, kolory i domyślne usługi.                                                 |
| Sieć i walidacja        | `src/network.ts`, `src/addressing.ts`                                                                                              | Import JSON, walidacja, topologia, adresy IPv4 i podsieci.                              |
| Symulacja               | `src/networkEngine.ts`                                                                                                             | Planowanie ścieżki, routing, translacje NAT, ACL, usługi i odpowiedź.                   |
| DHCP i DNS              | `src/dhcp.ts`, `src/dns.ts`                                                                                                        | Przydział dzierżaw i rozwiązywanie nazw przez rzeczywiście osiągalny resolver w modelu. |
| Internet                | `src/internetModel.ts`, `src/internetTraffic.ts`                                                                                   | Domyślne źródło, pojedynczy brzeg WAN i generowanie losowych prób.                      |
| Odtwarzanie testów      | `src/useSimulation.ts`, `src/simulationTiming.ts`                                                                                  | Historia wyników, harmonogram odtwarzania i wspólny zegar animacji.                     |
| Plansza                 | `src/NetworkCanvas.tsx`, `src/canvasGeometry.ts`, `src/networkGroups.ts`                                                           | SVG, gesty, zoom, przeskoki pakietu i przesuwanie sekcji.                               |
| Dialogi                 | `DeviceDialog`, `AclEditor`, `NatEditor`, `RoutingEditor`, `DnsEditor`, `ServicesEditor`, `NetworkScopes`, `LinkDialog`, `dialogs` | Oddzielne formularze konfiguracji.                                                      |
| Drobne elementy edytora | `src/components/`                                                                                                                  | Biblioteka urządzeń, pomoc i obsługa menu kontekstowego.                                |
| Grafiki                 | `DeviceGlyph`, `BuiltinDeviceGlyph`, `deviceArtwork`                                                                               | Wspólne wejście renderowania, oryginalne SVG i rejestr własnych plików.                 |
| Przykłady               | `src/demoNetwork.ts`, `src/ExampleMenu.tsx`                                                                                        | Fabryki nowych projektów i scenariusze testów.                                          |
| Dane regresyjne         | `src/fixtures/legacyNetwork.ts`                                                                                                    | Stary projekt do testów zgodności; nie jest projektem wybieranym z menu.                |

`network.ts` zachowuje część eksportów typów i pomocników dla wygody istniejących modułów. Nowy kod może importować typy bezpośrednio z `networkTypes.ts`, a obliczenia IPv4 z `addressing.ts`. Silnik importuje model, model nie importuje silnika.

## Przepływ zmian

1. Dialog pracuje na kopii roboczej; anulowanie nie modyfikuje projektu.
2. Zatwierdzenie trafia do `commit` w `App`, które przerywa trwającą symulację.
3. `useProject.commit` uzupełnia domyślny Internet, przelicza DHCP, zapisuje migawkę historii i usuwa gałąź redo.
4. Autosave zapisuje JSON po krótkiej przerwie. Samo okresowe odnowienie dzierżawy nie dodaje kroku cofania.
5. Silnik symulacji liczy wynik modelu. Hook odtwarza go z animacją, pokazując wynik dopiero na końcu.

Tempo animacji zmienia zegar prezentacji, a nie decyzje ACL czy routingu. Przy zmianie tempa `retimeFlight` zachowuje naliczony czas logiczny. Canvas i dziennik korzystają z tych samych stałych czasu.

## Zasady przy rozbudowie

- Nie zmieniaj urządzeń ani VLAN-ów w miejscu. Zachowuj stabilne ID; odwołują się do nich ACL, DNS, trasy i hosty VM.
- Dodając rodzaj urządzenia, zacznij od `Kind`, katalogu i grafiki. Potem określ jego możliwości w modelu: routing, ACL, DHCP, usługi i przekazywanie ruchu. Nowa ikona sama nie nadaje tych możliwości.
- Dodając przykład, dopisz fabrykę do `networkExamples`. Fabryka powinna za każdym razem tworzyć niezależne obiekty.
- Zmieniając format JSON, utrzymaj migrację w `parseNetwork` i dodaj test importu starego projektu.
- Dla zmian protokołów testuj zarówno dozwolony ruch, jak i blokady oraz drogę powrotną. Pomyślny wynik modelu nie zastępuje testu fizycznych urządzeń.
- Style pozostają w `workspace.css`, z klasami odpowiadającymi komponentom; refaktoryzacja nie wprowadza nowego systemu wizualnego.

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
