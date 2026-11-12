# Projekty i laboratoria edukacyjne

W menu **Przykład** są projekty praktyczne, celowo błędny antywzorzec i rozwijana grupa małych laboratoriów. Przycisk **Poradnik** otwiera plan projektowania, omówienia rozwiązań, źródła oraz porównanie „problem → naprawa”. Każdy wariant jest normalnym edytowalnym projektem: można zmienić reguły, uruchomić pakiet, eksportować JSON i cofać zmiany.

## Projekty praktyczne

| Projekt                | Zakres                                                  | Co sprawdzić                                                                                                                            |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Biuro, serwery i Wi-Fi | 22 urządzenia, 7 VLAN-ów, Hyper-V, drukarka, kamery PoE | Istniejące laboratorium i jego 24 scenariusze; szczegóły w [DEMO_NETWORK.md](./DEMO_NETWORK.md)                                         |
| Mała firma             | 17 urządzeń, 6 VLAN-ów                                  | Administracja, drukowanie IPP, udziały SMB, odizolowani goście, NVR i dwie kamery; firewall → ACL, switch → Porty i PoE, VLAN 10 → DHCP |
| Home lab               | 13 urządzeń, 5 VLAN-ów                                  | Proxmox z VM Home Assistant, NAS, prywatny DNS home.arpa, odseparowane IoT i piaskownica; panel hosta tylko dla administratora          |
| Duża firma             | 35 urządzeń, 9 VLAN-ów                                  | DMZ → aplikacja → dane, dwie zapory, bastion, kopie zapasowe, pliki, drukarki, CCTV i goście; trasa do danych i reguły obu zapór        |
| Antywzorzec            | 10 urządzeń, 2 VLAN-y (LAN i infrastruktura)            | Goście, kamera i pliki w jednej domenie L2; otwarte SSH z WAN, permit any i aktywne nieużywane porty                                    |

Projekty stosują jeden główny switch dystrybucyjny. Przykład duży ma profil 48 portów RJ45 oraz dwa SFP+; nie udaje wdrożenia z HA, STP czy LACP. Zapas gniazd w poprawnych projektach jest administracyjnie wyłączony. Trunki mają jawną listę VLAN-ów i tagowany VLAN zarządzania 99, zgodnie z możliwościami modelu; rzeczywiste zachowanie native/tagging trzeba potwierdzić dla sprzętu.

## Duża firma: konkretne granice

Firewall brzegowy publikuje tylko HTTPS reverse proxy w DMZ. Proxy może połączyć się z backendem TCP/8443, ale nie z bazą. Aplikacja łączy się z PostgreSQL TCP/5432 przez zaporę brzegową i wewnętrzną zaporę danych. Pracownik, gość i proxy nie mają bezpośredniego dostępu do bazy. Bastion i stacja administratora mają jawne uprawnienia zarządzania. Kopie mogą pobierać pliki z NAS po SMB, NVR może pobierać RTSP z kamer. Pozostałe wyjątki obejmują niezbędny DNS.

To osobne połączenia aplikacyjne. Symulator nie uruchamia reverse proxy ani automatycznego przekazania jednego zapytania HTTP aż do bazy. Każdy etap ma własny scenariusz i sprawdzaną odpowiedź. Hosty w jednym VLAN-ie nadal komunikują się w L2; przykład nie zastępuje zapory systemowej i mikrosegmentacji. Bastion jest endpointem SSH z uprawnieniami sieciowymi; nie jest emulatorem VPN ani logowania użytkowników.

Cztery kamery po 12 W PD rezerwują razem 61,6 W PSE przy budżecie 90 W. W małej firmie dwie kamery po 10 W PD mieszczą się w 45 W budżetu (alokacja 30,8 W PSE). Takie profile trzeba dopasować do danych rzeczywistego urządzenia.

## Celowo błędny projekt

W antywzorcu sukces testu gość → pliki oznacza niepożądaną łączność. Reguła deny na firewallu nie jest na ścieżce, ponieważ oba hosty są w VLAN 10. Drugi test pokazuje kamerę sięgającą panelu plików, trzeci — publiczne WAN:2222 prowadzące do SSH/22. Samo przeniesienie panelu na inny numer portu go nie zabezpiecza.

Projekt jest wyróżniony na planszy i w katalogu jako celowo błędny. Diagnostyka konfiguracji może nie zgłaszać żadnego błędu fizycznego — nie jest audytem wymagań biznesowych. Porównaj go z małą firmą i parami laboratoriów.

## Sześć par laboratoriów

1. **VLAN i granica L2:** hosty w tej samej sieci omijają firewall; po rozdzieleniu SSH jest blokowane, a HTTPS pozostaje dostępny.
2. **Trunk i allowed VLAN:** brak VLAN-u na jednym końcu blokuje usługę; uzgodnienie list przywraca HTTPS.
3. **VLAN a ACL:** różne VLAN-y z permit any nadal dają nadmierny dostęp; default deny i wyjątek HTTPS ograniczają SSH.
4. **DHCP i DNS:** brak zakresu pozostawia klienta bez IP; poprawiony przydział i resolver umożliwiają test nazwy.
5. **NAT:** publikacja panelu SSH jest usuwana; publiczny HTTPS pozostaje osiągalny.
6. **PoE:** budżet 10 W PSE nie zasili kamery 12 W PD; poprawiony 30 W budżet wystarcza.

Poradnik wyjaśnia kroki, oczekiwania, powody i ograniczenia. W każdym wariancie przyciski wskazują konkretny port, ACL, NAT lub sieć/DHCP. Wczytanie z testem przygotowuje panel symulacji; pakiet wysyła użytkownik.

## Kod i utrzymanie

- `src/examples/catalog.ts`: wspólny katalog projektów, celów nauki, sekcji i scenariuszy.
- `exampleBuilder.ts`: jawne porty, VLAN-y i adresowanie; fabryki nie współdzielą mutowalnego projektu.
- `smallBusiness.ts`, `homeLab.ts`, `enterprise.ts`, `antiPattern.ts`: samodzielne projekty.
- `miniLabs.ts`: warianty porównawcze z identycznym zamiarem testu i inną konfiguracją.
- `src/learning/guideContent.ts`: źródło tekstu poradnika i odnośników.
- `LearningCenter.tsx`: dostęp z aplikacji, miniatury topologii i nawigacja do ustawień.
- `FieldHelp.tsx`: objaśnienia z klawiatury, po najechaniu na ikonę i natywne podpowiedzi pól; Escape zamyka objaśnienie przed dialogiem.
- `SettingsSection.tsx`: wspólny wygląd sekcji konfiguracji.

Opcjonalny `Network.exampleId` zachowuje pochodzenie przykładu w eksporcie i imporcie. Nie wpływa na reguły sieci ani nie zezwala omijać walidacji. Scenariusz pokazuje oczekiwanie dla wzorca; własne zmiany mogą zmienić wynik. Starszy projekt biurowy bez tego pola nadal jest rozpoznawany po jego urządzeniach.

Testy `exampleCatalog.test.ts` sprawdzają import, niezależność fabryk, sekcje, wszystkie zadeklarowane przepływy i brak problemów diagnostycznych w poprawnych wariantach. `scripts/check-ui.mjs` sprawdza także wczytanie projektów z menu, rzeczywiste testy pakietów, poradnik na desktopie/mobile, porównanie wariantów, tooltip w zagnieżdżonym dialogu i zapis/cofnięcie karty ACL.
