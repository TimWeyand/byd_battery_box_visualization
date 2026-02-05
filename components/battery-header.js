// BYD Battery Box Visualization - BatteryHeader web component
// Performance optimized: debounced rendering

const RENDER_DEBOUNCE_MS = 500; // 2 updates per second

export class BatteryHeader extends HTMLElement {
  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this._soc = 0; // 0..100
    this._soh = 0;
    this._bmuPower = 0; // W (sign indicates direction)
    this._bmuVersion = '';
    this._bmsVersion = '';
    this._uiMeta = '';
    this._onToggle = null; // callback
    this._view = 'voltage';
    this._displayUnit = 'mV'; // 'mV' | 'V' (for voltage view)
    this._towerCapacityWh = 0;
    this._etaText = '';
    this._productName = '';
    this._showVTToggle = true; // show Voltage/Temperature toggle chips
    this._showViewToggle = false; // show Detailed/Minimalistic toggle chip
    this._moduleView = 'detailed';
    this._showPower = true; this._showETA = true; this._showProductCapacity = true;
    this._headerInfo = { default: 'versions', show: { versions:true, ui:true, energy:true, efficiency:true }, payload: { versionsText:'', uiText:'', energyText:'', effText:'' } };
    this._headerInfoIndex = 0;

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
    this._setupResizeObserver();
    // Guard: cleanup existing handler if remounted
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    // Re-render when tab becomes visible again
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this._dirty) {
        this._renderScheduled = false;
        this._scheduleRender();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
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
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
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

  // Mark data as changed and schedule render (only if tab is visible)
  _markDirty(){
    this._dirty = true;
    if (document.visibilityState === 'visible') {
      this._scheduleRender();
    }
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
  _adoptCss(){
    try{
      const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : undefined);
      if (this._sheet || !this.shadowRoot) return;
      const apply = ()=>{
        const s = g && g.__BYD_CSS_SHEET;
        if (s && this.shadowRoot){ this.shadowRoot.adoptedStyleSheets = [s]; this._sheet = s; }
      };
      if (g && g.__BYD_CSS_SHEET){ apply(); return; }
      this._cssReadyHandler = ()=>{ window.removeEventListener('byd-css-ready', this._cssReadyHandler); this._cssReadyHandler = null; apply(); };
      window.addEventListener('byd-css-ready', this._cssReadyHandler);
    }catch(e){}
  }

  // API - only mark dirty if value actually changed
  setBMUPower(v){ const n = Number(v)||0; if (this._bmuPower !== n) { this._bmuPower = n; this._markDirty(); } }
  setBMUVersion(v){ const s = v??''; if (this._bmuVersion !== s) { this._bmuVersion = s; this._markDirty(); } }
  setBMSVersion(v){ const s = v??''; if (this._bmsVersion !== s) { this._bmsVersion = s; this._markDirty(); } }
  setUIMeta(v){ const s = v??''; if (this._uiMeta !== s) { this._uiMeta = s; this._markDirty(); } }
  setStateOfCharge(v){ const n = Number(v)||0; if (this._soc !== n) { this._soc = n; this._markDirty(); } }
  setStateOfHealth(v){ const n = Number(v)||0; if (this._soh !== n) { this._soh = n; this._markDirty(); } }
  setTowerCapacityWh(v){ this._towerCapacityWh = Number(v)||0; this._updateCapacity(); this._applyResponsive(); }
  setEstimate(text){ this._etaText = text||''; this._updateETA(); }
  setProductName(name){ this._productName = name || ''; this._updateProductName(); }
  // Programmatic view setter (does not emit events)
  setView(view){
    const v = view === 'temperature' ? 'temperature' : 'voltage';
    if (this._view !== v){
      this._view = v;
      this._markDirty();
    }
    // No else - don't render if nothing changed
  }
  setDisplayUnit(unit){
    const u = unit === 'V' ? 'V' : 'mV';
    if (this._displayUnit !== u){ this._displayUnit = u; this._markDirty(); }
  }
  showVoltage(){ this.setView('voltage'); this.dispatchEvent(new CustomEvent('toggle-view', {detail:{view:'voltage'}})); }
  showTemperature(){ this.setView('temperature'); this.dispatchEvent(new CustomEvent('toggle-view', {detail:{view:'temperature'}})); }

  _render(){
    const r = this.shadowRoot; if (!r) return;
    const cls = this._soc <= 20 ? 'soc-low' : this._soc <= 80 ? 'soc-mid':'soc-high';
    const flow = this._bmuPower < 0 ? 'charge' : this._bmuPower > 0 ? 'discharge' : '';
    const tempClass = this._view === 'temperature' ? 'chip' : 'chip secondary';
    const unitClass = this._view === 'voltage' ? 'chip' : 'chip secondary';
    const viewClass = 'chip secondary';
    // Compute header information text via payload options
    const infoText = this._getCurrentHeaderInfoText();
    const p = Number(this._bmuPower)||0;
    const pLabel = p < 0 ? 'Charging' : p > 0 ? 'Discharging' : 'Idle';
    const pValue = `${Math.abs(Math.round(p))} W`;

    // If already built once, patch only dynamic parts
    const wrap = r.querySelector('.battery-tower');
    if (wrap){
      wrap.className = `battery-tower ${cls}`;
      const header = r.querySelector('.header');
      if (header){
        header.classList.toggle('charge', this._bmuPower < 0);
        header.classList.toggle('discharge', this._bmuPower > 0);
      }
      const unitBtn = r.getElementById('unit');
      const tBtn = r.getElementById('temp');
      const viewBtn = r.getElementById('viewmode');
      if (unitBtn) { unitBtn.className = unitClass; unitBtn.style.display = this._showVTToggle ? '' : 'none'; }
      if (tBtn) { tBtn.className = tempClass; tBtn.style.display = this._showVTToggle ? '' : 'none'; }
      if (viewBtn) viewBtn.style.display = this._showViewToggle ? '' : 'none';
      const infoEl = r.getElementById('header_information');
      if (infoEl) { infoEl.innerHTML = infoText; infoEl.style.display = this._enabledHeaderInfoKeys().length ? '' : 'none'; infoEl.style.cursor = this._enabledHeaderInfoKeys().length>1 ? 'pointer' : 'default'; }
      const pBox = r.querySelector('.power'); if (pBox) pBox.style.display = (this._showPower || (this._showETA && !!this._etaText)) ? '' : 'none';
      const pLblEl = r.querySelector('.power .p-label'); if (pLblEl) { pLblEl.textContent = pLabel; pLblEl.style.display = this._showPower ? '' : 'none'; }
      const pValEl = r.querySelector('.power .p-value'); if (pValEl) { pValEl.textContent = pValue; pValEl.style.display = this._showPower ? '' : 'none'; }
      const pEtaEl = r.querySelector('.power .p-eta'); if (pEtaEl) pEtaEl.style.display = (this._showETA && !!this._etaText) ? '' : 'none';
      const fill = r.querySelector('.soc .fill'); if (fill) fill.style.width = `${Math.max(0,Math.min(100,this._soc))}%`;
      const lab = r.querySelector('.soc .label'); if (lab) lab.textContent = `${(Number(this._soc)||0).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})}%`;
      const cap = r.getElementById('capacity'); if (cap) cap.style.display = this._showProductCapacity ? '' : 'none';
      const logo = r.querySelector('.logo'); if (logo) logo.classList.toggle('nobrandInformation', !this._showProductCapacity);
      const prod = r.getElementById('productname'); if (prod) prod.style.display = this._showProductCapacity ? '' : 'none';
      const unitLbl = r.getElementById('unit'); if (unitLbl) unitLbl.textContent = this._displayUnit;
      const viewLbl = r.getElementById('viewmode'); if (viewLbl) viewLbl.textContent = (this._moduleView==='minimal'?'Minimal':(this._moduleView==='none'?'No Data':'Detailed'));
      this._updateETA();
      this._applyResponsive();
      this._updateProductName();
      return;
    }

    // First render: build DOM once
    r.innerHTML = `
      <div class="battery-tower ${cls}">
        <div class="header ${flow}">
          <div class="row top">
            <div class="logo">
                <div class="brandname">BYD</div>
                <div class="productname" id="productname"></div>
                <div class="capacity" id="capacity"></div>
            </div>
            
            <div class="${unitClass}" id="unit" style="${this._showVTToggle?'':'display:none'}">${this._displayUnit}</div>
            <div class="${tempClass}" id="temp" style="${this._showVTToggle?'':'display:none'}">°C</div>
            <div class="chip secondary" id="viewmode" style="${this._showViewToggle?'':'display:none'}">${this._moduleView==='minimal'?'Minimal':(this._moduleView==='none'?'No Data':'Detailed')}</div>
            <div class="versions" id="header_information">${infoText}</div>
            
            <div class="power"><div class="p-label">${pLabel}</div><div class="p-value">${pValue}</div><div class="p-eta" id="eta"></div></div>
          </div>
          <div class="row soc-row">
            <div class="soc"><div class="fill" style="width:${Math.max(0,Math.min(100,this._soc))}%"></div><div class="label">${(Number(this._soc)||0).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})}%</div></div>
          </div>
        </div>
      </div>`;
    const unitBtn = r.getElementById('unit');
    const tBtn = r.getElementById('temp');
    const viewBtn = r.getElementById('viewmode');
    const info = r.getElementById('header_information');
    unitBtn?.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); this.showVoltage(); });
    tBtn?.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); this.showTemperature(); });
    viewBtn?.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); if (!this._showViewToggle) return; this._moduleView = (this._moduleView==='minimal')?'detailed':'minimal'; this.dispatchEvent(new CustomEvent('toggle-module-view', {detail:{mode:this._moduleView}})); this._markDirty(); });
    info?.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); const keys = this._enabledHeaderInfoKeys(); if (keys.length<=1) return; this._headerInfoIndex = (this._headerInfoIndex+1)%keys.length; const infoEl = this.shadowRoot.getElementById('header_information'); if (infoEl) infoEl.innerHTML = this._getCurrentHeaderInfoText(); });
    this._updateCapacity();
    this._updateETA();
    this._applyResponsive();
    this._updateProductName();
  }

  _applyResponsive(){
    const r = this.shadowRoot; if (!r) return;
    const info = r.getElementById('header_information');
    const w = this.getBoundingClientRect().width || 0;
    if (info) info.style.display = (w < 300 || this._enabledHeaderInfoKeys().length===0) ? 'none' : '';
  }

  _setupResizeObserver(){
    if (this._ro) return;
    if (typeof ResizeObserver !== 'undefined'){
      this._ro = new ResizeObserver(()=> this._applyResponsive());
      this._ro.observe(this);
    } else {
      // Fallback: re-apply on window resize (store handler for cleanup)
      this._resizeHandler = () => this._applyResponsive();
      window.addEventListener('resize', this._resizeHandler);
    }
  }

  // Header Information helpers/APIs
  _enabledHeaderInfoKeys(){
    const s = this._headerInfo?.show || {};
    const keys = ['versions','ui','energy','efficiency'].filter(k=> s[k] !== false);
    // If nothing configured explicitly true/false, default to all
    return keys.length ? keys : ['versions','ui','energy','efficiency'];
  }
  _currentHeaderKey(){
    const keys = this._enabledHeaderInfoKeys();
    if (keys.length === 0) return '';
    const def = (this._headerInfo?.default)||'versions';
    const baseIdx = Math.max(0, keys.indexOf(def));
    const idx = (baseIdx + (this._headerInfoIndex||0)) % keys.length;
    return keys[idx];
  }
  _getCurrentHeaderInfoText(){
    const payload = this._headerInfo?.payload || {};
    const keys = this._enabledHeaderInfoKeys();
    if (keys.length === 0) return '';
    // Determine index starting from default
    let baseIdx = 0;
    const def = (this._headerInfo?.default)||'versions';
    const di = keys.indexOf(def);
    baseIdx = di>=0 ? di : 0;
    const idx = (baseIdx + this._headerInfoIndex) % keys.length;
    const k = keys[idx];
    if (k === 'versions') return payload.versionsText || (`BMU ${this._bmuVersion||''}<br>BMS ${this._bmsVersion||''}`);
    if (k === 'ui') return payload.uiText || (this._uiMeta||'');
    if (k === 'energy') return payload.energyText || '';
    if (k === 'efficiency') return payload.effText || '';
    return '';
  }
  setShowVTToggle(v){ const n = v !== false; if (this._showVTToggle !== n) { this._showVTToggle = n; this._markDirty(); } }
  setShowViewToggle(v){ const n = !!v; if (this._showViewToggle !== n) { this._showViewToggle = n; this._markDirty(); } }
  setModuleView(v){ const n = (v==='minimal')?'minimal':(v==='none'?'none':'detailed'); if (this._moduleView !== n) { this._moduleView = n; this._markDirty(); } }
  setHeaderInformation(opts){
    if (opts && typeof opts === 'object'){
      // Preserve the currently displayed info across updates from HA
      const prevKey = this._currentHeaderKey();
      this._headerInfo = {
        default: opts.default || 'versions',
        show: opts.show || this._headerInfo.show,
        payload: opts.payload || this._headerInfo.payload
      };
      // Recompute index so that the previously visible key stays visible if still enabled
      const keys = this._enabledHeaderInfoKeys();
      const def = this._headerInfo.default || 'versions';
      const baseIdx = Math.max(0, keys.indexOf(def));
      if (prevKey && keys.includes(prevKey)){
        // Index is relative to the default
        const rel = (keys.indexOf(prevKey) - baseIdx + keys.length) % keys.length;
        this._headerInfoIndex = rel;
      } else {
        // Fallback to default
        this._headerInfoIndex = 0;
      }
      this._markDirty();
    }
  }
  setHeaderDisplayOptions(opts){
    if (opts && typeof opts === 'object'){
      let changed = false;
      if (opts.showPower !== undefined && this._showPower !== !!opts.showPower) { this._showPower = !!opts.showPower; changed = true; }
      if (opts.showETA !== undefined && this._showETA !== !!opts.showETA) { this._showETA = !!opts.showETA; changed = true; }
      if (opts.showProductCapacity !== undefined && this._showProductCapacity !== !!opts.showProductCapacity) { this._showProductCapacity = !!opts.showProductCapacity; changed = true; }
      if (changed) this._markDirty();
    }
  }

  _updateCapacity(){
    const r = this.shadowRoot; if (!r) return;
    const el = r.getElementById('capacity');
    if (!el) return;
    const wh = Number(this._towerCapacityWh)||0;
    if (wh > 0){
      const kwh = wh/1000;
      el.textContent = `${kwh.toFixed(1)} kWh`;
    } else {
      el.textContent = '';
    }
  }

  _updateETA(){
    const r = this.shadowRoot; if (!r) return;
    const el = r.getElementById('eta');
    if (el){
      el.textContent = this._etaText || '';
      el.style.display = (this._showETA && !!this._etaText) ? '' : 'none';
    }
  }

  _updateProductName(){
    const r = this.shadowRoot; if (!r) return;
    const el = r.getElementById('productname');
    if (el){ el.textContent = this._productName || ''; }
  }
}

if (!customElements.get('byd-battery-header')) customElements.define('byd-battery-header', BatteryHeader);
