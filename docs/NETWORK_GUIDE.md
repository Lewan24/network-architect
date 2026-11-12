# Poradnik projektowania sieci

Poradnik jest dostępny w aplikacji pod przyciskiem **Poradnik**. Tekst tego pliku pochodzi z `src/learning/guideContent.ts`; po zmianie treści uruchom `npm run docs:guide`.

## Jak pracować z przykładami

W menu **Przykład** znajdziesz małą firmę, home lab, dużą firmę z DMZ i dwiema zaporami, dotychczasowe laboratorium biurowe oraz celowo błędny antywzorzec. Każdy projekt ma własne testy w panelu Symulacja. W Poradniku, w zakładce projektów, przyciski prowadzą do konkretnych sekcji konfiguracji.

Zakładka **Laboratoria: problem i rozwiązanie** zawiera siedem par małych projektów. Porównaj wariant z błędem z poprawionym. Wczytanie zastępuje bieżący projekt, można je cofnąć. Przycisk wczytania przygotowuje parametry testu; następnie kliknij **Wyślij pakiet**. Zielony wynik oznacza łączność, nie ocenę bezpieczeństwa.

## Słowniczek

- **RADIUS / AAA:** Authentication weryfikuje konto, Authorization określa zgodę i VLAN, Accounting rejestruje zdarzenia sesji. Model sprawdza transport UDP/1812 i UDP/1813.
- **802.1X / NAS / supplicant:** Supplicant to klient logujący się do sieci; NAS to zaufany AP lub switch egzekwujący decyzję RADIUS. VLAN użytkownika musi być przenoszony przez uplink.
- **Szafa RACK / U:** Pasywny obiekt montażowy. 1U to jednostka wysokości sprzętu; UPS może zajmować np. 2U. W podglądzie nie mogą nakładać się pozycje montażowe.
- **IoT, mini serwer, NVR i UPS:** IoT/Raspberry Pi i laptop mają Ethernet oraz Wi-Fi; mini serwer uruchamia usługi lub VM, NVR opisuje archiwum monitoringu, UPS udostępnia SNMP i parametry planowania zasilania. Nagrania i bateria nie są symulowane w czasie.
- **VLAN:** Oddzielna domena warstwy 2 (ramki i broadcast). Sama nie określa, kto ma dostęp do usług po routingu.
- **Podsieć / CIDR:** Zakres adresów IPv4 opisany adresem sieci i maską, np. 192.168.10.0/24. Nie jest tym samym co numer VLAN-u.
- **Brama / SVI:** Interfejs urządzenia L3 w danej podsieci. Host używa go do komunikacji z innymi podsieciami.
- **Access / trunk:** Access zwykle przenosi jedną sieć bez tagu do hosta. Trunk przenosi wiele VLAN-ów między urządzeniami.
- **ACL / firewall:** Uporządkowane reguły zezwalania i blokowania ruchu. Reguły mają znaczenie tylko na urządzeniu, przez które ruch rzeczywiście przechodzi.
- **DHCP:** Przydziela klientowi adres, maskę i dodatkowe opcje, np. bramę i DNS, na określony czas.
- **DNS:** Tłumaczy nazwę, np. ha.home.arpa, na adres IP. Poprawny DNS nie gwarantuje dostępu do docelowej usługi.
- **NAT / DNAT:** Zmienia adresy lub porty pakietu. DNAT może publikować usługę prywatną przez adres WAN; nie zastępuje polityki dostępu.
- **PoE / PSE / PD:** Zasilanie kablem Ethernet; PSE dostarcza moc, PD ją odbiera. Budżet PSE uwzględnia zapas strat kanału.
- **DMZ:** Osobna strefa dla usług dostępnych z mniej zaufanych sieci. Dostęp do backendu i danych wymaga osobnych, ograniczonych reguł.
- **Bastion:** Kontrolowany punkt administracyjny, z którego zarządza się systemami. Samo dodanie serwera o takiej nazwie nie tworzy uwierzytelniania ani VPN.

## Plan projektowania

### 1. Zbierz wymagania

Spisz liczbę hostów, role, lokalizacje, przepływy, wymagania dostępności i perspektywę rozbudowy. „Ma działać Internet” nie opisuje uprawnień do kamer czy kopii zapasowych.

### 2. Zaplanuj strefy i adresację

Oddziel administrację, pracowników, gości, serwery i urządzenia mniej zaufane. Zapisz VLAN ID, CIDR, bramę, DHCP i DNS. Unikaj nakładających się podsieci. Numer VLAN-u nie musi odpowiadać trzeciemu oktetowi IP — to tylko konwencja przykładów.

### 3. Narysuj przepływy

Dla każdej usługi zapisz źródło, cel, protokół, port i uzasadnienie. NVR może inicjować połączenia do kamer; nie wynika z tego, że kamera powinna inicjować do serwerów.

