# Gotowe laboratorium: biuro, drukarka i monitoring PoE

Laboratorium rozszerzono o gałąź AAA: RADIUS, AP Enterprise, switch 802.1X, dwa laptopy, Raspberry Pi, mini serwer, NVR, UPS i szafę RACK. Administrator otrzymuje VLAN 20, a konto pracownika i IoT — VLAN 30. Ta dodatkowa gałąź korzysta z VLAN-ów już przenoszonych przez switch serwerowy i nie zmienia dotychczasowych polityk Wi-Fi pracowników/gości. [Logowanie, konta i accounting](./RADIUS.md).

Wybierz **Przykład → Biuro, serwery i Wi-Fi**. Fabryka tworzy nową kopię 32 urządzeń i siedmiu VLAN-ów. Zapisany projekt nie jest nadpisywany przy aktualizacji aplikacji; przykład należy wczytać ponownie z menu. Wczytanie można cofnąć.

## Topologia i adresacja

| VLAN | Podsieć         | Rola                                              |
| ---- | --------------- | ------------------------------------------------- |
| 10   | 192.168.10.0/24 | Administrator i zarządzanie switchem biurowym     |
| 20   | 192.168.20.0/24 | DNS, NAS, NVR, Hyper-V i dwie VM                  |
| 30   | 192.168.30.0/24 | Switch PoE i dwie kamery DHCP                     |
| 40   | 192.168.40.0/24 | Pracownicy: przewodowy laptop i Wi-Fi Firma-Staff |
| 50   | 192.168.50.0/24 | Goście Firma-Guest i osobny DNS gościnny          |
| 60   | 192.168.60.0/24 | Drukarka 192.168.60.20, adres statyczny           |
| 99   | 172.16.255.0/30 | Tranzyt router brzegowy ↔ firewall                |

Internet → router brzegowy → firewall. Router ma WAN 203.0.113.10 i statyczne trasy powrotne do sześciu sieci LAN. Firewall ma ich SVI/bramy, serwer DHCP i trasę domyślną do routera. Pula DHCP to .100–.200, dzierżawa 120 minut; VLAN 60 korzysta z adresacji statycznej.

Switch biurowy ma trunk 10/40/60 do firewalla oraz osobne porty access do administratora, pracownika, AP i drukarki. AP pracowniczy jest podłączony do switcha, nie tworzy drugiego mostu między jego VLAN-em a firewallem. Switch serwerowy ma trunk 20/30 do firewalla. Jego gniazdo SFP+ jest połączone z gniazdem SFP+ switcha CCTV: dwa moduły 10GBASE-SR, OM3, tor 35 m, access VLAN 30. Porty i listy VLAN są ustawione jawnie na obu końcach.

Grupy są rozdzielone przestrzennie: tranzyt u góry, administracja i drukarka po lewej, serwery po prawej, pracownicy/goście/CCTV w dolnej części. Testy kontrolują, czy obszary VLAN oraz pola trafiania urządzeń i ich podpisy nie nakładają się.

## Polityka dostępu

| Źródło                | Dozwolone nowe połączenia                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator VLAN 10 | Zarządzanie urządzeniami, usługi LAN i Internet                                                                                          |
| Pracownicy VLAN 40    | DNS UDP/TCP 53 i ping do DNS; NPM HTTPS 443; aplikacja TCP 3000; NAS SMB 445; panel NVR HTTPS 443; drukarka IPP 631 i RAW 9100; Internet |
| Goście VLAN 50        | Lokalny DNS gościnny i publiczny Internet; prywatne zakresy RFC 1918 są blokowane                                                        |
| NVR                   | RTSP TCP 554 i HTTPS 443 do obu kamer, przed regułami izolacji VLAN 20                                                                   |
| Inne serwery VLAN 20  | Własny segment L2 i Internet; nowe połączenia do innych prywatnych sieci są blokowane                                                    |
| Kamery VLAN 30        | DNS UDP/TCP 53 do wewnętrznego DNS; odpowiedzi na dozwolone testy administratora/NVR                                                     |
| Drukarka VLAN 60      | DNS UDP/TCP 53 do wewnętrznego DNS; odpowiedzi na dozwolone testy drukowania/administracji                                               |
| Internet              | Wyłącznie opublikowane NPM HTTP 80 / HTTPS 443 przez DNAT i ACL                                                                          |

