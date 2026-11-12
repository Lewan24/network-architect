import { Question } from '@phosphor-icons/react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export const fieldTips = {
  vlan: 'Identyfikator domeny L2 (1–4094), a nie adres IP. Ustaw go zgodnie z access/trunk po obu stronach. Pomijasz tylko dla WAN lub jawnego interfejsu bez VLAN-u.',
  cidr: 'Adres sieci i długość maski, np. 192.168.10.0/24. W /24 użyteczne hosty to zwykle .1–.254. Ta podsieć nie powinna nakładać się na inne sieci routowane; wymagana przy tworzeniu VLAN-u.',
  gateway:
    'Adres interfejsu routera w tej samej podsieci co klient, np. 192.168.10.1. Potrzebny do innych sieci. Możesz pominąć bramę na karcie służącej wyłącznie lokalnej komunikacji.',
  svi: 'Wybierz urządzenie L3, które ma być bramą tej sieci. Sam switch L2 nie routuje. Wybierz „Brak”, jeśli sieć ma służyć tylko lokalnemu ruchowi L2.',
  dhcp: 'Serwer przydziela IP, maskę, bramę i DNS osiągalnym klientom. Nie włącza się przez samo połączenie kabli. Wyłącz, gdy wszystkie hosty mają zaplanowane adresy statyczne.',
  relay:
    'Przekazuje DHCP do serwera poza domeną L2 klienta. Wymaga routingu i zezwolenia UDP/67. Pomiń, gdy serwer DHCP jest lokalny lub nie używasz DHCP.',
  pool: 'Początek i koniec dostępnych adresów hostów w tej podsieci. Zostaw poza pulą bramę i urządzenia statyczne; nie używaj adresu sieci ani broadcast. Pomiń przy wyłączonym DHCP.',
  lease:
    'Czas ważności dzierżawy w minutach. Krótszy pomaga w sieciach z wieloma gośćmi, ale zwiększa odnowienia. Wartość 120 jest dobrym punktem startowym w laboratorium; pomiń bez DHCP.',
  dns: 'Serwer tłumaczący nazwy na IP. Musi mieć adres, usługę DNS i osiągalność UDP/TCP 53. Możesz pominąć, jeśli testujesz tylko adresy IP. Zmiana opcji DHCP wymaga odnowienia dzierżawy.',
  native:
    'PVID przypisuje VLAN ramkom nietagowanym. Native VLAN musi być uzgodniony po obu stronach trunku; tagowanie zależy od sprzętu. Pole pomijasz przy trybie access.',
  allowed:
    'Lista VLAN-ów przenoszonych trunkami. Ogranicz do wymaganych sieci na obu końcach. W aplikacji pusta lista oznacza wszystkie, nie żaden. Pomiń na porcie access.',
  speed:
    'Możliwości sprzętowe portu i ewentualnie wymuszona prędkość. Najczęściej pozostaw Auto. Wymuszaj tylko, gdy znasz ustawienia drugiego końca; różne prędkości mogą zerwać link.',
  duplex:
    'Auto jest zwykle właściwe po obu stronach. Half duplex dotyczy tu tylko 10/100 Mb/s; rozbieżność z full powoduje degradację. Nie zmieniaj bez konkretnej potrzeby.',
  module:
    'Włóż zgodne moduły po obu końcach i dobierz włókno oraz zasięg. SFP+ nie gwarantuje dowolnego standardu. Pomiń dla RJ45, Wi-Fi i pasywnego DAC.',
  poe: 'PSE zasila odbiornik PD. Potrzebny jest zgodny standard portu i budżet całego urządzenia, z uwzględnieniem strat kabla. Zostaw wyłączone dla urządzeń z lokalnym zasilaczem.',
  budget:
    'Suma rezerwacji po stronie zasilającego switcha, a nie tylko suma mocy przy odbiornikach. Dwie kamery po 12 W wymagają w modelu 30,8 W PSE. Pomiń, jeśli niczego nie zasilasz PoE.',
  power:
    'Moc wymagana przy odbiorniku PD, według dokumentacji urządzenia. Model dobiera klasę rezerwacji PSE. Nie wpisuj tu całkowitego budżetu switcha; pomiń przy zasilaniu lokalnym.',
  metric:
    'Przy takim samym prefiksie niższa metryka ma pierwszeństwo. Najpierw zawsze decyduje najdłuższy prefiks. Zostaw domyślną wartość, jeśli nie masz alternatywnych tras.',
  nextHop:
    'Router osiągalny w tej samej podłączonej domenie L2, również przez switch. Potrzebuje trasy odpowiedzi. Pomiń wpis, gdy cel pokrywa trasa connected lub nie używasz routingu statycznego.',
  route:
    'Docelowa podsieć, np. 192.168.20.0/24. 0.0.0.0/0 oznacza trasę domyślną. Model automatyczny nie jest protokołem OSPF/BGP; trasę można pominąć dla sieci connected.',
  nat: 'Publiczny adres i port mapujesz na konkretny host i port prywatny. Potrzebujesz także właściwej ACL; NAT nie zastępuje filtrowania. Nie publikuj usługi, jeśli ma działać tylko w LAN.',
  service:
    'Deklaracja usługi nasłuchującej na urządzeniu, nie reguła zezwalająca na firewallu. ICMP nie sprawdza otwarcia TCP/UDP. Pomiń usługę, której urządzenie nie udostępnia.',
  aclPort:
    'Docelowy port TCP/UDP, np. 443 dla HTTPS. Gwiazdka * pasuje do dowolnego portu. Dla ICMP pole jest pomijane, bo ICMP nie używa portów TCP/UDP. Wpis musi odpowiadać rzeczywistej usłudze i protokołowi.',
  acl: 'Pierwsza pasująca reguła decyduje. Zezwól na potrzebne przepływy i zakończ deny. ACL routingu nie blokuje ruchu hostów w jednym VLAN-ie, który omija firewall.',
  prefix:
    'Długość maski tej karty, np. 24 odpowiada 255.255.255.0. Błędna maska może kierować ruch do ARP zamiast do bramy. Przy DHCP wartość pochodzi z dzierżawy.',
} as const;
export type HelpTopic = keyof typeof fieldTips;
export function FieldHelp({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLSpanElement>(null),
    bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect(),
        b = bubble.current?.getBoundingClientRect();
      if (!r || !b) return;
      setPosition({
        left: Math.max(8, Math.min(r.left, window.innerWidth - b.width - 8)),
        top:
          r.bottom + b.height + 12 < window.innerHeight
            ? r.bottom + 8
            : Math.max(8, r.top - b.height - 8),
      });
    };
    bubble.current?.showPopover();
    place();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        ref={trigger}
        className="field-help"
        aria-label="Wyjaśnij ustawienie"
        aria-describedby={open ? id : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        onMouseEnter={() => {
          timer.current = setTimeout(() => setOpen(true), 250);
        }}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Question aria-hidden="true" />
      </span>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            popover="manual"
            role="tooltip"
            className="field-tooltip"
            style={position}
          >
            {fieldTips[topic]}
          </div>,
          trigger.current?.closest('dialog') || document.body,
        )}
    </>
  );
}
