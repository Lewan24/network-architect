import { Info } from '@phosphor-icons/react';
import { Modal } from './Modal';

export function HelpDialog({ close, learn }: { close: () => void; learn?: () => void }) {
  return (
    <Modal
      title="Twój warsztat projektowania sieci"
      description="Najważniejsze gesty i skróty"
      close={close}
    >
      <div className="dialog-body help-content">
        <dl>
          <dt>Dodawanie</dt>
          <dd>
            Rozwiń kategorię w bibliotece, a następnie przeciągnij urządzenie na planszę lub kliknij
            jego miniaturę. Wyszukiwanie obejmuje nazwy, opisy i kategorie.
          </dd>
          <dt>Poruszanie się</dt>
          <dd>
            Przeciągaj tło lewym przyciskiem. Spacja + przeciągnięcie, środkowy przycisk albo
            narzędzie H przesuwają widok również nad urządzeniami. Kółko przybliża pod kursorem;
            Shift + kółko przesuwa widok. F dopasowuje całą sieć.
          </dd>
          <dt>Edycja i połączenia</dt>
          <dd>
            Dwuklik, Enter lub menu kontekstowe otwiera dialog urządzenia. C rozpoczyna łączenie:
            wybierz urządzenie, jego port, drugie urządzenie i port docelowy. Przycisk „Połącz
            urządzenie” jest też dostępny po zaznaczeniu obiektu. Delete usuwa zaznaczenie. Ctrl+Z
            cofa zmianę.
          </dd>
          <dt>VLAN-y i adresy</dt>
          <dd>
            Zdefiniuj podsieci przyciskiem „Sieci i VLAN-y”. W urządzeniu wybierz VLAN i adres
            automatyczny lub własny statyczny IP. Dwuklik obszaru otwiera edycję danej sieci. Brama
            jest rezerwowana; nie jest automatycznie tworzonym urządzeniem.
          </dd>
          <dt>Porty i interfejsy</dt>
          <dd>
            W urządzeniu otwórz „Porty i PoE” albo „Interfejsy IP”. Kliknij oznaczone gniazdo w
            panelu, aby je edytować. Zielony oznacza aktywny link, szary wolny port lub brak linku,
            czarny port wyłączony. Dwuklik kabla pozwala wybrać porty obu końców, native VLAN,
            medium i długość. Przycisk „Diagnostyka” pokazuje problemy i otwiera właściwą
            konfigurację.
          </dd>
          <dt>Reguły firewalla</dt>
          <dd>
            W dialogu firewalla wybierz zakładkę reguł. Pierwsze dopasowanie wygrywa. * oznacza
            dowolną wartość. Dla braku dopasowania wybierz „Domyślna reguła ACL”: permit any lub
            deny any.
          </dd>
          <dt>Symulacja</dt>
          <dd>
            Otwórz prawy panel przyciskiem „Symulacja”. Pakiet przechodzi przez każde urządzenie, a
            wynik pojawia się po animacji. Ruch z internetu wysyła kolejny pakiet po zakończeniu
            poprzedniego. Edycja topologii przerywa trwający test.
          </dd>
        </dl>
        <p className="info-line">
          <Info /> Symulacja jest modelem logicznym: z modelowymi ACL, statycznymi trasami i NAT;
          bez rzeczywistych pakietów i pełnego stosu TCP.
        </p>
      </div>
      <footer className="dialog-footer">
        {learn && (
          <button className="secondary" onClick={learn}>
            Poradnik i laboratoria
          </button>
        )}
        <button className="primary" onClick={close}>
          Rozumiem
        </button>
      </footer>
    </Modal>
  );
}
