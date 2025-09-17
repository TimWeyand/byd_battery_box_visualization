# Changelog

## 0.0.4
- Changing cell optics
- Incremental update rendering: header no longer re-creates its DOM on every update; text, classes, SOC fill and values are patched in place for smoother updates.
- Header now shows per‑tower capacity (sensor.total_capacity divided by number of towers) and, when not idle, an ETA to full/empty based on a 5‑minute average of BMU power.
- HA wrapper computes a rolling 5‑minute power average and passes capacity/ETA to each tower header.
- Test page updated to simulate total capacity and to display per‑tower capacity and ETA based on BMU power.
- New module view "Minimal" - shows temperature value centered in the temperature bar; voltage bar displays a blue gradient when any cell is balancing (horizontal, right→left).
- New module view: "No Data" – renders only the module name at header-like height (for compact dashboards or placeholder state).
- Performance: CSS is now guaranteed to be loaded exactly once by the battery-system component. Child elements (header, tower, module, stand) do not fetch or re-create CSS; they adopt a shared Constructable StyleSheet instance exposed globally. The system dispatches a `byd-css-ready` event once CSS is prepared so children can adopt without polling.
- ETA now hides immediately when the system becomes idle (instantaneous power ≈ 0 W). We use the 5‑minute average only for rate smoothing when charging/discharging; idle detection uses the current power reading.

## 0.0.3 — Responsiveness and UX tweaks
- Header: hide version information automatically when the tower width is below 300px (saves space on narrow cards).
- Layout spacing: reduced vertical spacing by half between header ↔ modules, between modules, and modules ↔ stand.
- Small-width graph fix: when a module is narrower than 256px, cell bars no longer overflow; min-width and gaps shrink and the chart clips overflow.
- Narrow modules (<300px): start thinning bars earlier with a small gap preserved (1px) and reduced axis label size to 10px to prevent overflow around ~270px.
- Extra-narrow modules (<256px): bars no longer disappear due to overflow; cell min-width reduced to 0 and gaps to 0, and Y-axis label font-size reduced for space.
- Faster toggles: mV/°C and Versions now react on pointerdown for snappier interaction (less perceived lag on touch/HA).
- Smoother animations: removed per-update keyframe triggers; height/bottom transitions now animate seamlessly without restarting.

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
