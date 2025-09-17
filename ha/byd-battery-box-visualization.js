// BYD Battery Box Visualization - Home Assistant wrapper card
// Single primary card registering: custom:byd-battery-box-visualization
import '../components/battery-system.js';
import '../components/battery-tower.js';
import '../components/battery-header.js';
import '../components/battery-module.js';
import '../components/battery-stand.js';

const UI_VERSION = '0.0.5';

class BYDBatteryBoxVisualization extends HTMLElement {
  static getConfigElement(){ return document.createElement('byd-battery-box-visualization-editor'); }
  static getStubConfig(){ return { voltage_auto: true, temp_min: 10, temp_max: 45, show_y_axis: true, show_gray_caps: true, unit: 'mV', default_view: 'voltage', module_view: 'detailed', show_vt_toggle: true, show_view_toggle: false, show_power: true, show_eta: true, show_product_capacity: true, header_information_default: 'versions', show_header_versions: true, show_header_ui: true, show_header_energy: true, show_header_efficiency: true }; }

  setConfig(config){ this._config = config || {}; }
  set hass(hass){ this._hass = hass; this._render(); }

  getCardSize(){ return 8; }

  _pushPowerSample(p){
    const now = Date.now();
    this._powerSamples = this._powerSamples || [];
    this._powerSamples.push({ t: now, p: Number(p)||0 });
    // prune >5 minutes
    const cutoff = now - 5*60*1000;
    while (this._powerSamples.length && this._powerSamples[0].t < cutoff) this._powerSamples.shift();
  }
  _avgPowerW(){
    const arr = this._powerSamples || [];
    if (arr.length === 0) return 0;
    // time-weighted average using piecewise segments
    const now = Date.now();
    let num = 0, den = 0;
    for (let i=0;i<arr.length;i++){
      const a = arr[i];
      const b = arr[i+1] || { t: now, p: a.p };
      const dt = Math.max(0, b.t - a.t);
      if (dt > 0){ num += a.p * dt; den += dt; }
    }
    return den > 0 ? num/den : arr[arr.length-1].p;
  }

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
    // Maintain 5-min rolling average of BMU power
    this._pushPowerSample(bmu.power ?? 0);
    const avgPowerW = this._avgPowerW();

