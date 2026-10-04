# ADR-0003: Laufende Instanzen bleiben auf ihrer Startversion

[ADR-Übersicht](README.md) · [English](../../en/adr/0003-pin-running-instances-to-their-version.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Prozess-Engine, Prozessdesigner, Monitoring |
| Verwandt | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0011](0011-test-sandbox-inside-the-production-engine.md) |

## Kontext

Unsere Kunden ändern ihre Prozesse häufig: eine neue Genehmigungsstufe, eine andere Abteilung, eine Regel aus einer
neuen Vorschrift. Instanzen leben Tage oder Monate. Eine Änderung kann Elemente entfernen, umbenennen oder neu
verknüpfen, auf denen laufende Instanzen gerade stehen.

Analysten veröffentlichen Änderungen selbst, während der Arbeitszeit, ohne Release-Fenster. Der Audit-Trail muss
jeden Fall auf genau dem Diagramm darstellen, dem er gefolgt ist, denn genau das verlangen Auditoren und Gerichte.

## Entscheidungstreiber

- Eine Veröffentlichung darf niemals einen laufenden Fall beschädigen.
- Die Historie muss reproduzierbar sein: „Zeig mir den Pfad, den dieser Fall genommen hat, auf dem Diagramm, auf dem
  er ihn genommen hat“.
- Analysten müssen eine fehlerhafte Änderung in Sekunden zurückrollen können.
- Die Regel muss einfach genug sein, um sie Nicht-Entwicklern zu erklären.

## Betrachtete Optionen

1. **Direkt bearbeiten.** Eine Definition pro Prozess; laufende Instanzen folgen dem bearbeiteten Graphen.
2. **Beim Veröffentlichen migrieren.** Jede laufende Instanz wechselt anhand eines Element-Mapping-Plans auf die neue
   Version, so wie Camunda es mit Migrationsplänen macht.
3. **An die Version binden.** Versionen sind unveränderlich; neue Instanzen verwenden die aktive Version, laufende
   Instanzen werden auf ihrer eigenen zu Ende geführt.
4. Standardmäßig an die Version binden, mit optionaler Migration für einfache Fälle.

## Entscheidung

Option 3.

- Eine **Prozessgruppe** ist die stabile Identität: Name, Menüeintrag, Symbol und Berechtigungen.
- Jede Veröffentlichung erzeugt eine neue, **unveränderliche Version** in der Gruppe. Das vollständige XML wird
  gespeichert, zusammen mit einer relationalen Projektion seiner Elemente, Routen, Lanes und Einstellungen.
- **Genau eine Version pro Gruppe ist aktiv.** Nur sie wird für neue Starts verwendet. Eine Veröffentlichung
  deaktiviert die anderen in derselben Transaktion.
- Eine **Instanz speichert die ID ihrer Version**. Jeder Zugriff zur Laufzeit filtert nach dieser ID. Inaktive
  Versionen führen ihre bestehenden Instanzen weiter aus, bis die letzte endet.
- **Rollback** bedeutet, die vorherige Version zu reaktivieren.
- **Aussetzen** ist ein eigener Schalter pro Version. Er nimmt die Arbeit dieser Version aus dem Posteingang, zum
  Beispiel während ein Datenproblem untersucht wird, ohne die Daten anzutasten.
- **Call Activities** lösen den aufgerufenen Prozess zum Aufrufzeitpunkt auf, und zwar auf die *aktive* Version der
  Zielgruppe. Das Startereignis wird über seine BPMN-ID zugeordnet, sodass sich ein Subprozess eigenständig
  weiterentwickeln kann.
- **Start-Timer** gehören zu einer Version. Eine Veröffentlichung pausiert die Start-Timer der alten Version. Der
  Zeitplan der neuen Version wird ausdrücklich in der Prozessliste scharf geschaltet, sodass ein veröffentlichtes
  Diagramm nie überraschend Fälle startet.
- **Entwürfe** werden getrennt von den Versionen gespeichert, je Benutzer, Rolle und Browser, sodass unfertige
  Bearbeitungen nie in die Produktion gelangen.

## Konsequenzen

### Vorteile

- Eine Veröffentlichung hat keine Auswirkungen auf laufende Arbeit. Analysten veröffentlichen tagsüber.
- Der Audit-Trail stellt jeden Fall auf seinem eigenen Diagramm dar, mit hervorgehobenem durchlaufenem Pfad.
- Ein Rollback greift sofort und erfordert keine Datenänderung.
- Die Regel ist leicht zu erklären: „Ein Fall endet so, wie er begonnen hat“.

### Nachteile

- **Korrekturen erreichen laufende Fälle nicht.** Eine falsche Bedingung bleibt für jede Instanz falsch, die bereits
  auf dieser Version läuft. Wir mussten Administrationswerkzeuge bauen, um eine Instanz auf einen anderen Schritt zu
  verschieben, sie zurückzusetzen oder zu verwerfen.
- **Viele Versionen existieren nebeneinander.** Das Monitoring muss versionsbewusst sein, und der Support muss
  prüfen, auf welche Version sich eine Beschwerde bezieht.
- **Der Speicherbedarf wächst** mit jeder Veröffentlichung, weil jede Version ihr XML und ihre Projektion behält.
- **Einstellungen liegen doppelt vor**, im XML und in der relationalen Projektion. Das Bearbeiten der Einstellungen
  eines Elements muss beide aktualisieren. Laufen sie auseinander, gleichen Reparaturroutinen sie wieder ab.
- **Call Activities können überraschen.** Eine Elterninstanz auf Version 3 kann eine Kindinstanz aufrufen, deren
  Prozess seit dem Start der Elterninstanz auf Version 7 gewechselt ist. Das ist beabsichtigt, muss aber
  dokumentiert werden.

## Rückblickend

Die Bindung an die Version ist der richtige Standard, und ich würde sie beibehalten. Drei Dinge würde ich ergänzen
oder ändern:

1. **Optionale Migration für einfache Änderungen.** Wo eine Zuordnung von Element zu Element existiert
   (umbenannter Task, hinzugefügter optionaler Schritt), diese mit einem Probelauf (Dry Run) anbieten, der die
   betroffenen Instanzen auflistet.
2. **Eine einzige maßgebliche Quelle.** Entweder das XML oder die relationalen Zeilen. Das jeweils andere ableiten,
   nie beide bearbeiten.
3. **Version überall sichtbar:** im Posteingang, auf der Fallseite und in den BAM-Filtern, damit „Welche Version?“
   nie zur Support-Frage wird.
