# RADIUS, 802.1X i dynamiczne VLAN-y

Dodaj **Serwer RADIUS** z biblioteki. W zakładce **RADIUS / 802.1X** skonfiguruj konta, zgodę na dostęp, VLAN i dozwolone NAS. Zarejestruj każdy AP lub zarządzalny switch jako zaufanego klienta serwera, ze wspólnym sekretem. Laptop jest supplicantem; klientem RADIUS jest NAS.

Na AP/switchu wybierz serwer i ten sam shared secret. Dla Wi-Fi włącz Enterprise na SSID. Dla kabla włącz 802.1X tylko na właściwym porcie dostępowym RJ45 w **Porty i PoE**. Uplink, port serwera i interfejs zarządzania NAS muszą działać przed zalogowaniem użytkownika.

W laptopie, telefonie, komputerze lub IoT włącz profil logowania i ustaw dane testowego konta. Dla dynamicznego VLAN-u wybierz DHCP. Model obsługuje jeden kontrolowany interfejs klienta. Uplink NAS musi przenosić wszystkie przyznawane VLAN-y; każdy taki VLAN wymaga poprawnej adresacji, bramy i zakresu DHCP.

## Kolejność działania

1. Model sprawdza link, zasilanie, NAS i zaufanie/shared secret.
2. Testuje prawdziwą w modelu trasę NAS → RADIUS po UDP/1812, usługę, ACL i odpowiedź.
3. Weryfikuje login, hasło i aktywność konta. Osobno sprawdza zgodę na dostęp oraz listę dozwolonych NAS.
4. Access-Accept może przypisać VLAN konta. Gdy NAS nie honoruje dynamicznych VLAN-ów lub konto nie ma takiego atrybutu, obowiązuje VLAN SSID/portu.
5. Dopiero autoryzowany klient uzyskuje DHCP z właściwej sieci. Statyczne IP nie omija odmowy dostępu.
6. Gdy accounting jest włączony, osobny test UDP/1813 określa jego dostępność. Niedostępny accounting nie cofa udanego uwierzytelnienia.

Odłączenie RADIUS, wyłączenie konta, odmowa autoryzacji, błędny sekret lub blokada 1812 oznaczają odmowę dostępu. Nie ma fallbacku do otwartego/gościnnego VLAN-u. Każde przeliczenie projektu ponownie ocenia warunki; stan sesji z importu nigdy sam nie upoważnia do dostępu.

## Zdarzenia i diagnostyka

Zakładka serwera pokazuje ostatnie 200 zdarzeń: accept/reject oraz accounting-start/stop. Start z wynikiem `recorded` oznacza sprawdzony transport 1813. Stop jest lokalnym zdarzeniem zakończenia sesji modelu — nie udaje wysłanego do wyłączonego serwera datagramu. Zdarzenia nie zawierają haseł ani sekretów. Diagnostyka pokazuje odmowę 802.1X oraz niedostępność accounting, a ślad pakietu zawiera decyzję dostępu.

## Przykłady i tutorial

W każdym projekcie i ćwiczeniu znajdziesz gałąź `aaa-*` z RADIUS, przełącznikiem 802.1X, AP Enterprise, dwoma laptopami, IoT, mini serwerem, NVR, UPS i szafą 24U. Oryginalne problemy ćwiczeń pozostają celowe. Urządzenia montowane w szafie mają pozycje i opisy U; UPS domyślnie zajmuje 2U, pozostałe 1U.

| Konto       | Hasło testowe | NAS                      | Polityka                                     |
| ----------- | ------------- | ------------------------ | -------------------------------------------- |
| `admin`     | `admin-demo`  | AP Enterprise            | VLAN usług, zwykle 20                        |
| `pracownik` | `staff-demo`  | AP Enterprise            | VLAN pracowników 10; w projekcie biurowym 30 |
| `raspberry` | `iot-demo`    | przewodowy switch 802.1X | VLAN IoT/CCTV 30, a bez tej sieci VLAN usług |

W antywzorcu usługi i pracownik pozostają w istniejącym VLAN 10. Uwierzytelnienie nie naprawia jego płaskiej polityki.

Nowa lekcja **RADIUS: logowanie i dynamiczny VLAN** ma wariant błędny i poprawiony. Jej dodatkowe konto to `student` / `vlan-demo`, VLAN 20. W błędnym wariancie laptop używa złego hasła. W dużych projektach dodatkowe scenariusze sprawdzają dostęp administratora do HTTPS mini serwera, accounting i blokadę IoT przez ACL.

## Granice modelu

To edukacyjny model decyzji AAA, nie działający serwer ani implementacja protokołu. Hasła i shared secret są jawne w lokalnym projekcie oraz JSON: używaj wyłącznie danych demonstracyjnych. Nie ma wymiany EAP/PEAP/TLS, certyfikatów, AD, szyfrowania datagramów, MAB, RadSec, CoA ani zegarów reautoryzacji/session-timeout. Etykieta roli jest opisem; wykonywalna polityka to zgoda, VLAN, ograniczenie NAS i istniejące ACL.

Podstawa pojęć: [RADIUS Authentication, RFC 2865](https://www.rfc-editor.org/rfc/rfc2865), [802.1X i atrybuty VLAN, RFC 3580](https://www.rfc-editor.org/rfc/rfc3580), [Accounting, RFC 2866](https://www.rfc-editor.org/rfc/rfc2866). Model odtwarza zależności logiczne, nie komplet tych specyfikacji.