    // Robust number parsing for config with history fallback
    const parseNum = (v)=>{ const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    const voltageAuto = cfg.voltage_auto !== false;
    const cfgVMin = voltageAuto ? undefined : parseNum(cfg.voltage_min);
    const cfgVMax = voltageAuto ? undefined : parseNum(cfg.voltage_max);
    const cfgTMin = parseNum(cfg.temp_min);
    const cfgTMax = parseNum(cfg.temp_max);

    const histVMin = towers.length ? Math.min(...towers.map(t=> (t?.chart?.vMin ?? 99999))) : 3100;
    const histVMax = towers.length ? Math.max(...towers.map(t=> (t?.chart?.vMax ?? -99999))) : 3500;

    // Voltage range with optional cap when no manual max is set
    let vMin = cfgVMin !== undefined ? cfgVMin : histVMin;
    let vMax = cfgVMax !== undefined ? cfgVMax : histVMax;
    if (cfgVMax === undefined){
      // Cap to 3500 mV, or to BMU cell voltage max (if >3.5V)
      const bmuCapV = Number(this._discoverBMU().cellMaxV || 0);
      const capMV = Math.max(3500, (bmuCapV > 3.5 ? Math.round(bmuCapV*1000) : 0));
      if (capMV > 0) vMax = Math.min(vMax, capMV);
    }
    const tMin = cfgTMin !== undefined ? cfgTMin : 0;
    const tMax = cfgTMax !== undefined ? cfgTMax : 60;

    const perTowerWh = (bmu.totalCapacityWh && count) ? (bmu.totalCapacityWh / count) : 0;
    const formatETA = (secs)=>{
      if (!Number.isFinite(secs) || secs <= 0) return '';
      const h = Math.floor(secs/3600);
      const m = Math.round((secs%3600)/60);
      if (h>0) return `${h}h ${m}m`;
      return `${m}m`;
    };

    // Determine display unit from config; default_view used only on first render
    const unitCfg = (cfg.unit || 'mV');
    const displayUnit = unitCfg === 'V' ? 'V' : 'mV';
    if (this._appliedInitialView !== true){
      const def = (cfg.default_view === 'temperature') ? 'temperature' : 'voltage';
      this._currentView = def;
      this._appliedInitialView = true;
    }

    for (let i=0;i<count;i++){
      const t = towers[i];
      const towerEl = this._el.system.getTower(i+1);
      if (!towerEl || !t) continue;

      // Sync current view from tower (user interaction) so HA doesn't revert it.
      // IMPORTANT: Do not override configured default on first render.
      if (i === 0 && typeof towerEl.getView === 'function' && this._lastAppliedView !== undefined){
        const v = towerEl.getView();
        if (v === 'temperature' || v === 'voltage') this._currentView = v;
      }
      // Pre-apply default module view on very first render so initial modules render in correct mode
      if (this._lastAppliedModuleView === undefined){
        if (this._appliedInitialModuleView !== true){
          const mvCfg = cfg.module_view;
          this._currentModuleView = (mvCfg==='minimalistic'||mvCfg==='minimal') ? 'minimal' : ((mvCfg==='no-data'||mvCfg==='none') ? 'none' : 'detailed');
          this._appliedInitialModuleView = true;
        }
        if (typeof towerEl.setModuleView === 'function'){
          towerEl.setModuleView(this._currentModuleView);
          this._lastAppliedModuleView = this._currentModuleView;
        }
      }

      // Ensure module count matches detected value; if increased, force rebuild once
      const currentMods = typeof towerEl.getModulesCount === 'function' ? Number(towerEl.getModulesCount()) : (this._lastModules[i] ?? 0);
      if (currentMods !== t.modules){
        towerEl.setModules(t.modules);
        this._lastModules[i] = t.modules;
        // Ensure newly created module elements adopt the current module view
        if (typeof towerEl.setModuleView === 'function'){
          towerEl.setModuleView(this._currentModuleView);
        }
      }

      towerEl.setChartMinVoltage(vMin); towerEl.setChartMaxVoltage(vMax);
      towerEl.setChartMinTemperature(tMin); towerEl.setChartMaxTemperature(tMax);
      if (cfg.show_y_axis === false) towerEl.hideYAxisValues(); else towerEl.showYAxisValues();
      if (typeof towerEl.setShowGrayCaps === 'function') towerEl.setShowGrayCaps(cfg.show_gray_caps !== false);
      // Persist module view chosen by the user; initialize from config only once
      if (this._appliedInitialModuleView !== true){
        const mvCfg = cfg.module_view;
        this._currentModuleView = (mvCfg==='minimalistic'||mvCfg==='minimal') ? 'minimal' : ((mvCfg==='no-data'||mvCfg==='none') ? 'none' : 'detailed');
        this._appliedInitialModuleView = true;
      }
      // Only read module view from tower after we've applied at least once
      if (typeof towerEl.getModuleView === 'function' && this._lastAppliedModuleView !== undefined){
        const mv = towerEl.getModuleView();
        if (mv === 'minimal' || mv === 'detailed' || mv === 'none') this._currentModuleView = mv;
      }
      if (typeof towerEl.setModuleView === 'function' && this._lastAppliedModuleView !== this._currentModuleView){
        towerEl.setModuleView(this._currentModuleView);
        this._lastAppliedModuleView = this._currentModuleView;
      }
      if (typeof towerEl.setShowVTToggle === 'function') towerEl.setShowVTToggle(cfg.show_vt_toggle !== false);
      if (typeof towerEl.setShowViewToggle === 'function') towerEl.setShowViewToggle(cfg.show_view_toggle === true);
      if (typeof towerEl.setHeaderDisplayOptions === 'function') towerEl.setHeaderDisplayOptions({ showPower: cfg.show_power !== false, showETA: cfg.show_eta !== false, showProductCapacity: cfg.show_product_capacity !== false });

      // Apply unit and (optionally) view
      towerEl.setDisplayUnit?.(displayUnit);
      if (this._lastAppliedView !== this._currentView){
        if (this._currentView === 'temperature') towerEl.showTemperature(); else towerEl.showVoltage();
      }

      // Header info per tower + BMU shared
      towerEl.setBMUPower(bmu.power ?? 0);
      towerEl.setBMUVersion(bmu.version || '');
      towerEl.setBMSVersion(t.bmsVersion || '');
      towerEl.setUIMeta?.(`UI ${UI_VERSION}<br>modules:${t.modules}`);
      towerEl.setStateOfCharge(t.soc ?? bmu.soc ?? 0);
      towerEl.setStateOfHealth(t.soh ?? 0);

      // Header information options/payload
      const st = this._hass.states || {};
      const cEnt = st[`sensor.bms_${t.id}_charge_total_energy`];
      const dEnt = st[`sensor.bms_${t.id}_discharge_total_energy`];
      const effEnt = st[`sensor.bms_${t.id}_efficiency`];
      const fmtEnergyInt = (ent)=>{
        if (!ent) return {txt:'--', unit:''};
        const val = Number(ent.state);
        const unit = (ent.attributes?.unit_of_measurement || '').toString();
        if (!Number.isFinite(val)) return {txt:'--', unit:''};
        if (/kwh/i.test(unit)) return {txt: Math.round(val).toLocaleString(undefined,{maximumFractionDigits:0}), unit: 'kWh'};
        if (/wh/i.test(unit)) return {txt: Math.round(val).toLocaleString(undefined,{maximumFractionDigits:0}), unit: 'Wh'};
        return {txt: Math.round(val).toString(), unit: unit};
      };
      const cFmt = fmtEnergyInt(cEnt);
      const dFmt = fmtEnergyInt(dEnt);
      const energyText = (cEnt||dEnt) ? `Charged: ${cFmt.txt} ${cFmt.unit}<br>Discharged: ${dFmt.txt} ${dFmt.unit}` : '';
      const effVal = Number(effEnt?.state);
      const effText = `Efficiency: ${Number.isFinite(effVal)?Math.round(effVal):'--'}%<br>State of Health: ${Number.isFinite(Number(t.soh))?Math.round(Number(t.soh)):0}%`;
      const versionsText = `BMU ${bmu.version || ''}<br>BMS ${t.bmsVersion || ''}`;
      const uiText = `UI ${UI_VERSION}<br>modules:${t.modules}`;
      if (typeof towerEl.setHeaderInformation === 'function'){
        towerEl.setHeaderInformation({
          default: cfg.header_information_default || 'versions',
          show: {
            versions: cfg.show_header_versions !== false,
            ui: cfg.show_header_ui !== false,
            energy: cfg.show_header_energy !== false,
            efficiency: cfg.show_header_efficiency !== false,
          },
          payload: { versionsText, uiText, energyText, effText }
        });
      }

      // Capacity per tower
      if (typeof towerEl.setTowerCapacityWh === 'function') towerEl.setTowerCapacityWh(perTowerWh);

      // ETA based on instantaneous power for idle detection, using 5‑min avg for rate smoothing
      let etaText = '';
      const soc = Number(t.soc ?? bmu.soc ?? 0);
      const idleThresh = 20; // W
      const instPowerW = Number(bmu.power ?? 0);
      const pPerTowerInst = instPowerW / (count || 1);
      if (perTowerWh > 0 && soc >= 0 && Math.abs(pPerTowerInst) > idleThresh){
        // choose a rate: prefer 5‑min average if same sign; else fallback to instantaneous
        let rateW = avgPowerW;
        if (rateW === 0 || (rateW > 0) !== (pPerTowerInst > 0)) rateW = instPowerW;
        const pPerTower = rateW / (count || 1);
        if (pPerTower < 0){
          // charging -> time to full
          const energyToFullWh = perTowerWh * Math.max(0, 1 - soc/100);
          const secs = (energyToFullWh / Math.abs(pPerTower)) * 3600;
          const txt = formatETA(secs);
          etaText = txt ? `Full in ${txt}` : '';
        } else if (pPerTower > 0){
          // discharging -> time to empty
          const energyToEmptyWh = perTowerWh * Math.max(0, soc/100);
          const secs = (energyToEmptyWh / pPerTower) * 3600;
          const txt = formatETA(secs);
          etaText = txt ? `Remaining ${txt}` : '';
        }
      }
      if (typeof towerEl.setEstimate === 'function') towerEl.setEstimate(etaText);

      // Data per module
      towerEl.setVoltage(t.voltage);
      towerEl.setHistoryMaxVoltage(t.histMax);
      towerEl.setHistoryMinVoltage(t.histMin);
      towerEl.setCellBallancing(t.balancing);
      towerEl.setTemperature(t.temps);
    }

    // Persist the applied view so we don't override user toggles on subsequent updates
    this._lastAppliedView = this._currentView;

    // After data applied, fetch and set product names (BMS model; fallback to BMU model)
    this._applyProductNames(towers, count).catch(()=>{});
  }

