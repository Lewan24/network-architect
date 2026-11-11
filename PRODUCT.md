# Netweave

Aplikacja webowa React dla osób projektujących i odtwarzających architekturę sieci. Łączy izometryczny edytor urządzeń z modelowym testowaniem komunikacji i animacją pakietów. Priorytety użytkownika: minimalizm, profesjonalny wygląd, praktyczność i działający projekt lokalny.

Główny scenariusz: dodać urządzenia → połączyć → ustawić IPv4/VLAN/reguły → wybrać źródło i cel → prześledzić test. Drugi scenariusz: wyłączyć urządzenie lub zmienić regułę i sprawdzić konsekwencje. Dane pozostają w przeglądarce; JSON służy do przenoszenia i archiwizacji.

Założenia implementacyjne: polski interfejs, bez kont i backendu, ilustracyjna topologia startowa, model logiczny zamiast emulacji stosu sieciowego. Pełen zakres i ograniczenia znajdują się w README.md.

Rozwinięte wymagania: kompaktowa biblioteka i duży canvas; edycja urządzeń i firewalla w dialogach; kompaktowy prawy panel tylko w trybie symulacji, bez dolnego monitora; wspólne VLAN-y z pulami IPv4 i opcjonalnym adresem statycznym per urządzenie; menu kontekstowe; przewidywalny pan i zoom; animacja każdego przeskoku przed pokazaniem wyniku.

Możliwości urządzeń: wybór default ACL permit any / deny any; router z ACL i statycznymi trasami; switche L2 zarządzalne, L2 niezarządzalne oraz L3; firewall z port forwarding i static NAT; AP z SSID; drukarka; serwer z rolą hypervisora i przypisane do niego VM z własnymi adresami i VLAN-ami. Każde ustawienie logiczne wpływa na symulację, z ograniczeniami modelu opisanymi w README.md.

Aktualne wymagania: domyślny DHCP dla zwykłych nowych urządzeń, oznaczenia DHCP/STATIC, rzeczywista zależność dzierżawy od aktywnego i osiągalnego serwera w modelu, konfigurowalne podsieci/SVI/pule/relay, deny any jako domyślna ACL oraz odwołania do urządzeń i VLAN-ów. Internet skanuje publiczny WAN i różne porty, nigdy prywatną listę hostów. Typ Router/firewall łączy role brzegu. Testy usług i odpowiedzi oraz czytelniejsze grupy sieci mają zmniejszać fałszywe pozytywne wyniki. Symulator ma jawnie odróżniać weryfikację modelu od testów rzeczywistych urządzeń.

Sekcje VLAN można zaznaczać i przesuwać w całości. Domyślny Internet 203.0.113.1 ma jednego sąsiada brzegowego; diagnostyka odróżnia brak źródła od braku połączenia/WAN. Reset pozostawia Internet, a Przykład ładuje laboratorium Hyper-V/Docker/NPM/DNS/CCTV z gotowymi scenariuszami. DNS obejmuje rekordy A, resolver z DHCP lub klienta i osobny test UDP/53 przed komunikacją po nazwie. Kamery IP są osobnym urządzeniem.
