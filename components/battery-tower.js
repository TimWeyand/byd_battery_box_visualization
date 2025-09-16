// BYD Battery Box Visualization - BatteryTower component
import './battery-header.js';
import './battery-module.js';
import './battery-stand.js';

const cssUrl = new URL('../styles/battery.css?v=0.0.3', import.meta.url);

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
  }
  connectedCallback(){ this._render(); this._ensureCss(); }
  async _ensureCss(){ if (this._sheet) return; try{ const t=(typeof window!=='undefined'&&window.__BYD_CSS_TEXT)?window.__BYD_CSS_TEXT:await fetch(cssUrl).then(r=>r.text()); const s=new CSSStyleSheet(); await s.replace(t); this.shadowRoot.adoptedStyleSheets=[s]; this._sheet=s; }catch(e){} }

  // API required by spec
  setModules(n){ this._modules = Math.max(2, Math.min(10, Number(n)||2)); this._render(); }
  getModulesCount(){ return this._modules; }
  setVoltage(data){ this._eachModuleData(data, (el, arr)=> el.setVoltage(arr)); }
  setHistoryMaxVoltage(data){ this._eachModuleData(data, (el, arr)=> el.setHistoryMaxVoltage(arr)); }
  setHistoryMinVoltage(data){ this._eachModuleData(data, (el, arr)=> el.setHistoryMinVoltage(arr)); }
  setChartMaxVoltage(v){ this._chartV.max = Number(v)||this._chartV.max; this._moduleEls.forEach(m=>m.setChartMaxVoltage(this._chartV.max)); }
  setChartMinVoltage(v){ this._chartV.min = Number(v)||this._chartV.min; this._moduleEls.forEach(m=>m.setChartMinVoltage(this._chartV.min)); }
  setTemperature(data){ this._eachModuleData(data, (el, arr)=> el.setTemperature(arr)); }
  setChartMaxTemperature(v){ this._chartT.max = Number(v)||this._chartT.max; this._moduleEls.forEach(m=>m.setChartMaxTemperature(this._chartT.max)); }
  setChartMinTemperature(v){ this._chartT.min = Number(v)||this._chartT.min; this._moduleEls.forEach(m=>m.setChartMinTemperature(this._chartT.min)); }
  setCellBallancing(data){ this._eachModuleData(data, (el, arr)=> el.setCellBallancing(arr)); }
  setStateOfCharge(v){ this._header?.setStateOfCharge(v); }
  setStateOfHealth(v){ this._header?.setStateOfHealth(v); }
  setEfficiency(v){}
  setBMUPower(v){ this._header?.setBMUPower(v); }
  setBMUVersion(v){ this._header?.setBMUVersion(v); }
  setBMSVersion(v){ this._header?.setBMSVersion(v); }
  setUIMeta(v){ this._header?.setUIMeta?.(v); }
  showVoltage(){ this._view='voltage'; this._header?.setView?.('voltage'); this._moduleEls.forEach(m=>m.showVoltage()); }
  showTemperature(){ this._view='temperature'; this._header?.setView?.('temperature'); this._moduleEls.forEach(m=>m.showTemperature()); }
  showYAxisValues(){ this._moduleEls.forEach(m=>m.showYAxisValues()); }
  hideYAxisValues(){ this._moduleEls.forEach(m=>m.hideYAxisValues()); }
  setShowGrayCaps(v){ this._moduleEls.forEach(m=>m.setShowGrayCaps?.(v)); }

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

    const grid = r.querySelector('.modules');
    grid.innerHTML = '';
    this._moduleEls = [];
    const count = this._modules;
    for (let i=0;i<count;i++){
      const m = document.createElement('byd-battery-module');
      m.name = `BMS ${this._index}.${i+1}`;
      m.setChartMinVoltage(this._chartV.min); m.setChartMaxVoltage(this._chartV.max);
      m.setChartMinTemperature(this._chartT.min); m.setChartMaxTemperature(this._chartT.max);
      grid.appendChild(m);
      this._moduleEls.push(m);
    }
  }
}

if (!customElements.get('byd-battery-tower')) customElements.define('byd-battery-tower', BatteryTower);
