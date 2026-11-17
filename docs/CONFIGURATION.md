# Konfiguracja sieci

## VLAN, porty i bramy

W **Sieci i VLAN-y** ustaw ID, podsieć IPv4, adres bramy i urządzenie pełniące rolę bramy. Numer VLAN-u nie musi odpowiadać adresacji. Wskazanie bramy tworzy w modelu logiczny interfejs L3/SVI. VLAN 0 oznacza brak VLAN-u / WAN.

- **Access:** jeden VLAN dla nietagowanego ruchu hosta.
- **Trunk:** wiele VLAN-ów; uzgodnij allowed VLANs, native/PVID i tagowanie obu końców.
- **Zarządzanie:** IP switcha lub AP może należeć do innego VLAN-u niż przenoszony ruch.
- **Auto:** uproszczenie modelu; we wdrożeniu fizycznym trzeba jawnie ustawić profile portów.

Wybierz porty przy łączeniu urządzeń. Panel pokazuje ich zajętość i aktywność. W ustawieniach kabla sprawdzisz oba końce, medium i długość; szczegółowe parametry prędkości i duplex są w trybie zaawansowanym. PoE wymaga zgodnego portu PSE, budżetu i mocy odbiornika.

## Adresacja i routing

DHCP wymaga aktywnego serwera, poprawnej puli i drogi L2 w VLAN-ie klienta albo skonfigurowanego relay. Opcje obejmują bramę i DNS. Zmiany opcji DHCP trafiają do klienta przy odnowieniu dzierżawy. Statyczny IP musi należeć do właściwej podsieci.

Host kieruje ruch do innej podsieci przez bramę. Dla sieci podłączonych do jednego routera nie dodawaj tras statycznych pomiędzy nimi. Własne trasy określają docelowy CIDR, osiągalny następny skok i metrykę; `0.0.0.0/0` jest trasą domyślną. Wybierany jest najdłuższy prefiks, następnie niższa metryka. Tryb automatyczny korzysta z topologii, nie z protokołu routingu dynamicznego.

Switch L3 może przełączać ruch na L2 do innej bramy. W takim tranzycie nie potrzebuje własnego SVI dla każdego przenoszonego VLAN-u. Interfejsy L3 są potrzebne tam, gdzie odbywa się routing.

## ACL i usługi

ACL określa dostęp, routing określa drogę. Reguły działają od góry; pierwsza pasująca rozstrzyga. Ustaw źródło, cel, działanie, protokół, port i pochodzenie ruchu. Selektory pokazują najpierw sieci, potem urządzenia według VLAN-ów. Wybór ANY ustawia port `*`, który nadal można zmienić; ICMP nie używa portów.

**Wstaw regułę tutaj** dodaje wpis w wybranym miejscu. **Pozostały ruch** decyduje o połączeniach niedopasowanych do listy. Przy domyślnym deny dopuszczaj potrzebne usługi, DNS i ruch wychodzący osobnymi wyjątkami. Urządzenie „Internet” jako cel ACL oznacza jego adres, a nie wszystkie publiczne adresy.

Reguły routera nie filtrują połączeń, które go omijają, np. między hostami w tym samym VLAN-ie. ACL na VM reprezentuje firewall ruchu przychodzącego także z lokalnej podsieci. Bez własnej polityki VM zachowuje domyślne allow; nowe urządzenia routujące mają domyślnie deny.

Test TCP/UDP wymaga aktywnej usługi na porcie docelowym. Firewall/brzeg i VM dopuszczają odpowiedź dozwolonego testu przez stan tego testu; nie jest to trwała tablica conntrack.

## DNS, NAT i reverse proxy

1. Skonfiguruj resolver w VLAN-ie/DHCP lub u klienta. DNS udostępnia rekordy A i usługi UDP/TCP 53.
2. Publiczny rekord, np. `app.example.com`, powinien wskazywać publiczny WAN, alias NAT albo publiczne urządzenie.
3. Na brzegu ustaw WAN i, dla wyjścia prywatnych hostów, NAT wyjściowy. Publikację usługi skonfiguruj jako publiczny IP:port → prywatny IP:port oraz odpowiedni wyjątek ACL.
4. W **Usługach** proxy dodaj domenę Host/SNI, backend i port. Testuj nazwę, aby sprawdzić pełną ścieżkę DNS → NAT → proxy → backend.

ACL w modelu widzi cel po DNAT i źródło przed SNAT. Port forwarding ma pierwszeństwo przed static NAT. Sam otwarty port proxy nie potwierdza działania backendu. Adresy `203.0.113.0/24` i `198.51.100.0/24` w przykładach są dokumentacyjne.

## VM, Wi-Fi i diagnostyka

VM ma własny VLAN/IP i przypisany host. Wirtualizator mostkuje ruch gości; jego VLAN zarządzania nie zastępuje VLAN-ów VM. Uplink musi przenosić potrzebne sieci. Montaż w RACK nie tworzy kabla ani zasilania.

AP mostkuje klientów bez NAT. Przypisanie VLAN-u przez SSID, PPSK lub RADIUS opisuje [instrukcja Wi-Fi](WIFI.md).

W **Symulacji** wybierz właściwy interfejs, źródło, cel i usługę; włącz sprawdzanie odpowiedzi. Ślad pokazuje trasę, porty, ACL i translacje. **Diagnostyka** prowadzi do konfiguracji urządzeń i kabli. Zapisane scenariusze obejmują oczekiwany wynik; samo oczekiwanie nie zmienia reguł sieciowych.

## Granice modelu

Aplikacja nie emuluje systemów operacyjnych, firmware, rzeczywistych usług, propagacji radiowej, kryptografii WPA/EAP, pełnego TCP, trwałego conntrack, STP/LACP, routingu dynamicznego ani IPv6. Jeden VLAN katalogu odpowiada jednej podsieci i jednej bramie. Wynik symulacji nie zastępuje testów na fizycznym sprzęcie.
