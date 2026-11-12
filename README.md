# Netweave

Lokalna aplikacja React + TypeScript do projektowania izometrycznych topologii sieci oraz symulacji przepływu pakietów.

Dla dalszej rozbudowy: [mapa kodu i zasady pracy](docs/DEVELOPMENT.md) oraz [źródła ikon i podmiana grafik urządzeń](docs/DEVICE_ARTWORK.md).

## Aplikacja demo do testów i sprawdzenia możliwości

https://network-architect.lewanmordor.workers.dev

## Uruchomienie

```sh
npm install
npm run dev
```

Otwórz adres pokazany przez Vite. Weryfikacja: `npm test` i `npm run build`. Katalog `dist` zawiera produkcyjną aplikację statyczną.

## Możliwości

- Izometryczne urządzenia: internet (nadawca zewnętrzny), wspólny router/firewall brzegowy, router wewnętrzny, firewall, switch L2 zarządzalny, L2 niezarządzalny, L3 zarządzalny, serwer, komputer, AP Wi-Fi, VM, drukarka, serwer DNS, kamera IP i telefon komórkowy (klient Wi-Fi). Router i firewall mogą mieć rolę brzegową lub wewnętrzną; jedno urządzenie może realizować WAN, routing, NAT, ACL i DHCP.
- Dodawanie kliknięciem lub przeciągnięciem, przesuwanie urządzeń, łączenie, usuwanie, powiększanie i przesuwanie canvasu.
- Kompaktowa biblioteka urządzeń, duży canvas i edycja przez dwuklik / Enter / menu kontekstowe. Prawy panel służy wyłącznie symulacji i pojawia się po jej otwarciu. Pokazuje aktualny pakiet, przeskoki, wynik, liczniki i rozwijaną historię. Dolnego monitora nie ma.
- Wspólna konfiguracja VLAN-ów (1–4094): karty z podsumowaniem podsieci, bramy, DHCP, DNS i urządzeń; osobny dialog edycji każdej sieci. Obszary na planszy mają obrys izometryczny; 0 oznacza brak VLAN-u / WAN.
- Zwykłe nowe urządzenia mają domyślnie DHCP. Canvas pokazuje przy IP `DHCP` lub `STATIC`, a bez dzierżawy — oczekiwanie na adres. Statyczne IP włącza się osobno w dialogu. Urządzenia infrastruktury L3 mają domyślnie adres statyczny; switch niezarządzalny nie ma IP.
- DHCP wymaga skonfigurowanego, aktywnego serwera i połączenia L2 w odpowiednim VLAN-ie albo relay L3. Pula ma początek, koniec i czas dzierżawy. Model przechodzi logiczne DISCOVER/OFFER/REQUEST/ACK, rezerwuje bramę, sieć i broadcast, unika zajętych IP, zapisuje dzierżawy i odnawia je po połowie czasu. Ważna dzierżawa nie znika przy awarii serwera; po wygaśnięciu klient bez odpowiedzi nie ma adresu.
- Zakładka „Sieci i DHCP” routera/firewalla, switcha L3 lub serwera udostępnia wspólną konfigurację podsieci, serwera DHCP i relay. „Dodaj sieć” tworzy m.in. konfigurowalną sieć 192.168.0.0/24. Wskazanie urządzenia bramy tworzy logiczny interfejs L3/SVI z podanym adresem bramy. Switch L2 przenosi broadcasty i VLAN-y, lecz nie staje się przez to routerem ani serwerem DHCP.
- Nazwy, stan online/offline oraz konfiguracja urządzeń w dialogu z zatwierdzaniem i anulowaniem zmian.
- ACL firewalla, routera i switcha L3: permit/deny, protokół, port i pochodzenie ruchu (Internet/LAN/dowolne). Źródło i cel wybiera się jako urządzenie, cały VLAN, dowolny adres lub własny IPv4/CIDR. Odwołanie do urządzenia aktualizuje się wraz z jego adresem DHCP; odwołanie do VLAN-u obejmuje jego podsieć. Pierwsze dopasowanie wygrywa. Domyślnie obowiązuje `deny any`; jawne `permit any` z istniejących konfiguracji pozostaje zachowane.
- Firewall: adres WAN, włączane/wyłączane przekierowania TCP/UDP (publiczny IP:port → prywatny IP:port) i static NAT 1:1. Test publicznego IP realizuje DNAT na firewallu, następnie ACL na przetłumaczonym celu. Wyjście mapowanego hosta do internetu realizuje SNAT po ACL. Port forwarding ma pierwszeństwo przed static NAT.
- Router i switch L3: automatyczny wybór z topologii lub tablica tras statycznych. Sieci własnych interfejsów L3 mają trasy connected również w trybie statycznym. Dla tras użytkownika najdłuższy prefiks wygrywa, następnie niższa metryka. Następny skok wskazuje bezpośredniego sąsiada. `0.0.0.0/0` jest trasą domyślną. Brak bramy, interfejsu SVI, trasy, skoku lub pętla L3 zatrzymują pakiet. Ponowne przejście przez switch L2 przy router-on-a-stick jest dozwolone.
- L2 zarządzalny przenosi wybrane VLAN-y bez routingu; pusta lista pozwala przenosić VLAN-y zgodnie z ustawieniami łączy. VLAN zarządzania jest niezależny od VLAN-ów przesyłanych przez switch. L3 przełącza ruch lokalny w L2, a przez skonfigurowane interfejsy SVI realizuje routing i ACL. Switch niezarządzalny ma jedną sieć dostępu, bez IP i testowania interfejsu zarządzania. Typ switcha można zmienić w dialogu.
- Serwer może być hypervisorem VMware ESXi, Proxmox VE, Hyper-V lub KVM. VM ma własny IP/VLAN i hosta; połączenie vNIC jest tworzone automatycznie i rysowane linią przerywaną. Wyłączenie hosta odcina gości. VLAN zarządzania hosta nie zastępuje VLAN-u VM. Goście w różnych VLAN-ach potrzebują urządzenia routującego. Z listy gości hosta można dodawać i edytować VM.
- AP ma SSID i osobny VLAN klientów (domyślnie taki sam jak VLAN zarządzania); działa jako most bez NAT. Drukarka jest osobnym urządzeniem końcowym.
- Test ICMP, TCP i UDP, animacja każdego przeskoku oraz opcjonalnie odpowiedzi i jej trasy (domyślnie włączona w UI). Firewall dopuszcza odpowiedź konkretnego dozwolonego testu przez stan połączenia i odwraca NAT. Routery wewnętrzne i switche L3 nadal sprawdzają ACL. Test TCP/UDP sprawdza deklarację aktywnej usługi na docelowym porcie. Wynik odróżnia ACL, zamknięty port i brak odpowiedzi; samo dostarczenie pakietu nie oznacza otwartego portu.
- Internet skanuje wyłącznie skonfigurowane publiczne adresy WAN i aliasy NAT, losując TCP/UDP/ICMP oraz popularne i losowe porty. Nie wybiera prywatnych hostów ani nie zna ich listy. Ręczny test z Internetu do prywatnego IP/ID także jest blokowany. Publiczny adres nadawcy na obiekcie Internet i publiczny adres WAN brzegu to dwa różne adresy. Bez port forwarding/static NAT albo jawnie opublikowanej usługi na brzegu ruch nie przechodzi do LAN. Prywatne źródło potrzebuje NAT wyjściowego do dostępu do internetu.
- Biblioteka urządzeń ma rozwijane kategorie i wyszukiwanie po nazwie, opisie i kategorii. Urządzenia dodaje się z biblioteki; menu pustej planszy zawiera ustawienia VLAN-ów i dopasowanie widoku. Menu urządzeń i połączeń udostępnia edycję, duplikowanie, łączenie, stan, źródło/cel testu i usuwanie. Po połączeniu dwóch urządzeń narzędzie wraca do Select. Dwuklik połączenia otwiera tryb obu portów: automatyczny, access z jednym VLAN-em albo trunk z listą VLAN-ów. Ustawienia wpływają na DHCP i ruch danych.
- Przesuwanie tła lewym przyciskiem; Spacja + przeciągnięcie, środkowy przycisk lub H również nad obiektami. Zoom kółkiem zachowuje punkt pod kursorem. Shift + kółko przesuwa widok. Strzałki przesuwają urządzenie z fokusem o 10 jednostek.
- Sekcję VLAN zaznacza się kliknięciem jej nagłówka lub tła. Przeciągnięcie przesuwa wszystkie urządzenia sekcji; strzałki przesuwają grupę, a cofnięcie przywraca całą operację.
- Domyślny Internet ma statyczny adres nadawcy 203.0.113.1 i jedno połączenie z routerem/firewallem. Połączenie automatycznie ustawia sąsiada jako brzeg i nadaje mu przykładowy WAN. Starszy projekt bez Internetu jest uzupełniany. Skan wybiera tylko WAN i aliasy NAT pierwszego urządzenia.
- Serwer DNS obsługuje edytowalne rekordy A wskazujące urządzenie lub IPv4. Resolver konfiguruje się w VLAN/DHCP albo u klienta. Zmiana opcji DHCP trafia do klienta przy odnowieniu dzierżawy. Test nazwy sprawdza UDP/53, a przy niepowodzeniu próbuje TCP/53. Własny resolver urządzenia obsługuje zapytanie lokalnie. Potem sprawdzana jest usługa docelowa. Animacja obejmuje oba etapy. Brak resolvera, usługi 53, rekordu lub połączenia zatrzymuje rozwiązywanie.
- „Resetuj” czyści sieć, pozostawiając Internet; „Przykład” ładuje gotowe laboratorium. Oba działania można cofnąć.
- Automatyczny zapis w localStorage, import/eksport JSON, cofanie/ponawianie do 50 zmian.
- Skróty: V – zaznaczenie, H – przesuwanie, C – łączenie, F – dopasuj sieć, Enter – edycja urządzenia z fokusem, Delete – usunięcie, Escape – anulowanie, Ctrl+Z – cofnij, Ctrl+Shift+Z – ponów.

