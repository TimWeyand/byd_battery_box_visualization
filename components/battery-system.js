// BYD Battery Box Visualization - BatterySystem (BMU level) container
import './battery-tower.js';
const cssUrl = new URL('../styles/battery.css?v=0.0.3', import.meta.url);

export class BatterySystem extends HTMLElement {
  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this._towers = 1; // 1..3
    this._towerEls = [];
  }
  connectedCallback(){ this._render(); this._ensureCss(); }
  async _ensureCss(){ if (this._sheet) return; try{ const t=(typeof window!=='undefined'&&window.__BYD_CSS_TEXT)?window.__BYD_CSS_TEXT:await fetch(cssUrl).then(r=>r.text()); const s=new CSSStyleSheet(); await s.replace(t); this.shadowRoot.adoptedStyleSheets=[s]; this._sheet=s; }catch(e){} }

  // API
  setTowers(n){ this._towers = Math.max(1, Math.min(3, Number(n)||1)); this._render(); }
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
