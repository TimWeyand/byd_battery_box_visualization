// BYD Battery Box Visualization - BatteryTower component
// Performance optimized: debounced rendering
import './battery-header.js';
import './battery-module.js';
import './battery-stand.js';

const RENDER_DEBOUNCE_MS = 500; // 2 updates per second

export class BatteryTower extends HTMLElement {
  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this._index = Number(this.getAttribute('index')) || 1;
    this._modules = 2;
    this._header = null;
    this._moduleEls = [];
    this._chartV = {min:3100,max:3700};
    this._chartT = {min:0,max:60};
    this._view = 'voltage';
    this._displayUnit = 'mV';
    this._moduleView = 'detailed';

    // Cache for data that arrives before modules are created
    this._pendingData = {
      voltage: null,
      histMax: null,
      histMin: null,
      balancing: null,
      temps: null
    };

    // Performance: render scheduling
    this._renderScheduled = false;
    this._renderFrame = null;
    this._renderTimeout = null; // Store setTimeout ID for cleanup
    this._lastRenderTime = 0;
    this._cssReadyHandler = null;
    this._dirty = true;
  }
  connectedCallback(){
    this._scheduleRender();
    this._adoptCss();
    // Guard: cleanup existing handler if remounted
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    // Listen for visibility changes to render when tab becomes visible
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this._dirty) {
        this._renderScheduled = false; // Force-reset for new render cycle
        this._scheduleRender();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  // Mark data as changed and schedule render (only if tab is visible)
  _markDirty(){
    this._dirty = true;
    if (document.visibilityState === 'visible') {
      this._scheduleRender();
    }
    // If not visible, _dirty flag is set and render will happen when tab becomes visible
  }

  disconnectedCallback(){
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
    }
    if (this._renderFrame) {
      cancelAnimationFrame(this._renderFrame);
      this._renderFrame = null;
    }
    if (this._cssReadyHandler) {
      window.removeEventListener('byd-css-ready', this._cssReadyHandler);
      this._cssReadyHandler = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this._renderScheduled = false;
  }

  _scheduleRender(){
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    const now = performance.now();
    const elapsed = now - this._lastRenderTime;
    if (elapsed >= RENDER_DEBOUNCE_MS) {
      this._renderFrame = requestAnimationFrame(() => this._doRender());
    } else {
      this._renderTimeout = setTimeout(() => {
        this._renderTimeout = null;
        this._renderFrame = requestAnimationFrame(() => this._doRender());
      }, RENDER_DEBOUNCE_MS - elapsed);
    }
  }

  _doRender(){
    this._renderScheduled = false;
    this._lastRenderTime = performance.now();
    if (!this._dirty) return;
    this._dirty = false;
    this._render();
  }

  _adoptCss(){ try{ const g=(typeof globalThis!=='undefined')?globalThis:(typeof window!=='undefined'?window:undefined); if (this._sheet || !this.shadowRoot) return; const apply=()=>{ const s=g&&g.__BYD_CSS_SHEET; if (s){ this.shadowRoot.adoptedStyleSheets=[s]; this._sheet=s; } }; if (g&&g.__BYD_CSS_SHEET){ apply(); return; } this._cssReadyHandler=()=>{ window.removeEventListener('byd-css-ready', this._cssReadyHandler); this._cssReadyHandler=null; apply(); }; window.addEventListener('byd-css-ready', this._cssReadyHandler); }catch(e){} }

  // API required by spec
  setModules(n){
    const v = Math.max(2, Math.min(10, Number(n)||2));
    if (this._modules !== v) {
      this._modules = v;
      // First module change: render immediately (synchronously) so modules are ready for data
      // Subsequent changes: use debounced rendering for performance
      if (!this._initialModulesSet) {
        this._initialModulesSet = true;
        this._dirty = true;
        this._renderScheduled = true; // Prevent parallel render cycles
        this._render();
        this._renderScheduled = false;
        this._lastRenderTime = performance.now();
      } else {
        this._markDirty();
      }
    }
  }
  getModulesCount(){ return this._modules; }
  setVoltage(data){ this._pendingData.voltage = data; this._eachModuleData(data, (el, arr)=> el.setVoltage(arr)); }
  setHistoryMaxVoltage(data){ this._pendingData.histMax = data; this._eachModuleData(data, (el, arr)=> el.setHistoryMaxVoltage(arr)); }
  setHistoryMinVoltage(data){ this._pendingData.histMin = data; this._eachModuleData(data, (el, arr)=> el.setHistoryMinVoltage(arr)); }
  setChartMaxVoltage(v){ this._chartV.max = Number(v)||this._chartV.max; this._moduleEls.forEach(m=>m.setChartMaxVoltage(this._chartV.max)); }
  setChartMinVoltage(v){ this._chartV.min = Number(v)||this._chartV.min; this._moduleEls.forEach(m=>m.setChartMinVoltage(this._chartV.min)); }
  setTemperature(data){ this._pendingData.temps = data; this._eachModuleData(data, (el, arr)=> el.setTemperature(arr)); }
  setChartMaxTemperature(v){ this._chartT.max = Number(v)||this._chartT.max; this._moduleEls.forEach(m=>m.setChartMaxTemperature(this._chartT.max)); }
  setChartMinTemperature(v){ this._chartT.min = Number(v)||this._chartT.min; this._moduleEls.forEach(m=>m.setChartMinTemperature(this._chartT.min)); }
  setCellBallancing(data){ this._pendingData.balancing = data; this._eachModuleData(data, (el, arr)=> el.setCellBallancing(arr)); }
  setStateOfCharge(v){ this._header?.setStateOfCharge(v); }
  setStateOfHealth(v){ this._header?.setStateOfHealth(v); }
  setEfficiency(v){}
  setBMUPower(v){ this._header?.setBMUPower(v); }
  setBMUVersion(v){ this._header?.setBMUVersion(v); }
  setBMSVersion(v){ this._header?.setBMSVersion(v); }
  setUIMeta(v){ this._header?.setUIMeta?.(v); }
  setTowerCapacityWh(v){ this._header?.setTowerCapacityWh?.(v); }
  setEstimate(text){ this._header?.setEstimate?.(text); }
  setProductName(v){ this._header?.setProductName?.(v); }
  setDisplayUnit(unit){ this._displayUnit = unit==='V'?'V':'mV'; this._header?.setDisplayUnit?.(this._displayUnit); this._moduleEls.forEach(m=>m.setDisplayUnit?.(this._displayUnit)); }
  setModuleView(mode){ this._moduleView = (mode==='minimal')?'minimal':(mode==='none'?'none':'detailed'); this._header?.setModuleView?.(this._moduleView); this._moduleEls.forEach(m=>m.setModuleView?.(this._moduleView)); }
  getModuleView(){ return this._moduleView; }
  setHeaderInformation(opts){ this._header?.setHeaderInformation?.(opts); }
  setShowVTToggle(v){ this._header?.setShowVTToggle?.(v); }
  setShowViewToggle(v){ this._header?.setShowViewToggle?.(v); }
  showVoltage(){ this._view='voltage'; this._header?.setView?.('voltage'); this._moduleEls.forEach(m=>m.showVoltage()); }
  showTemperature(){ this._view='temperature'; this._header?.setView?.('temperature'); this._moduleEls.forEach(m=>m.showTemperature()); }
  getView(){ return this._view; }
  showYAxisValues(){ this._moduleEls.forEach(m=>m.showYAxisValues()); }
  hideYAxisValues(){ this._moduleEls.forEach(m=>m.hideYAxisValues()); }
  setShowGrayCaps(v){ this._moduleEls.forEach(m=>m.setShowGrayCaps?.(v)); }
  setHeaderDisplayOptions(opts){ this._header?.setHeaderDisplayOptions?.(opts); }

  _eachModuleData(data, fn){
    // data can be: [ [cells...], [cells...] ] or [ {m:1,v:[...]}, ... ]
    if (!data) return;
    if (Array.isArray(data)){
      if (data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) {
        for (const item of data){ const idx = (item.m||item.module||1) - 1; const el = this._moduleEls[idx]; if (el) fn(el, item.v||item.t||item.b||[]); }
      } else {
        for (let i=0;i<Math.min(this._moduleEls.length, data.length); i++){ fn(this._moduleEls[i], data[i]||[]); }
      }
    }
  }

  _render(){
    const r = this.shadowRoot; if (!r) return;
    r.innerHTML = `
      <div class="battery-tower">
        <byd-battery-header></byd-battery-header>
        <div class="modules"></div>
        <byd-battery-stand></byd-battery-stand>
      </div>
    `;
    this._header = r.querySelector('byd-battery-header');
    this._header.addEventListener('toggle-view', (e)=>{ e.detail.view==='temperature'?this.showTemperature():this.showVoltage(); });
    this._header.addEventListener('toggle-unit', (e)=>{ this.setDisplayUnit(e.detail?.unit); });
    this._header.addEventListener('toggle-module-view', (e)=>{ this.setModuleView(e.detail?.mode); });

    const grid = r.querySelector('.modules');
    grid.innerHTML = '';
    this._moduleEls = [];
    const count = this._modules;
    for (let i=0;i<count;i++){
      const m = document.createElement('byd-battery-module');
      m.name = `BMS ${this._index}.${i+1}`;
      m.setChartMinVoltage(this._chartV.min); m.setChartMaxVoltage(this._chartV.max);
      m.setChartMinTemperature(this._chartT.min); m.setChartMaxTemperature(this._chartT.max);
      m.setDisplayUnit?.(this._displayUnit);
      m.setModuleView?.(this._moduleView);
      grid.appendChild(m);
      this._moduleEls.push(m);
    }

    // Apply any pending data that arrived before modules were created
    if (this._pendingData.voltage) this._eachModuleData(this._pendingData.voltage, (el, arr) => el.setVoltage(arr));
    if (this._pendingData.histMax) this._eachModuleData(this._pendingData.histMax, (el, arr) => el.setHistoryMaxVoltage(arr));
    if (this._pendingData.histMin) this._eachModuleData(this._pendingData.histMin, (el, arr) => el.setHistoryMinVoltage(arr));
    if (this._pendingData.balancing) this._eachModuleData(this._pendingData.balancing, (el, arr) => el.setCellBallancing(arr));
    if (this._pendingData.temps) this._eachModuleData(this._pendingData.temps, (el, arr) => el.setTemperature(arr));
    // Clear pending data after applying to prevent stale data on re-render
    this._pendingData = { voltage: null, histMax: null, histMin: null, balancing: null, temps: null };
  }
}

if (!customElements.get('byd-battery-tower')) customElements.define('byd-battery-tower', BatteryTower);