Panel NPM :81, zarządzanie Hyper-V, panel drukarki :443 i bezpośrednie kamery nie są dostępne dla pracowników. Pracownicy oglądają monitoring przez NVR. Goście nie mają dostępu do drukarki, pracowników, kamer, serwerów ani paneli infrastruktury. NPM przez publiczny adres nie omija blokady gości: ACL widzi cel po DNAT.

Izolacja dotyczy ruchu między segmentami. Urządzenia wewnątrz jednego VLAN-u pozostają w tej samej domenie L2; przykład nie udaje izolacji portów kamery–kamera ani klientów jednego SSID. Firewall dopuszcza odpowiedź w ramach konkretnego testu; nowe połączenie z kamery do NVR pozostaje blokowane.

## Drukarka

`drukarka.lab.home.arpa` wskazuje statyczne 192.168.60.20. Obaj pracownicy — LAN i Wi-Fi — mogą sprawdzić TCP/631 przez DNS. TCP/9100 jest pokazany jako wariant starszego drukowania RAW; HTTPS/443 służy wyłącznie administracji. Dobór portów sprawdzono w [dokumentacji CUPS: Using Network Printers](https://openprinting.github.io/cups/doc/network.html).

Przykład używa zwykłego rekordu DNS, bez automatycznego wykrywania mDNS/AirPrint między VLAN-ami. Testuje zadeklarowaną usługę i trasę odpowiedzi; nie uruchamia kolejki drukowania ani sterownika.

## CCTV i PoE

Switch CCTV ma budżet PSE 60 W. Każda kamera wymaga 12 W przy PD i jest podłączona do portu PSE 802.3at. Konserwatywna rezerwacja klasy 3 wynosi po 15,4 W, czyli 30,8 W razem; pozostaje 29,2 W. Obie kamery otrzymują DHCP i pracują w profilu Ethernet 10/100. AP, serwery i drukarka korzystają na tym etapie z zasilania lokalnego.

NVR inicjuje połączenia do kamer po RTSP TCP/554; dopuszczono też zarządzanie HTTPS/443. Porty i zasadę ograniczania dostępu do kamer porównano z [Axis OS Hardening Guide](https://help.axis.com/en-us/axis-os-hardening-guide). Przykład reprezentuje kontrolę RTSP i wariant transportu po TCP; model nie generuje nagrań, strumieni RTP/UDP ani discovery ONVIF. UPS w gałęzi AAA ma parametry planistyczne i zarządzanie SNMP/HTTPS; instalacja elektryczna i rozładowywanie baterii nie są symulowane.

## Odbiór i testy

W panelu **Symulacja** są dotychczasowe scenariusze publikacji NPM, DNS, obu kamer, drukowania przez LAN/Wi-Fi, administracji drukarki i izolacji stref. Dodano też trzy scenariusze gałęzi AAA: dostęp administratora do mini serwera, accounting NAS i blokadę IoT przez ACL.

`src/tests/demoAcceptance.test.ts` sprawdza ponadto:

- brak zgłoszeń diagnostycznych, aktywne linki i właściwe dzierżawy;
- jawne końce trunków, zgodność optyki i limit 100 Mb/s portów kamer;
- kierunek inicjowania połączeń i działającą trasę odpowiedzi;
- wyczerpanie budżetu PoE i odzyskanie kamery po jego przywróceniu;
- utratę łączności po wyłączeniu uplinku optycznego bez utraty lokalnego PoE i drukowania;
- rozdzielenie obszarów i podpisów na planszy.

`npm run test:ui` wczytuje przykład z menu i uruchamia sześć scenariuszy w prawdziwej przeglądarce: IPP z LAN/Wi-Fi, blokadę gościa do drukarki, NVR do każdej kamery i blokadę pracownika do CCTV. Kontroluje też budżet PoE i pustą listę problemów diagnostycznych.