Projekty bez listy VLAN-ów są migrowane: podsieci są wyprowadzane z adresów urządzeń, a adresy bez określonego trybu pozostają statyczne. Dawny tryb automatyczny oznacza teraz klienta DHCP, więc wymaga skonfigurowania puli i rzeczywiście osiągalnego serwera w modelu. Nie tworzymy serwera po cichu. Dzierżawy i ustawienia usług są przenoszone w JSON.

## Gotowe laboratorium

Otwórz menu **Przykład**, wybierz **Biuro, serwery i Wi-Fi**, następnie otwórz **Symulację** i wybierz scenariusz. Rejestr `networkExamples` w `src/examples/demoNetwork.ts` pozwala dodawać kolejne projekty do menu. Projekt zawiera 21 urządzeń: Internet → router brzegowy → firewall oraz VLAN 10 (biuro), 20 (serwery), 30 (CCTV), 40 (Wi-Fi pracowników), 50 (Wi-Fi gości) i 99 (tranzyt). Firewall zapewnia DHCP, routing i izolację kamer. Są DNS, Hyper-V z dwiema VM, NAS, NVR i dwie kamery DHCP.

AP `Firma-Staff` i laptop pracownika korzystają z VLAN 40, mają dostęp do usług LAN i Internetu. AP `Firma-Guest`, laptop gościa i osobny DNS gościnny są w VLAN 50. Reguły firewalla blokują gościom wszystkie trzy prywatne zakresy IPv4 przed regułą pozwalającą na Internet. DNS gościnny nie udostępnia stref LAN; rekord demonstracyjny `internet.example` wskazuje obiekt Internet. Izolacja dotyczy dostępu do pozostałych sieci, a nie izolacji klientów między sobą wewnątrz jednego SSID. AP jest mostem modelowym, bez radiowej propagacji.

