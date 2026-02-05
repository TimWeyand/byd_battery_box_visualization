// BYD Battery Box Visualization - BatterySystem (BMU level) container
// Performance optimized: debounced rendering
import './battery-tower.js';
const cssUrl = new URL('../styles/battery.css?v=0.0.7', import.meta.url);

const RENDER_DEBOUNCE_MS = 500; // 2 updates per second

export class BatterySystem extends HTMLElement {
  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this._towers = 1; // 1..3
    this._towerEls = [];

    // Performance: render scheduling
    this._renderScheduled = false;
    this._renderFrame = null;
    this._renderTimeout = null; // Store setTimeout ID for cleanup
    this._lastRenderTime = 0;
    this._dirty = true;
  }
  connectedCallback(){
    this._scheduleRender();
    this._ensureCss();
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

  disconnectedCallback(){
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
    }
    if (this._renderFrame) {
      cancelAnimationFrame(this._renderFrame);
      this._renderFrame = null;
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
    // If not visible, _dirty flag is set and render will happen when tab becomes visible
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
  async _ensureCss(){
    if (this._sheet) return;
    try{
      const g = (typeof globalThis!=='undefined')?globalThis:(typeof window!=='undefined'?window:undefined);
      let s = g && g.__BYD_CSS_SHEET;
      if (!s){
        const t = (g && g.__BYD_CSS_TEXT) ? g.__BYD_CSS_TEXT : await fetch(cssUrl).then(r=>r.text());
        s = new CSSStyleSheet();
        await s.replace(t);
        if (g) g.__BYD_CSS_SHEET = s;
        // Notify any child components waiting to adopt the shared stylesheet
        try{ window.dispatchEvent(new Event('byd-css-ready')); }catch(_){ /* ignore */ }
      }
      this.shadowRoot.adoptedStyleSheets = [s];
      this._sheet = s;
    }catch(e){}
  }

  // API
  setTowers(n){
    const v = Math.max(1, Math.min(3, Number(n)||1));
    if (this._towers !== v) {
      this._towers = v;
      // First tower change: render immediately (synchronously) so towers are ready for data
      if (!this._initialTowersSet) {
        this._initialTowersSet = true;
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
  getTower(i){ return this._towerEls[i-1]; }

  // convenience proxies
  setStateOfCharge(v){ this._towerEls.forEach(t=>t?.setStateOfCharge(v)); }
  setStateOfHealth(v){ this._towerEls.forEach(t=>t?.setStateOfHealth(v)); }
  setBMUPower(v){ this._towerEls.forEach(t=>t?.setBMUPower(v)); }
  setBMUVersion(v){ this._towerEls.forEach(t=>t?.setBMUVersion(v)); }

  _render(){
    const r = this.shadowRoot; if (!r) return;
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '1fr';
    wrap.style.gap = '14px';
    wrap.style.width = '100%';
    r.innerHTML = '';
    r.appendChild(wrap);

    this._towerEls = [];
    for (let i=0;i<this._towers;i++){
      const tower = document.createElement('byd-battery-tower');
      tower.setAttribute('index', String(i+1));
      wrap.appendChild(tower);
      this._towerEls.push(tower);
    }
  }
}

if (!customElements.get('byd-battery-system')) customElements.define('byd-battery-system', BatterySystem);
