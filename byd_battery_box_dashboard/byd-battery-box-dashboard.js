class BYDBatteryBoxDashboard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('byd-battery-box-dashboard-editor');
  }
  static getStubConfig() { return { entity: '', days: 3, title: 'BYD Battery Box', voltage_min: 3100, voltage_max: 3700, temp_min: 10, temp_max: 40, unit: 'mV' }; }
  setConfig(config) { this._config = config; this._unit = config.unit || 'mV'; }
  set hass(hass) { this._hass = hass; this.render(); }

  getCardSize() { return 6; }

  _updateConfig(patch) {
    // Filter out undefined/null keys to avoid overwriting existing values during reconfigure
    const clean = {};
    Object.keys(patch||{}).forEach(k=>{ if (patch[k] !== undefined && patch[k] !== null) clean[k] = patch[k]; });
    this._config = { ...(this._config || {}), ...clean };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  render() {
    if (!this._hass) return;
    const cfg = this._config || {};
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = '';
    const card = document.createElement('ha-card');
    card.header = cfg.title || 'BYD Battery Box';

    const style = document.createElement('style');
    style.textContent = `
      .wrap { padding: 12px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .chips { display: inline-flex; gap: 6px; }
      .chip { padding: 4px 8px; border-radius: 12px; background: var(--ha-card-background, #eee); border: 1px solid var(--divider-color); cursor: pointer; user-select: none; }
      .chip.active { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }
      .soc { font-weight: 600; color: var(--primary-text-color); }
      .container { display: flex; align-items: flex-end; gap: 12px; }
      .axis { position: relative; height: 220px; width: 52px; border-right: 1px solid var(--divider-color); }
      .tick { position: absolute; left: 0; width: 100%; border-top: 1px dashed var(--divider-color); font-size: 11px; color: #fff; }
      .tick-label { position: absolute; left: 0; top: -7px; transform: translateY(-50%); color: #fff; }
      .modules { display: inline-block; }
      .module { display: inline-block; margin: 0 9px; vertical-align: bottom; }
      .unit-skin { position: relative; padding: 6px 6px 2px 58px; border-radius: 6px; background: linear-gradient(180deg,#555 0%, #3d3d3d 100%); box-shadow: inset 0 1px 2px rgba(255,255,255,.1), inset 0 -1px 2px rgba(0,0,0,.4); }
      .axis-mini { position: absolute; left: 6px; top: 6px; height: 165px; width: 52px; }
      .cell { width: 6px; margin: 0 1px; display: inline-block; position: relative; height: 165px; background: linear-gradient(to top, #f2f2f2 0%, #e5e5e5 100%);} 
      .bar { position: absolute; bottom: 0; width: 100%; }
      .min { background: #d32f2f; }
      .cur { background: #4caf50; opacity: 0.75; }
      .max { background: #9e9e9e; opacity: .5; }
      .labels { text-align: center; font-size: 12px; margin-top: 4px; color: var(--secondary-text-color); }
      .unit-caption { position: absolute; right: 4px; bottom: 4px; font-size: 10px; color: #fff; background: rgba(0,0,0,0.25); padding: 0 4px; border-radius: 3px; }
      .tip { position: absolute; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #fff; font-size: 10px; padding: 2px 4px; border-radius: 3px; pointer-events: none; z-index: 2; white-space: nowrap; }
      .bal { position: absolute; bottom: 0; left: 10%; width: 80%; height: 4px; background: #2196f3; border-radius: 3px; z-index: 3; opacity: 0.95; }

      /* Header module styles */
      .header-module { display: inline-block; margin: 0 9px 10px 9px; vertical-align: bottom; }
      .header-skin { position: relative; height: 60px; border-radius: 6px; background: linear-gradient(180deg,#5a5a5a 0%, #3e3e3e 100%); box-shadow: inset 0 1px 2px rgba(255,255,255,.08), inset 0 -1px 2px rgba(0,0,0,.45); padding: 10px 12px; }
      .header-skin .chips { position: absolute; top: 8px; right: 10px; }
      .byd-logo { position: absolute; left: 14px; bottom: 8px; color: #ff3b3b; border: 2px solid #ff3b3b; border-radius: 999px; padding: 1px 6px; font-weight: 700; font-size: 12px; }
      .lock-dot { position: absolute; left: 10px; top: 10px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #c0c0c0; background: radial-gradient(circle, #f0f0f0 0%, #bdbdbd 70%, #8d8d8d 100%); }
      .soc-box { position: absolute; left: 12px; right: 100px; top: 18px; }
      .soc-track { height: 12px; background: rgba(0,0,0,0.35); border-radius: 6px; position: relative; overflow: hidden; }
      .soc-fill { position: absolute; top: 0; left: 0; bottom: 0; width: 0; background: #2196f3; border-radius: 6px; }
      .soc-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-weight: 600; color: #fff; font-size: 12px; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    // Build unit toggle chips now; they will be placed inside the header module later
    const chips = document.createElement('div'); chips.className = 'chips';
    const units = ['mV','°C'];
    const activeUnit = (this._config?.unit || this._unit || 'mV');
    units.forEach(u=>{
      const ch = document.createElement('div'); ch.className = 'chip' + (u===activeUnit?' active':''); ch.textContent = u;
      ch.addEventListener('click', ()=>{ this._unit = u; this._updateConfig({ unit: u }); this.render(); });
      chips.appendChild(ch);
    });

    // Current display unit mode
    const unitMode = (this._unit || cfg.unit || 'mV');

    // Resolve entity (voltage): prefer configured entity, then entities_bms[0], then auto-pick a BYD cells voltage sensor
    let entId = cfg.entity;
    if (!entId && Array.isArray(cfg.entities_bms) && cfg.entities_bms.length > 0) {
      entId = cfg.entities_bms.find(e => this._hass.states[e]) || cfg.entities_bms[0];
    }
    if (!entId) {
      const match = Object.keys(this._hass.states).find(e => /^sensor\.bms_\d+_cells_average_voltage$/.test(e));
      if (match) entId = match;
    }
    entId = entId || 'sensor.bms_1_cells_average_voltage';
    const stVolt = this._hass.states[entId];
    if (!stVolt) {
      wrap.innerHTML = `Entity not found: ${entId}`;
      card.appendChild(style); card.appendChild(wrap); root.appendChild(card); return;
    }
    // If temperature mode, try to resolve the matching temperature entity, but keep voltage for counts
    const tempEntCandidate = entId.replace('_cells_average_voltage', '_cells_average_temperature');
    const stTemp = this._hass.states[tempEntCandidate];
    let st = unitMode === '°C' && stTemp ? stTemp : stVolt;

    // Compute BMS id
    const bmsMatch = /sensor\.bms_(\d+)_/.exec(entId);
    const bmsId = bmsMatch ? bmsMatch[1] : '1';

    // Build header module with SOC bar and toggle
    const headerModule = document.createElement('div');
    headerModule.className = 'header-module';
    const headerSkin = document.createElement('div'); headerSkin.className = 'header-skin';
    // Move chips (unit toggle) into header skin
    headerSkin.appendChild(chips);
    // Decorative elements
    const lock = document.createElement('div'); lock.className = 'lock-dot'; headerSkin.appendChild(lock);
    const logo = document.createElement('div'); logo.className = 'byd-logo'; logo.textContent = 'BYD'; headerSkin.appendChild(logo);
    // SOC bar
    const socBox = document.createElement('div'); socBox.className = 'soc-box';
    const socTrack = document.createElement('div'); socTrack.className = 'soc-track';
    const socFill = document.createElement('div'); socFill.className = 'soc-fill';
    const socLabel = document.createElement('div'); socLabel.className = 'soc-label'; socLabel.textContent = '';
    socTrack.appendChild(socFill); socTrack.appendChild(socLabel); socBox.appendChild(socTrack);
    headerSkin.appendChild(socBox);
    headerModule.appendChild(headerSkin);

    // Resolve SOC value, prefer configured soc_entity then fall back to candidates
    let socVal = undefined;
    const preferSocId = cfg.soc_entity;
    if (preferSocId && this._hass.states[preferSocId]) {
      const n = parseFloat(this._hass.states[preferSocId].state);
      if (!isNaN(n)) socVal = Math.max(0, Math.min(100, n));
    }
    if (typeof socVal !== 'number') {
      const socCandidates = [
        `sensor.bms_${bmsId}_soc`,
        `sensor.bydb_bms_${bmsId}_soc`,
        'sensor.soc',
        'sensor.bmu_soc',
        'sensor.state_of_charge'
      ];
      for (const id of socCandidates) {
        const stSoc = this._hass.states[id];
        const n = stSoc ? parseFloat(stSoc.state) : NaN;
        if (!isNaN(n)) { socVal = Math.max(0, Math.min(100, n)); break; }
      }
    }
    // Global fallback scan: look for a sensor with id ending in state_of_charge or _soc
    if (typeof socVal !== 'number') {
      const keys = Object.keys(this._hass.states);
      const cand = keys.find(k => k.startsWith('sensor.') && (/state_of_charge$/i.test(k) || /_soc$/i.test(k)));
      if (cand) {
        const n = parseFloat(this._hass.states[cand].state);
        if (!isNaN(n)) socVal = Math.max(0, Math.min(100, n));
      }
    }
    const pct = typeof socVal === 'number' ? socVal : 0;
    socLabel.textContent = `${pct.toFixed(0)}%`;
    socFill.style.width = `${pct}%`;
    // Color thresholds: red <20, blue 20-80, green >80
    if (pct < 20) socFill.style.background = '#d32f2f';
    else if (pct <= 80) socFill.style.background = '#2196f3';
    else socFill.style.background = '#4caf50';

    const h = 165; // px height of bars/axis

    // Prepare data and scaling depending on unit mode
    let minCfg, maxCfg, fmtLabel, getCells;
    let minHist, maxHist, useHistory;

    if (unitMode === '°C') {
      minCfg = Number(cfg.temp_min ?? 10);
      maxCfg = Number(cfg.temp_max ?? 40);
      fmtLabel = (v) => `${v.toFixed(0)} °C`;
      getCells = (mod) => mod.t || [];
      useHistory = false;
    } else {
      minCfg = Number(cfg.voltage_min ?? 3100);
      maxCfg = Number(cfg.voltage_max ?? 3700);
      fmtLabel = (mv) => `${mv} mV`;
      getCells = (mod) => mod.v || [];
      const minKey = 'cell_voltages_min';
      const maxKey = 'cell_voltages_max';
      minHist = st.attributes[minKey];
      maxHist = st.attributes[maxKey];
      useHistory = Array.isArray(minHist) || Array.isArray(maxHist);
    }

    const normalizeCells = (arr) => Array.isArray(arr) ? arr.map(v => {
      if (unitMode === '°C') return Number(v);
      return v < 100 ? Math.round(v * 1000) : Number(v);
    }) : arr;

    const toScale = (val, min=minCfg, max=maxCfg) => {
      const span = Math.max(1, max - min);
      const cl = Math.min(max, Math.max(min, val));
      return Math.round((cl - min) / span * h);
    };

    const container = document.createElement('div');
    container.className = 'container';

    // Y-axis ticks used by per-module mini axes
    const ticks = [minCfg, minCfg + (maxCfg-minCfg)*0.25, (minCfg+maxCfg)/2, minCfg + (maxCfg-minCfg)*0.75, maxCfg];

    const modulesWrap = document.createElement('div');
    modulesWrap.className = 'modules';

    const cellData = unitMode === '°C' ? (st.attributes.cell_temps || []) : (st.attributes.cell_voltages || []);
    // Voltage modules for width ratio when in °C mode
    const voltMods = (stVolt && stVolt.attributes && Array.isArray(stVolt.attributes.cell_voltages)) ? stVolt.attributes.cell_voltages : undefined;

    if (Array.isArray(cellData)) {
      cellData.forEach((mod, idx) => {
        const moduleDiv = document.createElement('div');
        moduleDiv.className = 'module';
        const skin = document.createElement('div'); skin.className = 'unit-skin';
        // Per-module axis inside the unit skin
        const axisMini = document.createElement('div');
        axisMini.className = 'axis-mini';
        ticks.forEach(val => {
          const t = document.createElement('div');
          t.className = 'tick';
          t.style.bottom = `${toScale(val)}px`;
          const lbl = document.createElement('div');
          lbl.className = 'tick-label';
          lbl.textContent = fmtLabel(val);
          t.appendChild(lbl);
          axisMini.appendChild(t);
        });
        skin.appendChild(axisMini);

        let cells = normalizeCells(getCells(mod));
        const hasMin = useHistory && Array.isArray(minHist?.[idx]?.v);
        const hasMax = useHistory && Array.isArray(maxHist?.[idx]?.v);
        const minCells = hasMin ? normalizeCells(minHist[idx].v) : undefined;
        const maxCells = hasMax ? normalizeCells(maxHist[idx].v) : undefined;

        // Resolve balancing entity once (outside the cell loop)
        const balEntId = `sensor.bms_${bmsId}_cells_balancing`;
        const balState = this._hass.states[balEntId];
        const balMods = balState && balState.attributes ? balState.attributes.cell_balancing : undefined;
        const balCells = Array.isArray(balMods?.[idx]?.b) ? balMods[idx].b : undefined;

        cells.forEach((val, i) => {
          const holder = document.createElement('div');
          holder.className = 'cell';
          // Dynamic width in °C mode: widen lines based on ratio of voltage cells to temperature cells
          if (unitMode === '°C') {
            const baseWidth = 6; // px (matches CSS .cell)
            const vLen = Array.isArray(voltMods?.[idx]?.v) ? voltMods[idx].v.length : (cells.length || 1);
            const tLen = cells.length || 1;
            const factor = Math.max(1, vLen / tLen);
            const widthPx = Math.min(18, Math.round(baseWidth * factor));
            holder.style.width = `${widthPx}px`;
          }

          if (unitMode !== '°C' && maxCells) {
            const maxH = toScale(maxCells[i] ?? val);
            const maxBar = document.createElement('div'); maxBar.className = 'bar max'; maxBar.style.height = `${maxH}px`;
            holder.appendChild(maxBar);
          }
          const curH = toScale(val);
          const curBar = document.createElement('div'); curBar.className = 'bar cur'; curBar.style.height = `${curH}px`;
          if (unitMode === '°C') {
            // Solid color based on current percentage: green (low) → yellow (mid) → red (high)
            const pct = Math.max(0, Math.min(1, (val - minCfg) / Math.max(1e-6, (maxCfg - minCfg))));
            const lerp = (a,b,t)=>Math.round(a + (b-a)*t);
            let r,g,b;
            if (pct <= 0.5) {
              const t = pct / 0.5;
              r = lerp(76, 255, t);
              g = lerp(175, 235, t);
              b = lerp(80, 59, t);
            } else {
              const t = (pct - 0.5) / 0.5;
              r = lerp(255, 244, t);
              g = lerp(235, 67, t);
              b = lerp(59, 54, t);
            }
            curBar.style.background = 'none';
            curBar.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            curBar.style.opacity = '1';
          }
          // Click to show current value tooltip
          curBar.style.cursor = 'pointer';
          curBar.addEventListener('click', (ev) => {
            // remove existing tip on this holder
            const existing = holder.querySelector('.tip');
            if (existing) existing.remove();
            const tip = document.createElement('div');
            tip.className = 'tip';
            tip.textContent = `${fmtLabel(val)}`;
            tip.style.bottom = `${curH + 8}px`;
            holder.appendChild(tip);
            setTimeout(()=>{ tip.remove(); }, 1500);
          });
          holder.appendChild(curBar);
          if (unitMode !== '°C' && minCells) {
            const minH = toScale(minCells[i] ?? val);
            const minBar = document.createElement('div'); minBar.className = 'bar min'; minBar.style.height = `${minH}px`;
            holder.appendChild(minBar);
          }
          // Balancing indicator (small blue strip at bottom) if active
          if (Array.isArray(balCells) && (balCells[i] === 1 || balCells[i] === true)) {
            const bal = document.createElement('div'); bal.className = 'bal';
            holder.appendChild(bal);
          }

          skin.appendChild(holder);
        });

        moduleDiv.appendChild(skin);

        const m = String(mod.m || '').trim();
        const match = /sensor\.bms_(\d+)_/.exec(entId);
        const bms = match ? match[1] : '1';
        const caption = document.createElement('div');
        caption.className = 'unit-caption';
        caption.textContent = `BMS ${bms}.${m}`;
        skin.appendChild(caption);

        modulesWrap.appendChild(moduleDiv);
      });
    } else {
      modulesWrap.innerHTML = unitMode === '°C' ? 'Entity has no attribute cell_temps' : 'Entity has no attribute cell_voltages';
    }

    // Compute header width synchronously to avoid flicker and exact-match first module width
    let headerWidth = 180; // fallback
    if (Array.isArray(cellData) && cellData.length > 0) {
      const cells0 = normalizeCells(getCells(cellData[0])) || [];
      let cellW = 6; // base px
      if (unitMode === '°C') {
        const vLen0 = Array.isArray(voltMods?.[0]?.v) ? voltMods[0].v.length : (cells0.length || 1);
        const tLen0 = cells0.length || 1;
        const factor0 = Math.max(1, vLen0 / tLen0);
        cellW = Math.min(18, Math.round(6 * factor0));
      }
      // Compute header content width so that header visible width equals module visible width:
      // module visible = 58 (left padding) + content + 6 (right padding)
      // header visible = header content + 12 (left padding) + 12 (right padding)
      // => header content = content + 58 + 6 - 24 = content + 40
      const contentWidth = (cells0.length * (cellW + 2));
      headerWidth = contentWidth + 40;
    }
    headerSkin.style.width = `${headerWidth}px`;

    // Place header module on top (outside the horizontal container)
    wrap.appendChild(headerModule);
    // Global axis removed; using per-module axes only
    container.appendChild(modulesWrap);
    wrap.appendChild(container);
    card.appendChild(style);
    card.appendChild(wrap);
    root.appendChild(card);
  }
}

customElements.define('byd-battery-box-dashboard', BYDBatteryBoxDashboard);

class BYDBatteryBoxDashboardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._resolvedEntity = undefined;
  }
  set hass(hass) {
    this._hass = hass;
    // Avoid full re-render which closes dropdowns; update form if exists
    if (this._form) {
      this._form.hass = hass;
    } else {
      this.render();
    }
  }
  async _resolveDeviceEntity(device_id) {
    try {
      const list = await this._hass.callWS({ type: 'config/entity_registry/list' });
      const candidates = list.filter(e => e.device_id === device_id && e.platform && e.domain === 'sensor');
      const match = candidates.find(e => /sensor\.bms_\d+_cells_average_voltage$/.test(e.entity_id)) || candidates[0];
      if (match) {
        this._resolvedEntity = match.entity_id;
        this._update({ entity: this._resolvedEntity });
        this.render();
      }
    } catch (e) {
      // ignore; keep manual entity selection
    }
  }
  render() {
    if (!this._hass) return;
    const cfg = this._config || {};

    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      .note { color: var(--secondary-text-color); font-size: 12px; margin-top: 8px; }
    `;

    const wrap = document.createElement('div');

    // Build ha-form schema for a robust GUI editor
    const form = document.createElement('ha-form');
    this._form = form;
    form.hass = this._hass;
    const defaults = { title: 'BYD Battery Box', days: 3, voltage_min: 3100, voltage_max: 3700, temp_min: 10, temp_max: 40, unit: 'mV' };
    form.schema = [
      { name: 'device_bmu', selector: { device: { integration: 'byd_battery_box' } } },
      { name: 'bms_device_1', selector: { device: { integration: 'byd_battery_box' } } },
      { name: 'bms_device_2', selector: { device: { integration: 'byd_battery_box' } } },
      { name: 'bms_device_3', selector: { device: { integration: 'byd_battery_box' } } },
      { name: 'title', selector: { text: {} } },
      { name: 'unit', selector: { select: { mode: 'dropdown', options: [ {value:'mV', label:'mV'}, {value:'°C', label:'°C'} ] } } },
      { name: 'days', selector: { number: { min: 0, max: 30, mode: 'box' } } },
      { name: 'voltage_min', selector: { number: { min: 0, max: 10000, step: 1, mode: 'box' } } },
      { name: 'voltage_max', selector: { number: { min: 0, max: 10000, step: 1, mode: 'box' } } },
      { name: 'temp_min', selector: { number: { min: -20, max: 80, step: 1, mode: 'box' } } },
      { name: 'temp_max', selector: { number: { min: -20, max: 80, step: 1, mode: 'box' } } },
    ];
    form.data = { ...defaults, ...cfg };
    form.addEventListener('value-changed', async (ev) => {
      const val = ev.detail.value || {};
      this._update(this._sanitize(val));
      await this._autoResolveFromDevices();
    });

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'Pick a BYD device or sensor. Defaults: unit mV, voltage range 3.1–3.7 V (3100–3700 mV), temperature 10–40 °C, days 3. Voltage entity example: sensor.bms_1_cells_average_voltage; Temperature entity example: sensor.bms_1_cells_average_temperature.';

    wrap.append(form, note);
    root.append(style, wrap);
    // Attempt to auto-resolve entities from selected devices on initial render
    this._autoResolveFromDevices();
  }
  _sanitize(obj) {
    const clean = { ...(this._config || {}) };
    Object.entries(obj || {}).forEach(([k,v]) => { if (v !== undefined && v !== null) clean[k] = v; });
    // simple migration from older single device key
    if (clean.device && !clean.device_bmu) clean.device_bmu = clean.device;
    return clean;
  }
  async _autoResolveFromDevices() {
    try {
      const cfg = this._config || {};
      const list = await this._hass.callWS({ type: 'config/entity_registry/list' });
      const sensors = list.filter(e => e.domain === 'sensor');
      const findInDevice = (device_id, regex) => {
        const cands = sensors.filter(e => e.device_id === device_id);
        let m = cands.find(e => regex.test(e.entity_id));
        // Voltage fallbacks
        if (!m && regex.source.includes('cells_average_voltage')) {
          m = cands.find(e => e.entity_id.includes('cells_average_voltage')) ||
              cands.find(e => e.entity_id.includes('cell_voltages'));
        }
        // SOC fallbacks
        if (!m && regex.source.includes('_soc')) {
          m = cands.find(e => /soc/i.test(e.entity_id)) ||
              cands.find(e => /state_of_charge|battery_.*percent|charge/i.test(e.entity_id));
        }
        return m ? m.entity_id : undefined;
      };
      // Resolve BMS entities
      const bmsIds = [cfg.bms_device_1, cfg.bms_device_2, cfg.bms_device_3].filter(Boolean);
      const entities_bms = [];
      for (const devId of bmsIds) {
        const eid = findInDevice(devId, /^sensor\.bms_\d+_cells_average_voltage$/);
        if (eid) entities_bms.push(eid);
      }
      const patch = {};
      if (entities_bms.length) patch.entities_bms = entities_bms;
      if (!cfg.entity && entities_bms.length) patch.entity = entities_bms[0];
      // Resolve SOC from BMU
      if (cfg.device_bmu) {
        const soc = findInDevice(cfg.device_bmu, /^sensor\..*_soc$/);
        if (soc) patch.soc_entity = soc;
      }
      if (Object.keys(patch).length) {
        this._update(patch);
        if (this._form) this._form.data = { ...(this._config || {}) };
      }
    } catch (e) {
      // ignore resolution errors
    }
  }
  _update(newConfig) {
    const clean = this._sanitize(newConfig);
    this._config = clean;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }
}
if (!customElements.get('byd-battery-box-dashboard-editor')) {
  customElements.define('byd-battery-box-dashboard-editor', BYDBatteryBoxDashboardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'byd-battery-box-dashboard',
  name: 'BYD Battery Box Dashboard',
  description: 'Visualize BYD cell voltages (min/cur/max) per module.',
});
