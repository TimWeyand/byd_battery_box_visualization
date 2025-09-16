# BYD Battery Box Visualization (Lovelace Card)
BYD HVS & BYD HVM Visualization for HACS [byd_battery_box](https://github.com/redpomodoro/byd_battery_box) (Home Assistant)

Visualize BYD Battery Box modules and cells with current, min/max voltages and temperatures in Home Assistant.

![Preview](./images/preview.png?raw=true "BYD Battery Box Visualization")

## Installation (HACS)

[![Open your Home Assistant instance and open this repository in HACS (Frontend/Lovelace).](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TimWeyand&repository=byd_battery_box_visualization&category=frontend)

1. In Home Assistant → HACS → Frontend → Three-dots → Custom repositories → Add:
   - Repository: TimWeyand/byd_battery_box_visualization
   - Category: Frontend
2. Install "BYD Battery Box Visualization" from HACS.
3. Add the resource (Settings → Dashboards → Resources):
   - URL: /hacsfiles/byd_battery_box_visualization/byd-battery-box-visualization.js (type: module)

## Add the card (GUI)
Use the Lovelace UI to add the card `custom:byd-battery-box-visualization`. A built-in editor is provided (no YAML needed) to set chart ranges, unit, Y-axis visibility, and whether to show gray caps beyond each cell's historic min/max.

## Example (YAML)
- type: custom:byd-battery-box-visualization
  voltage_min: 3100
  voltage_max: 3500
  temp_min: 10
  temp_max: 45
  show_y_axis: true  # set to false to hide the Y-axis guide and labels
  show_gray_caps: true  # set to false to disable gray caps beyond per-cell historic min/max

Notes:
- The card auto-discovers entities from the `byd_battery_box` integration. There is 1 BMU and up to 3 BMS (towers).
- Each tower renders a header (SOC bar with charge/discharge animation), modules (2–10) and a stand.
- Voltage view: per-cell bars showing current (green), optional dark gray caps to indicate chart range beyond each cell's historic min/max (disable via show_gray_caps). Balancing cells turn blue.
- Temperature view: shows per-sensor bars; balancing does not change bar color. Toggle between mV/°C in the header.
- Hover or click on any bar to show its value as a tooltip.
- All custom components are fully responsive and can be tested without Home Assistant (see below).

## Test page / Development
Open `test/index.html` in a browser to see the standalone demo filled with mock data (no Home Assistant required).

Controls on the test page:
- Show Y-axis checkbox: toggles axis labels and full-width guide lines on modules.
- Randomize button: regenerates SOC, SOH, per-cell voltages, historic min/max, balancing, temperatures, and BMU power.

Included mock data (test/mock-data.js):
- 3 towers, each with 5 modules by default
- Per-cell voltages (32 per module), historic min/max derived from the current values
- Per-cell balancing flags
- Per-sensor temperatures (half the number of cells)
- BMU power and versions