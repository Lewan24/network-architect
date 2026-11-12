# Grafiki urządzeń i ikony interfejsu

Urządzenia korzystają z plików w `public/devices/`. Rejestr `src/devices/deviceArtwork.ts` przypisuje grafikę i jej położenie do rodzaju urządzenia. `DeviceGlyph.tsx` renderuje ją na planszy, w bibliotece i podglądach dialogów. Rodzaj bez wpisu korzysta z wektorów w `BuiltinDeviceGlyph.tsx`.

Ikony przycisków pochodzą z `@phosphor-icons/react` i są niezależne od grafik urządzeń.

## SVG i PNG jednocześnie

**Tak — można dowolnie mieszać SVG, PNG i WebP.** Nie trzeba konwertować PNG do SVG ani zmieniać renderera. Każdy wpis ma własną ścieżkę:

```ts
router: {
  src: '/devices/router.png',
  x: -63.97,
  y: -79.92,
  width: 130.37,
  height: 97.77,
},
server: {
  src: '/devices/rack-server.png',
  x: -56.59,
  y: -74.19,
  width: 113.18,
  height: 113.18,
},
```

Obecny zestaw zawiera wyłącznie PNG; stare pliki SVG zostały usunięte. `rack.png` jest ikoną szafy (wcześniej `server.png`), a `rack-server.png` ikoną serwera rackowego. Wpisy uwzględniają proporcje plików i widoczną bryłę po pominięciu niemal przezroczystych marginesów. SVG lub WebP można nadal dodać, podając ścieżkę do nowego pliku zamiast PNG.

1. Umieść plik, np. `rack-server.png`, w `public/devices/`.
2. Zmień `src` odpowiedniego wpisu w `src/devices/deviceArtwork.ts`.
3. Dopasuj `x`, `y`, `width`, `height` do widocznej grafiki i jej przezroczystych marginesów.
4. Sprawdź bibliotekę, dialog i planszę. Jeden wpis obsługuje wszystkie trzy miejsca.

Preferuj przezroczyste tło. PNG z białym tłem pokaże biały prostokąt. Dla rastrów warto przygotować obraz 512 × 512 lub większy: PNG może tracić ostrość przy dużym zoomie, a SVG skaluje się bez tego ograniczenia. Różne proporcje są obsługiwane przez `preserveAspectRatio="xMidYMid meet"`.

Podmiana dotyczy całego rodzaju urządzeń, nie pojedynczego obiektu w JSON. Pliki są częścią aplikacji; nie ma formularza przesyłania ikon. Usunięcie wpisu przywraca wektor wbudowany. Błędna ścieżka do pliku nie uruchamia automatycznie fallbacku.

## Rozmiar i punkt zaczepienia

Pozycja urządzenia na planszy to lokalny punkt `(0, 0)`, używany też przez połączenia i pakiety. Obecne PNG mają płótna 1254 × 1254, 1448 × 1086 albo 1086 × 1448 i różne marginesy. W rejestrze zachowane są proporcje każdego pliku; podane wymiary obejmują przezroczyste marginesy. Wpisy są dopasowane osobno: widoczna bryła jest wyśrodkowana w poziomie, jej podstawa wypada blisko `y = 12`, a cień poniżej. Płaskie switche mają większą szerokość, serwer i telefon zachowują pionowe proporcje.

- `width`, `height`: rozmiar całego obrazu, razem z marginesami.
- `x`, `y`: pozycja lewego górnego rogu obrazu względem urządzenia.
- `DEVICE_VIEW_BOX`: wspólne kadrowanie miniaturek i podglądów (`-65 -95 130 130`).

Większe `x` przesuwa obraz w prawo, większe `y` w dół. Zmiana rozmiaru może wymagać ponownego dopasowania pozycji. Dla PNG najłatwiej najpierw usunąć zbędne przezroczyste marginesy w edytorze grafiki.

Dostępne rodzaje są zapisane w `src/model/networkTypes.ts` (`Kind`), w tym `mobile-phone`. Nazwy, opisy, kolory i domyślne usługi znajdują się w `src/devices/deviceCatalog.ts`.

Własny obraz ma zapisane kolory, więc parametr `color` go nie przemalowuje. Stan offline i zaznaczenie nadal obsługuje plansza. Render modelu 3D można wyeksportować do przezroczystego PNG; aplikacja nie ładuje modeli `.glb`/`.gltf`.