  _discoverBMU(){
    const s = this._hass.states, keys = Object.keys(s);
    const find = (re)=>{ const id = keys.find(k=>re.test(k)); return id ? s[id] : undefined; };
    const power = Number(find(/^sensor\.bmu_power/ )?.state) || 0;
    const version = find(/^sensor\.bmu_version$/)?.state || find(/^sensor\.bmu_version_a$/)?.state || '';
    // total capacity may be exposed as sensor.total_capacity; unit can be Wh or kWh
    const capEnt = find(/^sensor\.total_capacity$/);
    let totalCapacityWh = undefined;
    if (capEnt){
      const val = Number(capEnt.state);
      const unit = capEnt.attributes?.unit_of_measurement || '';
      if (Number.isFinite(val)){
        totalCapacityWh = /kwh/i.test(unit) ? val*1000 : val;
      }
    }
    // BMU cell voltage max (in V)
    const cellMaxEnt = find(/^sensor\.bmu_cell_voltage_max/);
    let cellMaxV = undefined;
    if (cellMaxEnt){
      const val = Number(cellMaxEnt.state);
      const u = (cellMaxEnt.attributes?.unit_of_measurement || '').toString();
      if (Number.isFinite(val)){
        cellMaxV = /mv/i.test(u) ? (val/1000) : val;
      }
    }
    return { power, version, totalCapacityWh, cellMaxV };
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

// Registry helpers for reading device model (to show product name)
BYDBatteryBoxVisualization.prototype._ensureRegistries = async function(){
  if (this._entities && this._devices) return;
  try{
    this._entities = await this._hass.callWS({type:'config/entity_registry/list'});
    this._devices = await this._hass.callWS({type:'config/device_registry/list'});
  }catch(e){ /* ignore */ }
};
BYDBatteryBoxVisualization.prototype._getModelForEntityId = function(entityId){
  if (!entityId || !Array.isArray(this._entities) || !Array.isArray(this._devices)) return '';
  const ent = this._entities.find(e=> e?.entity_id === entityId);
  if (!ent) return '';
  const dev = this._devices.find(d=> d?.id === ent.device_id);
  const model = dev?.model || dev?.model_id || '';
  return model || '';
};
BYDBatteryBoxVisualization.prototype._applyProductNames = async function(towers, count){
  try{
    await this._ensureRegistries();
    const keys = Object.keys(this._hass.states || {});
    const bmuPowerId = keys.find(k=> /^sensor\.bmu_power/.test(k));
    const bmuModel = this._getModelForEntityId(bmuPowerId);
    for (let i=0;i<count;i++){
      const t = towers[i]; if (!t) continue;
      const towerEl = this._el?.system?.getTower(i+1);
      if (!towerEl) continue;
      const bmsEntityId = `sensor.bms_${t.id}_cells_average_voltage`;
      const model = this._getModelForEntityId(bmsEntityId) || bmuModel || '';
      if (typeof towerEl.setProductName === 'function') towerEl.setProductName(model);
    }
  }catch(e){ /* ignore */ }
};

if (!customElements.get('byd-battery-box-visualization')) customElements.define('byd-battery-box-visualization', BYDBatteryBoxVisualization);

// Register in HA custom cards list (for the card picker)
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'byd-battery-box-visualization',
  name: 'BYD Battery Box Visualization',
  description: 'BYD Battery Box visualization with separated components and auto-configuration for byd_battery_box.',
  preview: true,
  preview_image: 'https://raw.githubusercontent.com/TimWeyand/byd_battery_box_visualization/main/images/preview.png'
});

