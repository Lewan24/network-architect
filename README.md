# Netweave

Lokalna aplikacja React + TypeScript do projektowania sieci i modelowej symulacji komunikacji. Projekty zapisują się w przeglądarce; import i eksport korzystają z JSON. Aplikacja nie wysyła rzeczywistych pakietów.

## Uruchomienie

```sh
npm install
npm run dev
```

Otwórz adres pokazany przez Vite. `npm run build` tworzy statyczną aplikację w `dist/`.

## Praca z aplikacją

1. Dodaj urządzenia i połącz ich porty.
2. Skonfiguruj VLAN-y, bramy, DHCP i DNS w **Sieci i VLAN-y**.
3. Ustaw porty access/trunk, usługi i reguły ACL.
4. W **Symulacji** wybierz źródło, cel, protokół i port; sprawdź także odpowiedź.
5. Zapisz scenariusze, aby powtarzać testy po zmianach.

**Tryb zaawansowany** udostępnia szczegółowe ustawienia sprzętu i sieci. **Diagnostyka** wskazuje problemy konfiguracji. **Przykłady** i **Poradnik** zawierają fikcyjne topologie oraz laboratoria z wariantami błędnymi i poprawionymi.

## Dokumentacja

| Dokument                                    | Zakres                                              |
| ------------------------------------------- | --------------------------------------------------- |
| [Konfiguracja sieci](docs/CONFIGURATION.md) | VLAN, routing, ACL, DHCP/DNS, NAT, VM i diagnostyka |
| [Wi-Fi i dostęp](docs/WIFI.md)              | SSID, PPSK, RADIUS, MAB i MAC                       |
| [Rozwój projektu](docs/DEVELOPMENT.md)      | Mapa kodu, testy, grafiki i zasady zmian            |
| [Indeks poradnika](docs/NETWORK_GUIDE.md)   | Skrót lekcji i źródła techniczne                    |

## Weryfikacja

```sh
npm test
npm run build
```

Testy przeglądarkowe i pozostałe polecenia opisano w [instrukcji developerskiej](docs/DEVELOPMENT.md#polecenia).

Model sprawdza logiczną konfigurację IPv4, a nie firmware konkretnego urządzenia. Hasła demonstracyjne i shared secret są jawne w projekcie oraz eksporcie; używaj danych testowych. Przykłady w repozytorium nie powinny zawierać danych rzeczywistych organizacji.
