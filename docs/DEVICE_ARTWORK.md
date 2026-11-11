# Grafiki urządzeń i ikony interfejsu

W aplikacji są dwa niezależne źródła grafiki:

- **Urządzenia na planszy:** autorskie, izometryczne rysunki SVG w `src/BuiltinDeviceGlyph.tsx`. Nie są pobierane z Isoflow ani Networksim. Bryła, porty, ekran, antena i inne szczegóły są zapisane jako elementy SVG w JSX.
- **Ikony przycisków:** pakiet `@phosphor-icons/react`, np. `Play`, `GearSix`, `Trash`, `Network`. Ich importy znajdują się w odpowiednich komponentach React. Nie odpowiadają za bryły urządzeń.

## Podmiana urządzeń na własne pliki

1. Utwórz katalog `public/devices` i umieść w nim grafiki, np. `router.svg`, `server.webp`, `camera.png`.
2. W `src/deviceArtwork.ts` dodaj wpis dla wybranego rodzaju:

```ts
export const deviceArtwork: Partial<Record<Kind, DeviceArtwork>> = {
  router: {
    src: '/devices/router.svg',
    x: -48,
    y: -75,
    width: 96,
    height: 100,
  },
  server: {
    src: '/devices/server.webp',
    x: -48,
    y: -85,
    width: 96,
    height: 110,
  },
};
```

3. Uruchom aplikację. Jeden wpis działa równocześnie w bibliotece, podglądzie dialogu i na planszy, bo wszystkie używają `DeviceGlyph`.
4. Jeśli usuniesz wpis, automatycznie wróci oryginalny rysunek wektorowy. Brakujący plik pod wskazaną ścieżką trzeba poprawić — ten przypadek nie przełącza automatycznie na SVG.

Klucze to rodzaje z `Kind`: `internet`, `gateway`, `router`, `firewall`, `switch`, `switch-l3`, `switch-unmanaged`, `server`, `workstation`, `accesspoint`, `vm`, `printer`, `dns`, `camera`. Wpis zastępuje grafikę całego rodzaju; nie jest ustawieniem pojedynczego urządzenia zapisanym w JSON.

## Rozmiar i punkt zaczepienia

Plansza jest SVG, a pozycja urządzenia oznacza lokalny punkt `(0, 0)`. Dobierz `x`, `y`, `width` i `height` tak, żeby podstawa grafiki wypadała blisko tego punktu. Połączenia i pakiety nadal korzystają z pozycji urządzenia, nie z geometrii obrazka.

Biblioteka używa `viewBox="-55 -85 110 120"`. Grafika wystająca daleko poza ten obszar może zostać ucięta w miniaturze lub zasłonić etykietę na planszy. Przykładowe wymiary są punktem wyjścia — wymagają dopasowania do marginesów konkretnego pliku. Proporcje są zachowywane przez `preserveAspectRatio="xMidYMid meet"`.

Najlepiej sprawdzają się przezroczyste tło, spójny kąt izometrii, skala i kierunek światła. SVG pozostaje ostry przy zoomie. PNG/WebP mogą przedstawiać bardziej rozbudowane rendery 3D, ale przy dużym powiększeniu zależą od rozdzielczości. Własny obrazek ma zapisane kolory, więc parametr `color` katalogu go nie przemalowuje. Stan offline i zaznaczenie nadal obsługuje plansza.

Nie ma tu silnika WebGL ani obsługi modeli `.glb`/`.gltf`. Render takiego modelu można wyeksportować jako obraz z przezroczystym tłem i użyć w rejestrze. Nie trzeba zmieniać logiki sieci, DHCP, połączeń ani symulacji.

## Edycja obecnych SVG

Jeśli chcesz zachować wektorowe bryły i zmienić tylko detale, edytuj `BuiltinDeviceGlyph.tsx`. Kolory rodzajów są w `deviceCatalog.ts`. Główne elementy to wspólna podstawa, trzy ściany bryły oraz warunkowo rysowane detale danego rodzaju. `DeviceGlyph.tsx` powinien pozostać wspólnym wejściem renderowania.

Ikony przycisków podmieniaj osobno w ich komponentach React. Własny komponent SVG może zastąpić ikonę Phosphor bez zmieniania grafiki urządzeń.
