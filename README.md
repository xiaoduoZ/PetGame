# PetGame 🐾  
**Microservice-Backend für tägliche Interaktionen mit einem digitalen Haustier**

PetGame ist ein spielerisches Backend-System, in dem Benutzer mit einem digitalen Haustier interagieren.
Wenn ein Benutzer tägliche Interaktionen (z. B. Wasser geben, Bewegung) erfolgreich abschließt, verbessert sich der Haustierstatus (HP/XP/Stimmung).
Bei verpassten Interaktionen sinken diese Werte.

# Konzept

## Services
### 1) interaction-service (Service A)
**Verantwortung**
- Interaktionsvorlagen verwalten
- Interaktionsabschlüsse erfassen
- Tagesstatus ermitteln (erledigt/verpasst)
- Events publizieren: `interaction.completed`, `interaction.missed`

### 2) pet-service (Service B)
**Verantwortung**
- Haustierstatus pro Benutzer verwalten: HP, XP, Level, Mood
- Events aus RabbitMQ konsumieren
- Statusänderungen

## Ablauf
1. Der Benutzer authentifiziert sich über **Keycloak** und erhält ein **JWT Access Token**.  
2. Der Benutzer ruft mit diesem JWT einen REST-Endpunkt des **interaction-service** auf und meldet eine Interaktion als abgeschlossen.  
3. Der **interaction-service** validiert das JWT, damit nur authentifizierte Benutzer die Schnittstellen verwenden können.  
4. Nach erfolgreicher Authentifizierung speichert der **interaction-service** die abgeschlossene Interaktion als „Fakt“ in seiner eigenen Datenbank **interaction_db**.  
5. Anschließend publiziert der **interaction-service** ein Ereignis in **RabbitMQ**, typischerweise `interaction.completed`, das alle notwendigen Informationen enthält, damit andere Services reagieren können.  
6. Der **pet-service** ist als Consumer an RabbitMQ angebunden und empfängt das `interaction.completed`-Event.  
7. Der **pet-service** prüft vor der Verarbeitung, ob das Event bereits verarbeitet wurde, um doppelte Zustandsänderungen durch wiederholte Zustellung zu verhindern.  
8. Danach wendet der **pet-service** seine Regel-Logik an und aktualisiert den Haustierzustand, z. B. HP und XP erhöhen, Level berechnen.  
9. Die aktualisierten Werte werden in der eigenen Datenbank **pet_db** gespeichert.  
10. Der Benutzer kann anschließend den aktuellen Haustierzustand über einen REST-Endpunkt des **pet-service** abrufen und sieht die Veränderung der Werte (HP/XP/Level).  
11. Während dieser gesamten Kette schreiben die Services Logs.

### Architekturschaubild
```text
Client (Postman)
   |
   | JWT via Keycloak
   v
+------------------------+                           +------------------+
| interaction-service    |-------------------------->| pet-service      |
| - Interactions/Logs    |                           | - Pet State      |
| - Missed Detection     |                           | - Rules/Levels   |
+-----------+------------+                           +---------+--------+
            | publish events                                   ^
            v                                                  | consume
      +-------------+                                          |
      | RabbitMQ    |------------------------------------------+
      | topics:     |
      | - interaction.completed
      | - interaction.missed
      +-------------+

interaction-service -> interaction_db 
pet-service         -> pet_db         

Logs: Services -> Promtail -> Loki -> Grafana
Metrics: Services -> Prometheus -> Grafana
```

## Verantwortlichkeiten der anderen Komponenten
### Keycloak
- Die Microservices implementieren keine eigene Login-/Passwortlogik, sondern validieren lediglich die von Keycloak ausgestellten Tokens.

### RabbitMQ
- RabbitMQ dient als Transport für Events zwischen den Microservices.
- Der interaction-service publiziert Events als Producer, und der pet-service konsumiert sie als Consumer.  

### PostgreSQL
- Eigene Datenbank für interaction-service
- Eigene Datenbank für pet-service
- Andere Services greifen nicht direkt auf diese Datenbank zu, sodass der Datenschnitt über APIs und Events erfolgt.

### Prometheus (Monitoring / Metriken)
- Prometheus speichert diese Kennzahlen als Zeitreihen, sodass Last, Fehlerraten und Verarbeitungsvolumen über Zeit sichtbar werden.

### Promtail (Log-Collector)
- Promtail sammelt die Logs der laufenden Container, versieht sie mit Labels und leitet sie an Loki weiter.  

### Loki (zentrale Log-Aggregation)
- Loki speichert Logs zentral und ermöglicht das Suchen und Filtern nach Labels und Zeitbereichen.  
- In der Demo kann damit gezeigt werden, dass Events verarbeitet wurden und welche Schritte dabei geloggt wurden.

### Grafana (Visualisierung)
- Grafana visualisiert sowohl Metriken (aus Prometheus) als auch Logs (aus Loki) in Dashboards.

### Docker
- Docker Compose startet die vollständige Umgebung.

## Technologiewahl
- **Python (FastAPI)** für beide Services  
  - schnelle Umsetzung, klare Struktur, gute Bibliotheken

## Planung der Arbeit
Da es sich um ein Einzelarbeit handelt, werde ich alles übernehmen.

1. **Konzept & Setup:** Architektur festlegen, Repo erstellen.
2. **Infrastruktur:** Docker Compose für Keycloak, RabbitMQ und zwei PostgreSQL-Datenbanken aufsetzen.  
3. **interaction-service:** REST-Endpunkte implementieren, JWT-Validierung integrieren, Interaktionen in `interaction_db` speichern und Events an RabbitMQ publizieren.  
4. **pet-service:** REST-Endpunkte implementieren, JWT-Validierung integrieren, Events aus RabbitMQ konsumieren, Regel anwenden und Haustierstatus in `pet_db` speichern.  
5. **Service-Kommunikation nachweisen:** Mindestens einen REST-Call zwischen den Services umsetzen.  
6. **Monitoring:** Zentrale Logs (Loki/Promtail/Grafana) und Metriken (Prometheus/Grafana) anbinden.  
7. **Tests & Abgabe:** Postman Tests vorbereiten (Auth + Kernablauf).













