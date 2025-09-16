// BYD Battery Box Visualization - BatteryHeader web component
const cssUrl = new URL('../styles/battery.css?v=0.0.2', import.meta.url);

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
    this._versionsMode = 0; // 0 = BMU/BMS, 1 = UI/meta
    this._onToggle = null; // callback
    this._view = 'voltage';
  }
  connectedCallback(){ this._render(); this._ensureCss(); }
  async _ensureCss(){
    if (this._sheet) return; try{ const txt = (typeof window !== 'undefined' && window.__BYD_CSS_TEXT) ? window.__BYD_CSS_TEXT : await fetch(cssUrl).then(r=>r.text()); const s=new CSSStyleSheet(); await s.replace(txt); this.shadowRoot.adoptedStyleSheets=[s]; this._sheet=s; }catch(e){}
  }

  // API
  setBMUPower(v){ this._bmuPower = Number(v)||0; this._render(); }
  setBMUVersion(v){ this._bmuVersion = v??''; this._render(); }
  setBMSVersion(v){ this._bmsVersion = v??''; this._render(); }
  setUIMeta(v){ this._uiMeta = v??''; this._render(); }
  setStateOfCharge(v){ this._soc = Number(v)||0; this._render(); }
  setStateOfHealth(v){ this._soh = Number(v)||0; this._render(); }
  // Programmatic view setter (does not emit events)
  setView(view){
    const v = view === 'temperature' ? 'temperature' : 'voltage';
    if (this._view !== v){
      this._view = v;
      this._render();
    } else {
      // still re-render to ensure UI reflects state (e.g., chips)
      this._render();
    }
  }
  showVoltage(){ this.setView('voltage'); this.dispatchEvent(new CustomEvent('toggle-view', {detail:{view:'voltage'}})); }
  showTemperature(){ this.setView('temperature'); this.dispatchEvent(new CustomEvent('toggle-view', {detail:{view:'temperature'}})); }

  _render(){
    const r = this.shadowRoot; if (!r) return;
    const cls = this._soc <= 20 ? 'soc-low' : this._soc <= 80 ? 'soc-mid':'soc-high';
    const flow = this._bmuPower < 0 ? 'charge' : this._bmuPower > 0 ? 'discharge' : '';
    const volClass = this._view === 'voltage' ? 'chip' : 'chip secondary';
    const tempClass = this._view === 'temperature' ? 'chip' : 'chip secondary';
    const versionsText = this._versionsMode === 0
      ? `BMU ${this._bmuVersion || ''}<br>BMS ${this._bmsVersion || ''}`
      : (this._uiMeta || '');
    const p = Number(this._bmuPower)||0;
    const pLabel = p < 0 ? 'Charging' : p > 0 ? 'Discharging' : 'Idle';
    const pValue = `${Math.abs(Math.round(p))} W`;
    r.innerHTML = `
      <div class="battery-tower ${cls}">
        <div class="header ${flow}">
          <div class="row top">
            <div class="logo">BYD</div>
            <div class="${volClass}" id="voltage">mV</div>
            <div class="${tempClass}" id="temp">°C</div>
            <div class="versions" id="versions">${versionsText}</div>
            <div class="power"><div class="p-label">${pLabel}</div><div class="p-value">${pValue}</div></div>
          </div>
          <div class="row soc-row">
            <div class="soc"><div class="fill" style="width:${Math.max(0,Math.min(100,this._soc))}%"></div><div class="label">${Math.round(this._soc)}%</div></div>
          </div>
        </div>
      </div>`;
    const vBtn = r.getElementById('voltage');
    const tBtn = r.getElementById('temp');
    const ver = r.getElementById('versions');
    vBtn?.addEventListener('click', ()=> this.showVoltage());
    tBtn?.addEventListener('click', ()=> this.showTemperature());
    ver?.addEventListener('click', ()=>{ this._versionsMode = this._versionsMode ? 0 : 1; this._updateVersionsText(); });
  }

  _updateVersionsText(){
    const r = this.shadowRoot; if (!r) return;
    const el = r.getElementById('versions');
    if (el){
      el.innerHTML = this._versionsMode === 0
        ? `BMU ${this._bmuVersion || ''}<br>BMS ${this._bmsVersion || ''}`
        : (this._uiMeta || '');
    }
  }
}

if (!customElements.get('byd-battery-header')) customElements.define('byd-battery-header', BatteryHeader);
