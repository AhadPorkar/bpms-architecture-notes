# Diagrams / Diagramme

## English

The documentation draws every diagram in Mermaid, so GitHub renders them inline. This folder holds the same C4 model
as code in [Structurizr DSL](https://docs.structurizr.com/dsl): [`structurizr/workspace.dsl`](structurizr/workspace.dsl).
It contains the system context, containers, components of the web application, one dynamic view (completing a work
item) and the production deployment.

View it locally with Structurizr Lite:

```bash
docker run -it --rm -p 8080:8080 -v "$PWD/diagrams/structurizr:/usr/local/structurizr" structurizr/lite
# then open http://localhost:8080
```

Validate it or export it to other formats with the [Structurizr CLI](https://github.com/structurizr/cli):

```bash
structurizr.sh validate -workspace diagrams/structurizr/workspace.dsl
structurizr.sh export -workspace diagrams/structurizr/workspace.dsl -format plantuml/c4plantuml -output out/
```

CI validates the workspace on every push.

## Deutsch

Die Dokumentation zeichnet alle Diagramme in Mermaid, damit GitHub sie direkt anzeigt. Dieser Ordner enthält dasselbe
C4-Modell als Code in [Structurizr DSL](https://docs.structurizr.com/dsl):
[`structurizr/workspace.dsl`](structurizr/workspace.dsl). Es umfasst den Systemkontext, die Container, die Komponenten
der Webanwendung, eine dynamische Sicht (Erledigen eines Work Items) und die produktive Verteilung.

Lokal ansehen mit Structurizr Lite:

```bash
docker run -it --rm -p 8080:8080 -v "$PWD/diagrams/structurizr:/usr/local/structurizr" structurizr/lite
# danach http://localhost:8080 öffnen
```

Validieren oder in andere Formate exportieren mit der [Structurizr CLI](https://github.com/structurizr/cli):

```bash
structurizr.sh validate -workspace diagrams/structurizr/workspace.dsl
structurizr.sh export -workspace diagrams/structurizr/workspace.dsl -format plantuml/c4plantuml -output out/
```

Die CI validiert den Workspace bei jedem Push.
