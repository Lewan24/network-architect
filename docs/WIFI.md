# Wi-Fi i kontrola dostępu

## SSID i VLAN

AP ma osobny VLAN zarządzania oraz podstawowy i dodatkowe SSID. Klienta podłącza się do portu wybranego SSID; nazwa Wi-Fi sama nie zestawia połączenia. Bez dynamicznego przydziału obowiązuje VLAN SSID. Wszystkie potrzebne VLAN-y muszą przechodzić przez uplinki do bramy.

## PPSK: różne hasła jednego SSID

W **AP → Urządzenie → PPSK** włącz przypisywanie VLAN-ów hasłami. Dodaj profil z nazwą, aktywnością, hasłem i VLAN-em. W **Klient → Urządzenie → Połączenie Wi-Fi / PPSK** wpisz hasło przy podłączonej karcie.

| Przykład: SSID `Lab` | Hasło testowe          | VLAN |
| -------------------- | ---------------------- | ---: |
| Pracownik            | `lab-staff-test-123`   |   10 |
| Drukarka             | `lab-printer-test-123` |   30 |

Przy PPSK VLAN klienta wynika z hasła, a nie z ustawienia access na jego porcie Wi-Fi. AP może obsługiwać jednocześnie oba VLAN-y na jednym SSID. Kablowe uplinki muszą być trunkami przenoszącymi te sieci. Po zmianie VLAN-u użyj DHCP albo właściwego statycznego IP i bramy.

Każdy SSID ma własne profile; dodatkowe SSID nie dziedziczą haseł podstawowego. Hasła są unikalne w ramach SSID: 8–63 drukowalne znaki ASCII lub 64 znaki HEX. Błędne, wyłączone albo usunięte hasło blokuje ruch i usuwa automatyczną dzierżawę. Statyczny IP nie omija blokady. Pusta lista PPSK odrzuca wszystkich klientów; wyłączenie całej funkcji wraca do wcześniejszego modelu stałego VLAN-u bez sprawdzania hasła.

Model nie wymaga RADIUS-a i nie odtwarza wymiany kryptograficznej WPA. PPSK nie można obecnie łączyć z globalnymi ustawieniami Wi-Fi Enterprise/MAB tego samego AP. Obsługę i ograniczenia PPSK na sprzęcie sprawdź w jego dokumentacji.

## RADIUS, 802.1X i MAB

1. Dodaj serwer RADIUS: aktywne konta/polityki, autoryzacja, ewentualny VLAN i lista zaufanych NAS.
2. Skonfiguruj AP lub zarządzalny switch jako NAS z tym samym shared secret. Zapewnij dostęp z jego interfejsu zarządzania do RADIUS UDP/1812; accounting używa UDP/1813.
3. Włącz Wi-Fi Enterprise albo kontrolę 802.1X na portach access switcha. Klient korzysta z profilu logowania.
4. Dla MAB włącz uwierzytelnianie po MAC i dodaj odpowiadającą politykę MAC na RADIUS. Dynamiczny VLAN wymaga włączenia tej opcji na NAS oraz poprawnych trunków i DHCP.

Odrzucenie autoryzacji blokuje dostęp. Zdarzenia i accounting są widoczne w edytorze RADIUS. Importowana sesja jest przeliczana i nie stanowi dowodu dostępu. Model obsługuje jeden kontrolowany interfejs klienta; MAB na AP obejmuje obecnie wszystkie jego SSID. Nie ma automatycznej kolejności prób 802.1X → MAB ani awaryjnego guest VLAN-u.

Nowe urządzenia otrzymują trwały w projekcie, lokalnie administrowany MAC unicast. Kopiowanie generuje nowy adres, a „Wylosuj MAC” zmienia tożsamość MAB. MAC można podszyć; nie zastępuje silnego uwierzytelniania. Sama funkcja L3 switcha nie oznacza obsługi przydziału VLAN po MAC klienta Wi-Fi.

Hasła i shared secret są zapisane jawnie w JSON. Używaj wyłącznie danych demonstracyjnych; w repozytorium przechowuj niezależne, fikcyjne próbki testowe.

## Materiały techniczne

- [RFC 2865 — RADIUS](https://www.rfc-editor.org/rfc/rfc2865.html)
- [RFC 3580 — przydział VLAN przez RADIUS](https://www.rfc-editor.org/rfc/rfc3580.html)
- [PPSK i dynamiczne VLAN-y — dokumentacja producenta](https://help.ui.com/hc/en-us/articles/29887064407319-Using-PPSK-RADIUS-for-Multiple-VLANs-On-an-SSID-in-UniFi-Network)
