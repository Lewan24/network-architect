# Indeks poradnika

Pełne lekcje są w aplikacji pod przyciskiem **Poradnik**. Ten skrót powstaje z `src/learning/guideContent.ts`; odtwórz go poleceniem `npm run docs:guide`.

## Jak korzystać

W **Przykładach** wybierz fikcyjną topologię biurową, małe środowisko, home lab, sieć ze strefami lub antywzorzec. W **Poradniku → Laboratoria** porównaj wariant z błędem z poprawionym i uruchom przygotowany test. Wczytanie projektu zastępuje bieżącą sieć i można je cofnąć. Sukces testu oznacza łączność, nie ocenę bezpieczeństwa.

## Plan projektowania

1. Zbierz wymagania
2. Zaplanuj strefy i adresację
3. Narysuj przepływy
4. Dobierz sprzęt i połączenia
5. Dodaj usługi bazowe
6. Wprowadź politykę i zarządzanie
7. Odbierz projekt testami

## Lekcje

| Temat                                    | Najważniejsza zasada                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VLAN: co naprawdę izoluje?               | Osobny VLAN nie jest automatycznie polityką dostępu. Sprawdź zarówno działającą usługę, jak i zabronione nowe połączenie. Ruch wewnątrz VLAN-u wymaga innych mechanizmów, np. zapory hosta lub izolacji portów.                                                                                                       |
| Access, trunk i native VLAN              | Nie używaj „wszystkie VLAN-y” jako zastępstwa planu. Native mismatch może połączyć niewłaściwe domeny; nie zawsze oznacza fizyczny link down. Nie zakładaj, że każda platforma taguje native tak samo.                                                                                                                |
| ACL: potrzebne usługi zamiast permit any | Testuj dozwolone i zabronione przepływy oraz odpowiedzi. Firewall modelu dopuszcza odpowiedź dozwolonego testu; nowe połączenie w przeciwnym kierunku nadal wymaga reguły. Samo otwarcie usługi na hoście nie jest zezwoleniem w ACL.                                                                                 |
| Adres IP, DHCP, brama i DNS              | DHCP relay jest potrzebny, gdy serwer znajduje się poza domeną L2 klienta — nie w każdej sieci z VLAN-ami. Adresy infrastruktury planuj stabilnie (statycznie lub przez rezerwacje); model nie ma jeszcze osobnego edytora rezerwacji. Brama jest potrzebna do obcych podsieci, DNS do nazw.                          |
| NAT i DMZ: publikuj usługę, nie panel    | W modelu ACL widzi cel po DNAT, a źródło przed SNAT. Na rzeczywistym sprzęcie sprawdź dokumentację danej platformy. Zdalną administrację planuj przez VPN/jump host i silne uwierzytelnianie; aplikacja nie emuluje VPN ani kont użytkowników.                                                                        |
| PoE i medium: licz budżet, nie ikonki    | Zostaw zapas dla rozbudowy i rzeczywistych wymagań sprzętu. Model nie jest pomiarem mocy, strat optycznych ani BER; dobór modułu i zasilania potwierdza dokumentacja konkretnego urządzenia. UPS i awarie instalacji elektrycznej nie są tu jeszcze emulowane.                                                        |
| RADIUS: użytkownik, autoryzacja i VLAN   | Uwierzytelnianie sprawdza tożsamość, autoryzacja określa zgodę i VLAN, a accounting opisuje sesję. Nadal potrzebujesz trunków, DHCP, bramy i ACL. Model przelicza decyzję na bieżąco; nie emuluje wymiany EAP/TLS, certyfikatów, AD, MAB ani czasów reautoryzacji. Dane testowe są jawne w lokalnym projekcie i JSON. |

## Źródła techniczne

- [RFC 2865: RADIUS Authentication](https://www.rfc-editor.org/rfc/rfc2865)
- [RFC 3580: 802.1X i przydzielanie VLAN](https://www.rfc-editor.org/rfc/rfc3580)
- [RFC 2866: RADIUS Accounting](https://www.rfc-editor.org/rfc/rfc2866)
- [Proxmox VE: interfejs administracyjny](https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_gui)
- [Home Assistant: dostęp do usługi](https://www.home-assistant.io/getting-started/onboarding/)
- [PostgreSQL: port usługi](https://www.postgresql.org/docs/current/app-postgres.html)
- [ASD: segmentacja i oddzielenie zarządzania](https://www.cyber.gov.au/publication/implementing-network-segmentation-and-segregation)
- [NIST SP 800-41: polityka zapory](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-41r1.pdf)
- [Cisco: konfiguracja trunków 802.1Q](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan-trunks.html)
- [RFC 2131: DHCP](https://www.rfc-editor.org/rfc/rfc2131.html)
- [RFC 8375: nazwy home.arpa](https://www.rfc-editor.org/rfc/rfc8375.html)
- [HPE Aruba: klasy i moc PoE 802.3bt](https://arubanetworking.hpe.com/techdocs/AOS-S/16.10/MCG/WC/content/wc/def-ter-802.3bt.htm)
- [pfSense: kolejność NAT i filtrowania](https://docs.netgate.com/pfsense/en/latest/nat/process-order.html)

## Konfiguracja i ograniczenia

[Konfiguracja sieci](CONFIGURATION.md) opisuje działanie modelu i jego granice. [Wi-Fi i dostęp](WIFI.md) obejmuje PPSK, RADIUS i MAB. Przykłady nie uruchamiają usług ani nie odtwarzają firmware fizycznych urządzeń.