### 4. Dobierz sprzęt i połączenia

Policz fizyczne porty, uplinki, PoE oraz długości i moduły. Zaplanuj access i trunk po obu końcach. Wyłącz nieużywane porty. Redundancję wdrażaj dopiero z planem STP/LACP/HA; dodatkowy kabel sam jej nie zapewnia.

### 5. Dodaj usługi bazowe

Sprawdź osiągalność bramy, DHCP i DNS. Rezerwuj adresy infrastruktury i pozostaw zapas puli. Ustal, gdzie ma działać relay. Testuj także awarię uplinku oraz niedostępny serwer DHCP.

### 6. Wprowadź politykę i zarządzanie

Stosuj minimalne zezwolenia, oddziel zarządzanie i ogranicz WAN do jawnie publikowanych usług. Ustaw konta RADIUS, zaufane NAS oraz VLAN-y ról. Sprawdź odrzucenie hasła, cofnięcie autoryzacji i accounting. Na rzeczywistym sprzęcie potrzebne są także certyfikaty, aktualizacje i kopie konfiguracji.

### 7. Odbierz projekt testami

Sprawdź pozytywne i negatywne przypadki z każdej roli oraz trasę odpowiedzi. Sam brak błędów diagnostyki nie potwierdza bezpieczeństwa. Zachowaj wersjonowany eksport i opisaną macierz oczekiwań przed wdrożeniem na sprzęcie.

## 1. VLAN: co naprawdę izoluje?

VLAN oddziela domenę warstwy 2. Podsieć IPv4 i reguły uprawnień to kolejne elementy projektu.

**Problem:** Gość i pliki są w VLAN 10. Nawet reguła deny na brzegu nie pomoże: switch dostarcza ramki lokalnie, bez przejścia przez firewall.

**Rozwiązanie:** Przenieś usługę do VLAN 20, ustaw port access 20 i jej bramę. Wariant poprawiony routuje między VLAN-ami przez zaporę, która zezwala tylko na HTTPS.

1. Wczytaj wariant z błędem i wyślij test SSH/22. Zauważ sukces oraz brak firewalla na ścieżce.
2. Wczytaj poprawiony wariant i powtórz SSH: powinien zostać zablokowany na firewallu.
3. Zmień port testu na 443: ta konkretna usługa ma działać.
4. W projekcie „Antywzorzec” sprawdź gość → pliki; następnie porównaj z małą firmą.

**Co zapamiętać:** Osobny VLAN nie jest automatycznie polityką dostępu. Sprawdź zarówno działającą usługę, jak i zabronione nowe połączenie. Ruch wewnątrz VLAN-u wymaga innych mechanizmów, np. zapory hosta lub izolacji portów.

