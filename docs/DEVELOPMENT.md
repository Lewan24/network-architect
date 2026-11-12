# Przewodnik po kodzie

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
