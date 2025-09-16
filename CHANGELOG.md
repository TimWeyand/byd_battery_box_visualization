# Changelog

## 0.0.2 — Visualization
- Modern modular card with separate custom elements (components/*), shared CSS (styles/battery.css) and HA wrapper (ha/byd-battery-box-visualization.js).
- Added a standalone test page with mock data (test/index.html).
- Responsive layout for towers and modules.
- SOC bar with color thresholds and charge/discharge animation.
- Voltage/Temperature toggle at tower header.
- Voltage bars per cell with historic min/max shading and balancing highlight.
- Temperature bars per sensor.
- New: Built-in Lovelace GUI editor (no YAML required for common options).
- New: Option show_gray_caps to disable gray caps beyond each cell's historic min/max in voltage view.
- Change: In Temperature mode, cell balancing does not affect the bar color.
- Change: Bottom cap between chart min and cell min is now light green (top cap remains gray).
- Change: Voltage rendering updated: green from cell min to current value, light gray from current to cell max, and white from cell max to chart max (no dark top cap). When balancing, bottom cap turns light blue.
- Fix: GUI editor debounced; no full re-render on each keystroke so focus is preserved while typing.
- Y-axis grid lines now start directly next to the axis labels and do not extend underneath them.
- Build: Added GitHub Action and esbuild-based bundling to produce a single-file plugin at byd-battery-box-visualization.js with CSS inlined. Updated HACS filename and README resource URL accordingly.

## 0.0.1 — Original test release
- Initial release of an early prototype card for BYD Battery Box Visualization.
