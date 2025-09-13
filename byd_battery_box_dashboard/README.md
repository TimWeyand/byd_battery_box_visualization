# BYD Battery Box Dashboard Card

Visualize BYD Battery Box modules and cells with current, min/max voltages and temperatures.

[![Open your Home Assistant instance and open this repository in HACS (Plugin).](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TimWeyand&repository=byd_battery_box&category=plugin)

![Preview](../images/logo-2.png?raw=true "BYD Battery Box Dashboard")

## Installation (HACS)
1. In Home Assistant → HACS → Integrations → Three-dots → Custom repositories → Add:
   - Repository: TimWeyand/byd_battery_box
   - Category: Plugin
2. Install "BYD Battery Box Dashboard" from HACS.
3. Add the resource (Settings → Dashboards → Resources):
   - url: /hacsfiles/byd_battery_box_dashboard/byd-battery-box-dashboard.js
   - type: module

## Add the card (GUI)
Use the Lovelace UI to add the card and select your BYD devices/sensors. Defaults are shown in the editor.

## Example (YAML)
- type: custom:byd-battery-box-dashboard
  title: BYD Battery Box
  entity: sensor.bms_1_cells_average_voltage
  days: 3

Notes:
- The card shows per-module, per-cell values.
- Voltage mode (mV): green=current, light gray=max, red=min (if history attributes are available: cell_voltages_min/max).
- Temperature mode (°C): shows current; min/max are not used for temperature.