// Simple GUI editor for the card configuration
class BYDBatteryBoxVisualizationEditor extends HTMLElement {
  setConfig(config){
    this._config = config || {};
    // If form already exists, update or rebuild schema when needed without losing focus
    if (this._form && customElements.get('ha-form')){
      const cfg = this._config || {};
      const key = (cfg.voltage_auto === false) ? 'manualV' : 'autoV';
      if (this._lastSchemaKey !== key){
        this._lastSchemaKey = key;
        // Rebuild form to reflect schema change (show/hide manual voltage fields)
        this._form.remove();
        this._form = null;
        this._render();
        return;
      }
      if (!this._isEditing){
        this._form.data = {
          unit: cfg.unit || 'mV',
          voltage_auto: cfg.voltage_auto !== false,
          voltage_min: cfg.voltage_min,
          voltage_max: cfg.voltage_max,
          temp_min: cfg.temp_min,
          temp_max: cfg.temp_max,
          show_y_axis: cfg.show_y_axis !== false,
          show_gray_caps: cfg.show_gray_caps !== false,
          show_vt_toggle: cfg.show_vt_toggle !== false,
          show_view_toggle: cfg.show_view_toggle === true,
          show_power: cfg.show_power !== false,
          show_eta: cfg.show_eta !== false,
          show_product_capacity: cfg.show_product_capacity !== false,
          header_information_default: cfg.header_information_default || 'versions',
          show_header_versions: cfg.show_header_versions !== false,
          show_header_ui: cfg.show_header_ui !== false,
          show_header_energy: cfg.show_header_energy !== false,
          show_header_efficiency: cfg.show_header_efficiency !== false,
          module_view: cfg.module_view || 'detailed',
        };
      }
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
      const autoV = (cfg.voltage_auto !== false);
      const graphSchema = [
        { name: 'voltage_auto', label: 'Voltage auto', helper: 'Default: active', selector: { boolean: {} } },
        ...(!autoV ? [
          { name: 'voltage_min', label: 'Voltage min (mV)', helper: 'Shown when Voltage auto is disabled', selector: { number: { mode: 'box', min: 0, step: 1 } } },
          { name: 'voltage_max', label: 'Voltage max (mV)', helper: 'Shown when Voltage auto is disabled', selector: { number: { mode: 'box', min: 0, step: 1 } } },
        ] : []),
        { name: 'temp_min', label: 'Temperature min (°C)', helper: 'Default: 0', selector: { number: { mode: 'box', min: -40, max: 120, step: 1 } } },
        { name: 'temp_max', label: 'Temperature max (°C)', helper: 'Default: 60', selector: { number: { mode: 'box', min: -40, max: 120, step: 1 } } },
        { name: 'show_gray_caps', label: 'Show gray caps (voltage)', helper: 'Default: active', selector: { boolean: {} } },
      ];

      const schema = [
        { type:'expandable', title:'Battery Tower', schema:[
          { name: 'unit', label: 'Unit', helper: 'Voltage unit for charts (not temperature). Default: mV', selector: { select: { options: [ {value:'mV', label:'mV'}, {value:'V', label:'V'} ] } } },
          { name: 'show_vt_toggle', label: 'Show Voltage/Temperature Toggle', helper: 'Default: active', selector: { boolean: {} } },
          { name: 'show_view_toggle', label: 'Show Battery Visualization Toggle (Detailed/Minimalistic)', helper: 'Default: disabled', selector: { boolean: {} } },
          { name: 'module_view', label: 'Default Battery View', helper: 'Default: Detailed', selector: { select: { options: [ {value:'detailed', label:'Detailed'}, {value:'minimal', label:'Minimalistic'}, {value:'none', label:'No Data'} ] } } },
          { name: 'show_power', label: 'Show Current Power', helper: 'Default: active', selector: { boolean: {} } },
          { name: 'show_eta', label: 'Show Estimated Time (charge/discharge)', helper: 'Default: active', selector: { boolean: {} } },
          { name: 'show_product_capacity', label: 'Show Product and Capacity', helper: 'Default: active', selector: { boolean: {} } },
        ]},
        { type:'expandable', title:'Header Information', schema:[
          { name: 'header_information_default', label: 'Default Information', helper: 'Default: versions (BMU/BMS)', selector: { select: { options: [ {value:'versions', label:'BMU/BMS Versions'}, {value:'ui', label:'UI/Modules'}, {value:'energy', label:'Total Energy'}, {value:'efficiency', label:'Efficiency & SoH'} ] } } },
          { name: 'show_header_versions', label: 'Show BMU/BMS Versions', helper: 'Default: active', selector: { boolean: {} } },
          { name: 'show_header_ui', label: 'Show UI Information', helper: 'Default: active', selector: { boolean: {} } },
          { name: 'show_header_energy', label: 'Show Total Energy', helper: 'Default: active', selector: { boolean: {} } },
          { name: 'show_header_efficiency', label: 'Show Efficiency & State of Health', helper: 'Default: active', selector: { boolean: {} } },
        ]},
        { type:'expandable', title:'Graph Settings', schema: graphSchema },
        { type:'expandable', title:'Battery Module – Detailed Graph Settings', schema:[
          { name: 'show_y_axis', label: 'Show Y‑axis', helper: 'Default: active', selector: { boolean: {} } },
        ]}
      ];
      form.schema = schema;
      this._lastSchemaKey = autoV ? 'autoV' : 'manualV';
      // Ensure labels and helpers are displayed in ha-form
      form.computeLabel = (schema) => schema.label || schema.name;
      form.computeHelper = (schema) => schema.helper || '';
      form.data = {
        unit: cfg.unit || 'mV',
        voltage_auto: cfg.voltage_auto !== false,
        show_vt_toggle: cfg.show_vt_toggle !== false,
        show_view_toggle: cfg.show_view_toggle === true,
        show_power: cfg.show_power !== false,
        show_eta: cfg.show_eta !== false,
        show_product_capacity: cfg.show_product_capacity !== false,
        header_information_default: cfg.header_information_default || 'versions',
        show_header_versions: cfg.show_header_versions !== false,
        show_header_ui: cfg.show_header_ui !== false,
        show_header_energy: cfg.show_header_energy !== false,
        show_header_efficiency: cfg.show_header_efficiency !== false,
        module_view: cfg.module_view || 'detailed',
        voltage_min: cfg.voltage_min,
        voltage_max: cfg.voltage_max,
        temp_min: cfg.temp_min,
        temp_max: cfg.temp_max,
        show_y_axis: cfg.show_y_axis !== false,
        show_gray_caps: cfg.show_gray_caps !== false,
      };
      form.addEventListener('value-changed', (ev)=>{
        ev.stopPropagation();
        this._isEditing = true;
        const detail = ev.detail?.value || {};
        const clean = {};
        Object.keys(detail).forEach(k=>{ if (detail[k] !== undefined) clean[k] = detail[k]; });
        clearTimeout(this._debounceT);
        this._debounceT = setTimeout(()=>{
          const base = this._config || cfg || {};
          const newCfg = { ...base, ...clean };
          if (newCfg.voltage_auto !== false){ delete newCfg.voltage_min; delete newCfg.voltage_max; }
          this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: newCfg } }));
        }, 300);
      });
      form.addEventListener('focusin', ()=>{ this._isEditing = true; });
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
    const select = (val, opts)=>{ const s=document.createElement('select'); opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.value||o; op.textContent=o.label||o; if ((o.value||o)===val) op.selected=true; s.appendChild(op); }); return s; };

    const entityI = text(cfg.entity || ''); addField('Entity (optional)', entityI, 'Usually auto-discovered.');
    const unitI = select(cfg.unit || 'mV', ['mV','V']); addField('Unit', unitI, 'Default: mV');
    const moduleViewI = select(cfg.module_view || 'detailed', [
      {value:'detailed', label:'Detailed Graph'},
      {value:'minimalistic', label:'Minimalistic View'},
      {value:'no-data', label:'No Data'}
    ]); addField('Battery Module View', moduleViewI, 'Default: Detailed Graph');
    const showVTI = bool(cfg.show_vt_toggle !== false); addField('Show Voltage/Temperature Toggle', showVTI, 'Default: active');
    const showViewToggleI = bool(cfg.show_view_toggle === true); addField('Show Battery Visualization Toggle', showViewToggleI, 'Default: disabled');
    const showPowerI = bool(cfg.show_power !== false); addField('Show Current Power', showPowerI, 'Default: active');
    const showETAI = bool(cfg.show_eta !== false); addField('Show Estimated Time', showETAI, 'Default: active');
    const showCapI = bool(cfg.show_product_capacity !== false); addField('Show Product and Capacity', showCapI, 'Default: active');
    const vAutoI = bool(cfg.voltage_auto !== false); addField('Voltage auto', vAutoI, 'Default: active');
    let vminI, vmaxI;
    if (!vAutoI.checked){ vminI = num(cfg.voltage_min); addField('Voltage min (mV)', vminI, 'Shown when Voltage auto is disabled'); vmaxI = num(cfg.voltage_max); addField('Voltage max (mV)', vmaxI, 'Shown when Voltage auto is disabled'); }
    const tminI = num(cfg.temp_min); addField('Temperature min (°C)', tminI, 'Default: 0');
    const tmaxI = num(cfg.temp_max); addField('Temperature max (°C)', tmaxI, 'Default: 60');
    const grayI = bool(cfg.show_gray_caps !== false); addField('Show gray caps (voltage)', grayI, 'Default: active');
    const yI = bool(cfg.show_y_axis !== false); addField('Show Y‑axis', yI, 'Default: active');

    const save = ()=>{
      const out = {
        entity: entityI.value,
        unit: unitI.value,
        module_view: moduleViewI.value,
        show_vt_toggle: showVTI.checked,
        show_view_toggle: showViewToggleI.checked,
        show_power: showPowerI.checked,
        show_eta: showETAI.checked,
        show_product_capacity: showCapI.checked,
        voltage_auto: vAutoI.checked,
        voltage_min: (!vAutoI.checked && vminI && vminI.value !== '') ? Number(vminI.value) : undefined,
        voltage_max: (!vAutoI.checked && vmaxI && vmaxI.value !== '') ? Number(vmaxI.value) : undefined,
        temp_min: tminI.value === '' ? undefined : Number(tminI.value),
        temp_max: tmaxI.value === '' ? undefined : Number(tmaxI.value),
        show_y_axis: yI.checked,
        show_gray_caps: grayI.checked,
      };
      // Ensure we remove manual voltage limits when auto is enabled
      if (out.voltage_auto){ delete out.voltage_min; delete out.voltage_max; }
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { ...cfg, ...out } } }));
    };
    wrap.addEventListener('change', save);
    root.appendChild(wrap);
  }
}
if (!customElements.get('byd-battery-box-visualization-editor')) customElements.define('byd-battery-box-visualization-editor', BYDBatteryBoxVisualizationEditor);
