# BYD Battery Box Visualization

## Projektübersicht

Eine Home Assistant Lovelace Custom Card zur Visualisierung von BYD Battery Box Systemen. Funktioniert mit der [byd_battery_box](https://github.com/TimWeyand/byd_battery_box) Integration.

**Version**: 0.0.6
**Typ**: HACS Plugin (Lovelace Card)
**Repository**: https://github.com/TimWeyand/byd_battery_box_visualization

## Architektur

```
┌─────────────────────────────────────────────────────┐
│                  Home Assistant                      │
│  ┌───────────────────────────────────────────────┐  │
│  │     byd-battery-box-visualization.js          │  │
│  │     (HACS Lovelace Card - gebündeltes JS)     │  │
│  └───────────────────────────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────┼──────────────────────┐    │
│  │               Web Components                 │    │
│  │  ┌─────────────┐  ┌─────────────────────┐   │    │
│  │  │BatterySystem│──│    BatteryTower     │   │    │
│  │  │  (BMU)      │  │  (1-3 pro System)   │   │    │
│  │  └─────────────┘  └─────────────────────┘   │    │
│  │                          │                   │    │
│  │         ┌────────────────┼────────────┐     │    │
│  │         │                │            │     │    │
│  │  ┌──────────────┐ ┌──────────┐ ┌─────────┐ │    │
│  │  │BatteryHeader │ │Module 1-8│ │  Stand  │ │    │
│  │  │(SoC, Power)  │ │(Cells)   │ │(Deko)   │ │    │
│  │  └──────────────┘ └──────────┘ └─────────┘ │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Dateistruktur

```
byd_battery_box_visualization/
├── components/                  # Web Components (Quellcode)
│   ├── battery-system.js       # BMU Container (1-3 Towers)
│   ├── battery-tower.js        # Tower mit Header + Modulen
│   ├── battery-header.js       # SoC, Power, Versionen
│   ├── battery-module.js       # Zellen-Visualisierung (PERFORMANCE-KRITISCH)
│   └── battery-stand.js        # Dekorativer Ständer
├── ha/
│   └── byd-battery-box-visualization.js  # HA Card Wrapper + Editor
├── styles/
│   └── battery.css             # Shared Styles
├── scripts/
│   └── build.js                # esbuild Bundle-Script
├── build/
│   └── bundle-entry.js         # Entry Point für Build
├── test/
│   └── index.html              # Standalone Demo
├── byd-battery-box-visualization.js  # GEBÜNDELTES OUTPUT (für HACS)
├── hacs.json                   # HACS Konfiguration
├── package.json                # Version & Dependencies
└── .github/workflows/ci.yml    # CI/CD Pipeline
```

## Build-Prozess

```bash
npm install      # Dependencies installieren
npm run build    # Bundle erstellen
```

Das Build-Script (`scripts/build.js`):
1. Liest Version aus `package.json`
2. Minifiziert CSS aus `styles/battery.css`
3. Bundelt alle Components mit esbuild
4. Output: `byd-battery-box-visualization.js`

**Wichtig**: Version wird automatisch aus `package.json` gelesen!

## Sensor-Mapping (byd_battery_box → Visualization)

| byd_battery_box Sensor | Visualization Verwendung |
|------------------------|-------------------------|
| `sensor.bmu_power` | Header Power-Anzeige |
| `sensor.bmu_version` | Header Info |
| `sensor.bms_version` | Header Info |
| `sensor.total_capacity` | ETA Berechnung |
| `sensor.bms_X_cells_average_voltage` | Tower Discovery + Zellen-Daten |
| `sensor.bms_X_max_history_cell_voltage` | Chart Max + Zellen-History |
| `sensor.bms_X_min_history_cell_voltage` | Chart Min + Zellen-History |
| `sensor.bms_X_cells_average_temperature` | Temperatur-View |
| `sensor.bms_X_cells_balancing` | Balancing-Indikator (blaue Zellen) |
| `sensor.bms_X_state_of_charge` | SoC Anzeige |
| `sensor.bms_X_state_of_health` | Header Info |
| `sensor.bms_X_charge_total_energy` | Header Info |
| `sensor.bms_X_discharge_total_energy` | Header Info |
| `sensor.bms_X_efficiency` | Header Info |

## Performance-Optimierungen (v0.0.6)

### Problem (vor v0.0.6)
Bei 8 Modulen wurden ~48 volle DOM-Rebuilds pro HA-Update ausgeführt (jeder Setter rief sofort `_render()` auf).

### Lösung
1. **Debounce-Rendering** (`RENDER_DEBOUNCE_MS = 500`): Max 2 Updates/Sekunde
2. **Dirty-Flag**: Render nur bei tatsächlichen Datenänderungen
3. **DOM-Caching**: DOM nur einmal bauen, dann nur Werte patchen
4. **Wert-Vergleiche**: Setter prüfen ob sich Daten wirklich geändert haben
5. **disconnectedCallback**: Proper Cleanup gegen Memory Leaks

### Render-Flow
```
Setter-Aufruf → Wert geändert? → JA → _markDirty() → _dirty=true + _scheduleRender()
                                  ↓
               _doRender() (nach Debounce) → _dirty=true? → _render() + _dirty=false
```

## CI/CD Pipeline

`.github/workflows/ci.yml`:
1. **Build**: Kompiliert und prüft Bundle
2. **HACS Validation**: Prüft HACS-Kompatibilität
3. **Auto-Release** (nur auf main):
   - Patch-Version erhöhen
   - Alle Versionen synchronisieren
   - Git Tag erstellen
   - GitHub Release mit Bundle

**Recursion-Guard**: Commits mit `[skip-version]` oder `chore(build)` triggern kein neues Release.

## Entwicklungs-Workflow

1. Änderungen in `components/` oder `ha/` machen
2. `npm run build` ausführen
3. Lokal testen mit `test/index.html`
4. In HA testen: Bundle in `www/` kopieren
5. Commit & Push → CI erstellt automatisch neues Release

## Versionen synchron halten

Bei manuellem Version-Bump diese Dateien aktualisieren:
- `package.json` (Hauptquelle)
- `ha/byd-battery-box-visualization.js` (`UI_VERSION`)
- `components/battery-system.js` (CSS URL Parameter)

**Das Build-Script liest die Version aus `package.json`!**

## Bekannte Probleme & Lösungen

### Problem: Laggy bei vielen Modulen
**Ursache**: Zu viele Render-Aufrufe
**Lösung**: v0.0.6 Performance-Optimierungen (Debounce + Dirty-Flag)

### Problem: Tooltips funktionieren nicht in HA
**Ursache**: HA Shadow DOM retargeted Events
**Lösung**: Chart-Level Pointer-Events als Fallback

### Problem: CSS nicht geladen
**Ursache**: adoptedStyleSheets Timing
**Lösung**: `byd-css-ready` Event + Cleanup in disconnectedCallback

### Problem: Leere Charts beim initialen Laden (v0.0.7 behoben)
**Ursache**: Race Condition - Daten kamen an bevor Module gerendert waren
**Lösung**: `_hasRenderedOnce` Flag + sofortiger erster Render ohne Debounce

## Hilfreiche Befehle

```bash
# Build
npm run build

# Git Status prüfen
git status

# Letzte Commits
git log --oneline -10

# Bundle-Größe prüfen
ls -lh byd-battery-box-visualization.js

# Header der Bundle prüfen
head -1 byd-battery-box-visualization.js
```

## Abhängigkeiten

- **Runtime**: Keine (Vanilla JS Web Components)
- **Build**: esbuild

## Kontakt

- **Maintainer**: Tim Weyand
- **Issues**: https://github.com/TimWeyand/byd_battery_box_visualization/issues