VM Docker/Nginx Proxy Manager ma porty 80, 443, 81, 22 i 9090; router publikuje tylko 80/443. Panel 81 jest dostępny z LAN. To deklarowane usługi symulatora; aplikacje i kontenery nie są uruchamiane. Porty NPM odpowiadają [oficjalnej konfiguracji](https://nginxproxymanager.com/setup/).

DNS udostępnia m.in. `npm.lab.home.arpa`, `app.lab.home.arpa`, `hyperv.lab.home.arpa` i `kamera1.lab.home.arpa`. Rekord kamery śledzi jej aktualny adres DHCP. Dwanaście scenariuszy obejmuje także dostęp pracownika przez Wi-Fi, Internet dla gościa oraz blokady gość → serwer/pracownik.

Suwak **Tempo animacji** w panelu symulacji działa od 0,5× do 5×. Można go zmieniać w trakcie testu bez cofania pakietu. Wspólny zegar synchronizuje marker, przeskoki, zakończenie testu i odstępy pomiędzy losowymi pakietami. Tempo zmienia prezentację, nie wynik reguł sieciowych.

## Przykładowy test brzegu sieci

1. Kliknij „Resetuj”; Internet jest już na planszy. Dodaj Router/firewall, switch L2 i komputer. W routerze otwórz „Sieci i DHCP”, dodaj sieć LAN 192.168.0.0/24, przypisz router jako bramę i serwer DHCP oraz ustaw pulę 192.168.0.100–192.168.0.200.
2. Połącz Internet z brzegiem, brzeg ze switchem, switch z komputerem. Dla LAN ustaw access VLAN 1 lub trunk przenoszący VLAN 1. Komputer DHCP uzyska adres po znalezieniu serwera.
3. Ustaw publiczny WAN brzegu, np. 203.0.113.10, a Internet jako innego nadawcę, np. 198.51.100.200. To adresy dokumentacyjne używane wyłącznie w modelu. Pozostaw default ACL deny any; aby klient miał internet, dodaj permit dla LAN → any oraz włącz NAT wyjściowy.
4. Dodaj serwer ze statycznym 192.168.0.10 i usługą TCP/443. Opublikuj WAN:443 → 192.168.0.10:443 i dodaj WAN ACL permit TCP/443 do wybranego serwera.
5. Skan Internet → publiczny WAN:443 powinien dotrzeć do usługi i wrócić. Test na 3389 bez publikacji ma zostać zatrzymany na brzegu. Wyłączenie usługi 443 ma dać wynik „port zamknięty”, mimo poprawnych NAT i ACL.

## Zakres symulacji

To deterministyczna symulacja modelowa w przeglądarce, a nie emulator urządzeń. Nie wysyła prawdziwych pakietów. W trybie automatycznym wybiera ścieżkę BFS, a w trybie statycznym ogranicza jej wybór tablica routingu. NAT wymusza przejście przez właściciela mapowania. VLAN-y, ACL i translacje są sprawdzane po kolei na węzłach. Komputery, drukarki, VM i zwykłe serwery nie przekazują ruchu tranzytowego; hypervisor przekazuje go wyłącznie do/z własnych gości. Publiczny IP bez lokalnego mapowania może być testowany jako cel internetowy z urządzenia wewnętrznego.

Implementacja sprawdza logiczne warunki DHCP, L2/ARP, masek/bram, access/trunk, connected/static routing, DNAT/SNAT, ACL i deklarowanych usług. Stan odpowiedzi i odwrotne NAT istnieją w obrębie jednego testu. Obsługa WAN/LAN w ACL oznacza pochodzenie ruchu; model nie odtwarza kompletu osobnych interfejsów i stref konkretnego producenta.

Nie jest to pełna emulacja RouterOS, pfSense, IOS ani systemów gości. Brak rzeczywistych ramek, MAC/ARP cache, stosu TCP (SYN/ACK, retransmisje, okna, timery), trwałej tablicy conntrack, wielosesyjnego PAT, STP, dynamicznego routingu, rekurencyjnego DNS/DNSSEC/cache TTL, radiowej propagacji i rzeczywistych usług OS. DHCP jest modelem DORA/relay/dzierżaw, a nie implementacją datagramów RFC 2131; identyfikatorem klienta jest ID urządzenia. Lista usług opisuje model, nie uruchamia procesów. Test UDP weryfikuje deklarowaną usługę i ścieżkę odpowiedzi, nie przewiduje milczenia rzeczywistej aplikacji. Pomyślny wynik nie potwierdza działania fizycznej sieci ani odporności usługi na ataki. Do takich testów potrzebna jest emulacja systemów lub dostęp do rzeczywistych urządzeń.

## Podstawa modelu i weryfikacja

Zasady DHCP, dzierżaw i relay sprawdzono w [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131.html) oraz [dokumentacji Cisco o DHCP i granicach L3](https://www.cisco.com/c/en/us/support/docs/ip/dynamic-address-allocation-resolution/27470-100.html). Domyślna blokada WAN i publikacja usług odpowiadają opisanemu modelowi [NAT pfSense](https://docs.netgate.com/pfsense/en/latest/nat/index.html); kolejność translacji i filtrowania oparto na [Ordering of NAT and Firewall Processing](https://docs.netgate.com/pfsense/en/latest/nat/process-order.html). To wybrany model, a nie gwarancja identycznego zachowania wszystkich producentów.

`npm test` sprawdza m.in. awarię i wygaśnięcie DHCP, pule/VLAN-y, relay, blokadę prywatnych celów z Internetu, NAT, dynamiczne obiekty ACL, porty usług, odpowiedzi, connected/static routes, VM i geometrię canvasu.

Projekt pozostaje na urządzeniu użytkownika. Eksport JSON pozwala przenosić go między przeglądarkami.

## Audyt modelu urządzeń

[Raport audytu i źródła](docs/DEVICE_BEHAVIOR_AUDIT.md) opisują wszystkie 15 rodzajów urządzeń, poprawione przypadki i granice symulacji. Testy obejmują też przełączanie L2 na switchu L3, niezależny VLAN zarządzania, adresy SVI, DHCP bez kradzieży ważnych dzierżaw, DNS przez TCP oraz konflikty IP.
