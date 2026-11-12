import { Info } from '@phosphor-icons/react';
import { Modal } from './Modal';

export function HelpDialog({ close }: { close: () => void }) {
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
            Dwuklik, Enter lub menu kontekstowe otwiera dialog urządzenia. C łączy dwa wskazane
            obiekty. Delete usuwa zaznaczenie. Ctrl+Z cofa zmianę.
          </dd>
          <dt>VLAN-y i adresy</dt>
          <dd>
            Zdefiniuj podsieci przyciskiem „Sieci i VLAN-y”. W urządzeniu wybierz VLAN i adres
            automatyczny lub własny statyczny IP. Dwuklik obszaru otwiera edycję danej sieci. Brama
            jest rezerwowana; nie jest automatycznie tworzonym urządzeniem.
          </dd>
          <dt>Reguły firewalla</dt>
          <dd>
            W dialogu firewalla wybierz zakładkę reguł. Pierwsze dopasowanie wygrywa. * oznacza
            dowolną wartość. Dla braku dopasowania wybierz Default ACL rule: permit any lub deny
            any.
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
        <button className="primary" onClick={close}>
          Rozumiem
        </button>
      </footer>
    </Modal>
  );
}
