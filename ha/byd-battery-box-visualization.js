// BYD Battery Box Visualization - Home Assistant wrapper card
// Single primary card registering: custom:byd-battery-box-visualization
import '../components/battery-system.js';
import '../components/battery-tower.js';
import '../components/battery-header.js';
import '../components/battery-module.js';
import '../components/battery-stand.js';

const UI_VERSION = '0.0.2';

class BYDBatteryBoxVisualization extends HTMLElement {
  static getConfigElement(){ return document.createElement('byd-battery-box-visualization-editor'); }
  static getStubConfig(){ return { voltage_min: 3100, voltage_max: 3700, temp_min: 10, temp_max: 45, show_y_axis: true, show_gray_caps: true, unit: 'mV' }; }

  setConfig(config){ this._config = config || {}; }
  set hass(hass){ this._hass = hass; this._render(); }

  getCardSize(){ return 8; }

  _render(){
    if (!this._hass) return;
    const cfg = this._config || {};

    // Initialize shadow root and static DOM once to avoid flicker
    const root = this.shadowRoot || this.attachShadow({mode:'open'});
    if (!this._el){
      const card = document.createElement('ha-card');
      const container = document.createElement('div');
      container.style.padding = '10px';
      const system = document.createElement('byd-battery-system');
      container.appendChild(system);
      card.appendChild(container);
      root.innerHTML = '';
      root.appendChild(card);
      this._el = { card, container, system };
      this._lastTowerCount = 0;
      this._lastModules = [];
    }


    // Discover towers and wire data
    const towers = this._discoverTowers();
    const count = towers.length || 1;

    // Only change tower count when needed to avoid rebuild flicker
    if (this._lastTowerCount !== count){
      this._el.system.setTowers(count);
      this._lastTowerCount = count;
      this._lastModules = new Array(count).fill(undefined);
    }

    // BMU-wide properties
    const bmu = this._discoverBMU();

    // Robust number parsing for config with history fallback
    const parseNum = (v)=>{ const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    const cfgVMin = parseNum(cfg.voltage_min);
    const cfgVMax = parseNum(cfg.voltage_max);
    const cfgTMin = parseNum(cfg.temp_min);
    const cfgTMax = parseNum(cfg.temp_max);

    const histVMin = towers.length ? Math.min(...towers.map(t=> (t?.chart?.vMin ?? 99999))) : 3100;
    const histVMax = towers.length ? Math.max(...towers.map(t=> (t?.chart?.vMax ?? -99999))) : 3500;

    const vMin = cfgVMin !== undefined ? cfgVMin : histVMin;
    const vMax = cfgVMax !== undefined ? cfgVMax : histVMax;
    const tMin = cfgTMin !== undefined ? cfgTMin : 0;
    const tMax = cfgTMax !== undefined ? cfgTMax : 60;

    for (let i=0;i<count;i++){
      const t = towers[i];
      const towerEl = this._el.system.getTower(i+1);
      if (!towerEl || !t) continue;

      // Ensure module count matches detected value; if increased, force rebuild once
      const currentMods = typeof towerEl.getModulesCount === 'function' ? Number(towerEl.getModulesCount()) : (this._lastModules[i] ?? 0);
      if (currentMods !== t.modules){
        towerEl.setModules(t.modules);
        this._lastModules[i] = t.modules;
      }

      towerEl.setChartMinVoltage(vMin); towerEl.setChartMaxVoltage(vMax);
      towerEl.setChartMinTemperature(tMin); towerEl.setChartMaxTemperature(tMax);
      if (cfg.show_y_axis === false) towerEl.hideYAxisValues(); else towerEl.showYAxisValues();
      if (typeof towerEl.setShowGrayCaps === 'function') towerEl.setShowGrayCaps(cfg.show_gray_caps !== false);

      // Header info per tower + BMU shared
      towerEl.setBMUPower(bmu.power ?? 0);
      towerEl.setBMUVersion(bmu.version || '');
      towerEl.setBMSVersion(t.bmsVersion || '');
      towerEl.setUIMeta?.(`UI ${UI_VERSION}<br>modules:${t.modules}`);
      towerEl.setStateOfCharge(t.soc ?? bmu.soc ?? 0);
      towerEl.setStateOfHealth(t.soh ?? 0);

      // Data per module
      towerEl.setVoltage(t.voltage);
      towerEl.setHistoryMaxVoltage(t.histMax);
      towerEl.setHistoryMinVoltage(t.histMin);
      towerEl.setCellBallancing(t.balancing);
      towerEl.setTemperature(t.temps);
    }
  }

  _discoverBMU(){
    const s = this._hass.states, keys = Object.keys(s);
    const find = (re)=>{ const id = keys.find(k=>re.test(k)); return id ? s[id] : undefined; };
    const power = Number(find(/^sensor\.bmu_power/ )?.state) || 0;
    const version = find(/^sensor\.bmu_version$/)?.state || find(/^sensor\.bmu_version_a$/)?.state || '';
    // SOC is not always on BMU; try to average BMS SOC later; keep optional here
    return { power, version };
  }

  _discoverTowers(){
    const result = [];
    const s = this._hass.states; const keys = Object.keys(s);
    const towerIds = [...new Set(keys.map(k=>{ const m=/^sensor\.bms_(\d+)_cells_average_voltage$/.exec(k); return m?Number(m[1]):null; }).filter(Boolean))].sort((a,b)=>a-b).slice(0,3);

    const highestModuleIndex = (arr)=>{
      if (!Array.isArray(arr) || arr.length === 0) return 0;
      if (arr.length && typeof arr[0] === 'object' && !Array.isArray(arr[0])){
        // [{m:1,v:[...]}, ...]
        return arr.reduce((mx, it)=>{
          const m = Number(it?.m ?? it?.module);
          return Number.isFinite(m) ? Math.max(mx, m) : mx;
        }, 0);
      }
      // [[...], [...]]
      return arr.length;
    };

    const buildModuleArray = (src, key, count)=>{
      const out = Array.from({length: count}, ()=> []);
      if (!Array.isArray(src)) return out;
      if (src.length && typeof src[0] === 'object' && !Array.isArray(src[0])){
        for (const item of src){
          const idx = (Number(item?.m ?? item?.module) || 1) - 1;
          if (idx>=0 && idx<count){
            const val = item?.[key];
            out[idx] = Array.isArray(val) ? val : [];
          }
        }
      } else {
        for (let i=0;i<Math.min(count, src.length); i++){
          out[i] = Array.isArray(src[i]) ? src[i] : [];
        }
      }
      return out;
    };

    for (const tid of towerIds){
      const volEnt = s[`sensor.bms_${tid}_cells_average_voltage`];
      const maxEnt = s[`sensor.bms_${tid}_max_history_cell_voltage`];
      const minEnt = s[`sensor.bms_${tid}_min_history_cell_voltage`];
      const balEnt = s[`sensor.bms_${tid}_cells_balancing`];
      const tmpEnt = s[`sensor.bms_${tid}_cells_average_temperature`];
      const socEnt = s[`sensor.bms_${tid}_state_of_charge`];
      const sohEnt = s[`sensor.bms_${tid}_state_of_health`];
      const verEnt = s[`sensor.bms_version`];

      const cellVolts = volEnt?.attributes?.cell_voltages || [];
      const maxCellVolts = maxEnt?.attributes?.cell_voltages || [];
      const minCellVolts = minEnt?.attributes?.cell_voltages || [];
      const balRaw = balEnt?.attributes?.cell_balancing || [];
      const tmpRaw = tmpEnt?.attributes?.cell_temps || [];

      // Determine module count robustly: use highest declared module index across all sources
      const highest = Math.max(
        highestModuleIndex(cellVolts),
        highestModuleIndex(maxCellVolts),
        highestModuleIndex(minCellVolts),
        highestModuleIndex(balRaw),
        highestModuleIndex(tmpRaw)
      );
      const modules = Math.min(Math.max(highest || 1, 1), 10);

      // Build dense arrays sized to `modules`, filling by module index when available
      const voltage = buildModuleArray(cellVolts, 'v', modules);
      const histMax = buildModuleArray(maxCellVolts, 'v', modules);
      const histMin = buildModuleArray(minCellVolts, 'v', modules);
      const balancing = buildModuleArray(balRaw, 'b', modules);
      const temps = buildModuleArray(tmpRaw, 't', modules);

      // chart ranges from history if present; fall back safely if empty
      const flatMin = histMin.flat().filter(v => Number.isFinite(v));
      const flatMax = histMax.flat().filter(v => Number.isFinite(v));
      const chart = {
        vMin: flatMin.length ? Math.min(...flatMin) : 3100,
        vMax: flatMax.length ? Math.max(...flatMax) : 3700,
      };

      result.push({ id: tid, modules, voltage, histMax, histMin, balancing, temps, chart, soc: Number(socEnt?.state), soh: Number(sohEnt?.state), bmsVersion: verEnt?.state || '' });
    }

    // If no towers discovered, create a placeholder with demo data
    if (result.length === 0){
      const demo = this._demoTower(1);
      return [demo];
    }

    return result;
  }

  _demoTower(id){
    // simple fake data for test usage in HA preview
    const modules = 3;
    const cellsPerModule = 32;
    const voltage = Array.from({length:modules}, ()=> Array.from({length:cellsPerModule}, ()=> 3300 + Math.round(Math.random()*80)) );
    const histMax = voltage.map(arr=>arr.map(v=>v+50));
    const histMin = voltage.map(arr=>arr.map(v=>v-80));
    const temps = Array.from({length:modules}, ()=> Array.from({length:16}, ()=> 20 + Math.round(Math.random()*15)) );
    const balancing = voltage.map(arr=>arr.map(()=> Math.random()<0.05 ? 1 : 0));
    return { id, modules, voltage, histMax, histMin, balancing, temps, chart:{vMin:3200,vMax:3500}, soc: 75, soh: 98, bmsVersion: 'demo' };
  }
}

if (!customElements.get('byd-battery-box-visualization')) customElements.define('byd-battery-box-visualization', BYDBatteryBoxVisualization);

// Register in HA custom cards list (for the card picker)
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'byd-battery-box-visualization',
  name: 'BYD Battery Box Visualization',
  description: 'BYD Battery Box visualization with separated components and auto-configuration for byd_battery_box.',
  preview: true,
  preview_image: '/hacsfiles/byd_battery_box_visualization/images/preview.png'
});

