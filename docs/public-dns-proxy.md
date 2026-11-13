# Publiczny DNS i reverse proxy

1. Dodaj obiekty Internet dla osobnych sieci. Połącz każdy ze swoim routerem brzegowym. Aby sieci mogły komunikować się przez Internet, połącz również ich obiekty Internet. Chmura obsługuje wiele połączeń.
2. Dodaj urządzenie DNS. W zakładce „Rekordy DNS” włącz „Publiczny serwer DNS”. Otrzyma wolny publiczny adres przykładowy; możesz go zmienić w konfiguracji urządzenia. Połącz DNS z Internetem.
3. Dodaj rekord A, np. `app.example.com → 203.0.113.20`. Publiczna strefa musi wskazywać publiczny WAN routera, adres NAT lub publiczne urządzenie. Wybierz publiczny resolver w ustawieniach DNS klienta lub VLAN-u. Po zmianie ustawień DHCP odnów dzierżawę klienta.
4. Na routerze z adresem WAN `203.0.113.20` dodaj TCP/443 → adres proxy i jego port 443. Dopuść wymagany ruch w ACL. Router klienta musi mieć działający NAT wyjściowy; klient musi mieć bramę i dostęp do DNS przez UDP/53 lub TCP/53.
5. Na urządzeniu proxy w zakładce „Usługi” ustaw typ „Reverse proxy”. Dodaj host: domena `app.example.com`, docelowy IPv4 albo DNS backendu oraz port, np. `8080`. Backend musi mieć włączoną usługę na tym porcie, a proxy musi mieć do niej dostęp i poprawną trasę odpowiedzi. Gdy backend jest podany jako domena, proxy potrzebuje własnego resolvera DNS.
6. W panelu symulacji wybierz klienta, cel w trybie IP/DNS `app.example.com`, TCP i port 443. Wynik obejmuje DNS, NAT, regułę Host/SNI i osobne połączenie do backendu. Reguły domen dopasowują pełną nazwę bez uwzględniania wielkości liter. Model nie symuluje certyfikatów TLS ani treści HTTP.

Skan portów bez domeny nadal sprawdza port nasłuchującego proxy. Dopiero test z domeną sprawdza przekazanie żądania do backendu.

# Zapisane scenariusze

Formularz w panelu symulacji zapisuje aktualny test i oczekiwany wynik. Przycisk „Zapisane testy” otwiera osobny dialog z listą, wynikami, uruchamianiem pojedynczych testów i całego zestawu. Lista przewija się wewnątrz dialogu. „Wczytaj test” przenosi scenariusz do panelu symulacji, gdzie można obejrzeć animację. Scenariusze są częścią eksportowanego projektu.