Źródła: [ASD: segmentacja i oddzielenie zarządzania](https://www.cyber.gov.au/publication/implementing-network-segmentation-and-segregation), [NIST SP 800-41: polityka zapory](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-41r1.pdf).

## 2. Access, trunk i native VLAN

Access służy najczęściej do jednego hosta; trunk przenosi wiele domen VLAN między urządzeniami.

**Problem:** VLAN 20 został pominięty na jednym końcu trunku. Kabel i porty są fizycznie aktywne, ale pakiet do usługi nie przechodzi.

**Rozwiązanie:** Uzgodnij allowed VLAN na obu końcach, native/PVID oraz zasady tagowania. W ćwiczeniu dopuszczone są 10/20/99, a VLAN zarządzania 99 jest tagowany.

1. Wczytaj wariant z błędem. Test HTTPS ma się nie udać, mimo zielonego linku.
2. Otwórz port uplinku w switchu i sprawdź listę allowed; porównaj z portem firewalla.
3. W poprawionym wariancie oba końce przenoszą VLAN 20. Wyślij ponownie ten sam pakiet.
4. W małej firmie prześledź tagowany uplink i nietagowany port drukarki.

**Co zapamiętać:** Nie używaj „wszystkie VLAN-y” jako zastępstwa planu. Native mismatch może połączyć niewłaściwe domeny; nie zawsze oznacza fizyczny link down. Nie zakładaj, że każda platforma taguje native tak samo.

Źródła: [Cisco: konfiguracja trunków 802.1Q](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan-trunks.html).

## 3. ACL: potrzebne usługi zamiast permit any

Zapisz macierz przepływów: kto, do kogo, jaki protokół i port, oraz po co.

**Problem:** Hosty mają różne VLAN-y, ale default permit pozwala również na SSH, którego pracownik nie potrzebuje.

**Rozwiązanie:** Ustaw domyślne deny i jawnie zezwól na HTTPS do wskazanej usługi. Pierwsze dopasowanie reguły wygrywa, więc kolejność jest częścią polityki.

1. Uruchom SSH/22 w wariancie z błędem: wynik jest zielony, ale niepożądany.
2. W poprawionym wariancie sprawdź „Domyślna reguła ACL” i wyjątek TCP/443.
3. Wyślij SSH/22: blokada jest poprawnym wynikiem. Następnie sprawdź HTTPS/443: ma przejść.
4. W dużej firmie otwórz drugą zaporę danych. Aplikacja dociera do bazy, pracownik i proxy DMZ — nie.

**Co zapamiętać:** Testuj dozwolone i zabronione przepływy oraz odpowiedzi. Firewall modelu dopuszcza odpowiedź dozwolonego testu; nowe połączenie w przeciwnym kierunku nadal wymaga reguły. Samo otwarcie usługi na hoście nie jest zezwoleniem w ACL.

Źródła: [NIST SP 800-41: polityka zapory](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-41r1.pdf), [ASD: segmentacja i oddzielenie zarządzania](https://www.cyber.gov.au/publication/implementing-network-segmentation-and-segregation).

## 4. Adres IP, DHCP, brama i DNS

Diagnozuj zależności w kolejności: zasilanie/link → VLAN → adres/maska → brama/trasa → ACL → DNS → usługa.

**Problem:** Klient oczekuje na DHCP, a serwer dla jego podsieci jest wyłączony. Nazwa usługi nie zadziała bez poprawnej konfiguracji IP.

**Rozwiązanie:** Włącz właściwy zakres DHCP, ustaw pulę poza bramą i adresami statycznymi, a następnie wskaż osiągalny DNS. Wariant poprawiony ma rekord app.lab.test.

1. W wariancie z błędem obejrzyj adres klienta i diagnostykę DHCP.
2. W poprawionym wariancie sprawdź dzierżawę: adres, maskę, bramę i DNS.
3. Wyślij test app.lab.test: ślad pokazuje najpierw DNS, potem usługę.
4. Zmień cel na adres IP serwera, aby odróżnić problem DNS od problemu łączności. Po zmianie DNS w DHCP odnów dzierżawę.

**Co zapamiętać:** DHCP relay jest potrzebny, gdy serwer znajduje się poza domeną L2 klienta — nie w każdej sieci z VLAN-ami. Adresy infrastruktury planuj stabilnie (statycznie lub przez rezerwacje); model nie ma jeszcze osobnego edytora rezerwacji. Brama jest potrzebna do obcych podsieci, DNS do nazw.

Źródła: [RFC 2131: DHCP](https://www.rfc-editor.org/rfc/rfc2131.html), [RFC 8375: nazwy home.arpa](https://www.rfc-editor.org/rfc/rfc8375.html).

## 5. NAT i DMZ: publikuj usługę, nie panel

Translacja adresu nie zastępuje reguły zapory. Projektuj osobno ruch przychodzący, wychodzący i zarządzanie.

**Problem:** Panel SSH został opublikowany jako WAN:2222 → serwer:22 i dopuszczony z Internetu. Zmiana numeru portu nie jest zabezpieczeniem.

**Rozwiązanie:** Usuń publikację panelu. Pozostaw tylko WAN:443 do publicznej usługi, a administrację w sieci zarządzania. W dużej firmie publiczny endpoint znajduje się w osobnej DMZ.

1. Wyślij test Internet → WAN:2222 w złym wariancie: niepożądany dostęp działa.
2. W poprawionym wariancie test 2222 jest blokowany.
3. Zmień port na 443 i sprawdź dostępną usługę HTTPS.
4. W dużej firmie prześledź osobne testy proxy → backend i backend → baza. To trzy połączenia aplikacyjne, nie jeden magiczny tunel przez proxy.

**Co zapamiętać:** W modelu ACL widzi cel po DNAT, a źródło przed SNAT. Na rzeczywistym sprzęcie sprawdź dokumentację danej platformy. Zdalną administrację planuj przez VPN/jump host i silne uwierzytelnianie; aplikacja nie emuluje VPN ani kont użytkowników.

Źródła: [pfSense: kolejność NAT i filtrowania](https://docs.netgate.com/pfsense/en/latest/nat/process-order.html), [NIST SP 800-41: polityka zapory](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-41r1.pdf).

## 6. PoE i medium: licz budżet, nie ikonki

Port PSE zasila odbiornik PD. Znaczenie mają klasa, całkowity budżet, medium i zasięg.

**Problem:** Kamera potrzebuje 12 W przy odbiorniku, ale switch ma tylko 10 W budżetu PSE. Samo ustawienie portu 802.3at jej nie zasili.

**Rozwiązanie:** Zapewnij co najmniej rezerwację klasy 3, czyli 15,4 W PSE dla tego profilu 12 W PD. Poprawiony wariant ma 30 W budżetu.

1. W złym wariancie otwórz „Porty i PoE” switcha i zobacz odmowę zasilania.
2. W poprawionym wariancie sprawdź aktywny port, rezerwację mocy i wynik HTTPS do kamery.
3. W dużej firmie porównaj sumę czterech kamer po 12 W z rezerwacją 61,6 W PSE i budżetem 90 W.
4. Dobieraj również RJ45/SFP, moduły i włókno. Długość kabla wpisujesz ręcznie; odległość ikon na canvasie jej nie mierzy.

**Co zapamiętać:** Zostaw zapas dla rozbudowy i rzeczywistych wymagań sprzętu. Model nie jest pomiarem mocy, strat optycznych ani BER; dobór modułu i zasilania potwierdza dokumentacja konkretnego urządzenia. UPS i awarie instalacji elektrycznej nie są tu jeszcze emulowane.

Źródła: [HPE Aruba: klasy i moc PoE 802.3bt](https://arubanetworking.hpe.com/techdocs/AOS-S/16.10/MCG/WC/content/wc/def-ter-802.3bt.htm).

## 7. RADIUS: użytkownik, autoryzacja i VLAN

Klient 802.1X rozmawia z NAS (AP lub switchem). To NAS kontaktuje się z RADIUS, a po Access-Accept wpuszcza użytkownika do przyznanego VLAN-u.

**Problem:** Laptop zna login student, ale ma błędne hasło. Mimo sprawnych kabli i DHCP port pozostaje nieautoryzowany i klient nie uzyskuje dostępu.

**Rozwiązanie:** W wariancie poprawionym hasło vlan-demo pasuje do konta student. NAS ma zgodny shared secret i jest na liście zaufanych klientów. Użytkownik otrzymuje VLAN 20 oraz adres z jego puli DHCP.

1. Wczytaj wariant z błędem. Otwórz laptop Klient → RADIUS / 802.1X i zobacz profil oraz Access-Reject.
2. Na serwerze RADIUS porównaj konto student, zgodę na dostęp, VLAN 20 i dozwolony NAS. Hasła w laboratorium są danymi testowymi.
3. Na switchu sprawdź NAS: serwer, shared secret i accounting. Port laptopa ma 802.1X; uplink oraz port RADIUS nie mogą wymagać logowania klienta.
4. Wczytaj wariant poprawiony i wyślij HTTPS do usługi. Sprawdź Access-Accept, nowy VLAN, DHCP i dziennik Accounting-Start.
5. Wyłącz konto, zmień shared secret lub zablokuj UDP/1812 w ACL: dostęp znika także przy wcześniej ważnej dzierżawie. Wyłączenie samego UDP/1813 blokuje accounting, ale nie poprawne logowanie.
6. W gałęzi AAA każdego projektu porównaj laptopy admin / admin-demo i pracownik / staff-demo na tym samym SSID oraz Raspberry Pi raspberry / iot-demo na przewodowym porcie 802.1X.
7. Otwórz szafę RACK → Podgląd szafy. Serwer RADIUS, mini serwer, NVR i UPS mają przypisane pozycje i wysokości U; montaż nie tworzy połączenia sieciowego ani zasilania.

**Co zapamiętać:** Uwierzytelnianie sprawdza tożsamość, autoryzacja określa zgodę i VLAN, a accounting opisuje sesję. Nadal potrzebujesz trunków, DHCP, bramy i ACL. Model przelicza decyzję na bieżąco; nie emuluje wymiany EAP/TLS, certyfikatów, AD, MAB ani czasów reautoryzacji. Dane testowe są jawne w lokalnym projekcie i JSON.

Źródła: [RFC 2865: RADIUS Authentication](https://www.rfc-editor.org/rfc/rfc2865), [RFC 3580: 802.1X i przydzielanie VLAN](https://www.rfc-editor.org/rfc/rfc3580), [RFC 2866: RADIUS Accounting](https://www.rfc-editor.org/rfc/rfc2866).

## Zakres symulacji

Przykłady sprawdzają logiczne VLAN-y, adresację, DHCP, DNS, ACL, statyczne trasy, NAT, porty, usługi, PoE oraz konta, autoryzację i dynamiczny VLAN RADIUS/802.1X. Accounting sprawdza dostępność UDP/1813 i zapisuje zdarzenia modelu. Każdy projekt zawiera gałąź AAA z laptopami, Raspberry Pi, mini serwerem, NVR, UPS oraz szafą RACK. UPS i retencja NVR są parametrami planowania, a montaż RACK nie tworzy kabli sieciowych ani elektrycznych. Model nie emuluje kryptografii EAP/TLS, certyfikatów, AD, MAB, CoA, timerów sesji, VPN, STP/LACP/HA, stosu TCP, SIEM ani aktualizacji firmware. Dane logowania są demonstracyjne i jawne w projekcie oraz eksporcie JSON. Wdrożenie na sprzęcie wymaga jego dokumentacji, konfiguracji i pomiarów.