// Simple GUI editor for the card configuration
class BYDBatteryBoxVisualizationEditor extends HTMLElement {
  setConfig(config){
    this._config = config || {};
    // If form already exists, update its data without re-rendering to preserve focus while editing
    if (this._form && customElements.get('ha-form')){
      const cfg = this._config || {};
      this._form.data = {
        unit: cfg.unit || 'mV',
        voltage_min: cfg.voltage_min,
        voltage_max: cfg.voltage_max,
        temp_min: cfg.temp_min,
        temp_max: cfg.temp_max,
        show_y_axis: cfg.show_y_axis !== false,
        show_gray_caps: cfg.show_gray_caps !== false,
      };
      return;
    }
    this._render();
  }
  set hass(hass){ this._hass = hass; if (this._form) this._form.hass = hass; }
  connectedCallback(){ this._render(); }
  _render(){
    this.innerHTML = '';
    const root = this;
    const cfg = this._config || {};

    // Prefer HA's ha-form when available for native look & feel
    if (customElements.get('ha-form')){
      const form = document.createElement('ha-form');
      form.hass = this._hass;
      form.schema = [
        { name: 'unit', label: 'Unit', helper: 'Display unit for charts. Default: mV', selector: { select: { options: [ {value:'mV', label:'mV'}, {value:'°C', label:'°C'} ] } } },
        { name: 'voltage_min', label: 'Voltage min (mV)', helper: 'Minimum of the voltage chart. Default: auto (from history)', selector: { number: { mode: 'box', min: 0, step: 1 } } },
        { name: 'voltage_max', label: 'Voltage max (mV)', helper: 'Maximum of the voltage chart. Default: auto (from history)', selector: { number: { mode: 'box', min: 0, step: 1 } } },
        { name: 'temp_min', label: 'Temperature min (°C)', helper: 'Minimum of the temperature chart. Default: 0', selector: { number: { mode: 'box', min: -40, max: 120, step: 1 } } },
        { name: 'temp_max', label: 'Temperature max (°C)', helper: 'Maximum of the temperature chart. Default: 60', selector: { number: { mode: 'box', min: -40, max: 120, step: 1 } } },
        { name: 'show_y_axis', label: 'Show Y‑axis', helper: 'Show axis labels and guide lines. Default: true', selector: { boolean: {} } },
        { name: 'show_gray_caps', label: 'Show gray caps (voltage)', helper: 'Show dark gray caps beyond per-cell historic min/max. Default: true', selector: { boolean: {} } },
      ];
      form.data = {
        unit: cfg.unit || 'mV',
        voltage_min: cfg.voltage_min,
        voltage_max: cfg.voltage_max,
        temp_min: cfg.temp_min,
        temp_max: cfg.temp_max,
        show_y_axis: cfg.show_y_axis !== false,
        show_gray_caps: cfg.show_gray_caps !== false,
      };
      form.addEventListener('value-changed', (ev)=>{
        ev.stopPropagation();
        const detail = ev.detail?.value || {};
        const clean = {};
        Object.keys(detail).forEach(k=>{ if (detail[k] !== undefined) clean[k] = detail[k]; });
        clearTimeout(this._debounceT);
        this._debounceT = setTimeout(()=>{
          const base = this._config || cfg || {};
          this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { ...base, ...clean } } }));
        }, 300);
      });
      this._form = form;
      root.appendChild(form);
      return;
    }

    // Fallback simple form if ha-form is not available (e.g., in some editors)
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '1fr 1fr';
    wrap.style.gap = '8px';
    const addField = (label, input, helper)=>{
      const l = document.createElement('label'); l.textContent = label; l.style.fontSize='12px'; l.style.opacity='0.85';
      const help = document.createElement('div'); help.textContent = helper || ''; help.style.fontSize='11px'; help.style.opacity='0.7'; help.style.marginBottom='2px';
      const cont = document.createElement('div'); cont.style.display='flex'; cont.style.flexDirection='column';
      cont.appendChild(l); if (helper) cont.appendChild(help); cont.appendChild(input); wrap.appendChild(cont);
    };
    const text = (val)=>{ const i=document.createElement('input'); i.type='text'; i.value = val||''; return i; };
    const num = (val)=>{ const i=document.createElement('input'); i.type='number'; if (val!==undefined) i.value=val; return i; };
    const bool = (val)=>{ const i=document.createElement('input'); i.type='checkbox'; i.checked = !!val; return i; };
    const select = (val, opts)=>{ const s=document.createElement('select'); opts.forEach(o=>{ const op=document.createElement('option'); op.value=o; op.textContent=o; if (o===val) op.selected=true; s.appendChild(op); }); return s; };

    const entityI = text(cfg.entity || ''); addField('Entity (optional)', entityI, 'Usually auto-discovered.');
    const unitI = select(cfg.unit || 'mV', ['mV','°C']); addField('Unit', unitI, 'Default: mV');
    const vminI = num(cfg.voltage_min); addField('Voltage min (mV)', vminI, 'Default: auto (from history)');
    const vmaxI = num(cfg.voltage_max); addField('Voltage max (mV)', vmaxI, 'Default: auto (from history)');
    const tminI = num(cfg.temp_min); addField('Temperature min (°C)', tminI, 'Default: 0');
    const tmaxI = num(cfg.temp_max); addField('Temperature max (°C)', tmaxI, 'Default: 60');
    const yI = bool(cfg.show_y_axis !== false); addField('Show Y‑axis', yI, 'Default: true');
    const grayI = bool(cfg.show_gray_caps !== false); addField('Show gray caps (voltage)', grayI, 'Default: true');

    const save = ()=>{
      const out = {
        entity: entityI.value,
        unit: unitI.value,
        voltage_min: vminI.value === '' ? undefined : Number(vminI.value),
        voltage_max: vmaxI.value === '' ? undefined : Number(vmaxI.value),
        temp_min: tminI.value === '' ? undefined : Number(tminI.value),
        temp_max: tmaxI.value === '' ? undefined : Number(tmaxI.value),
        show_y_axis: yI.checked,
        show_gray_caps: grayI.checked,
      };
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { ...cfg, ...out } } }));
    };
    wrap.addEventListener('change', save);
    root.appendChild(wrap);
  }
}
if (!customElements.get('byd-battery-box-visualization-editor')) customElements.define('byd-battery-box-visualization-editor', BYDBatteryBoxVisualizationEditor);
