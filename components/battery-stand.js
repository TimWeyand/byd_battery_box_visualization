// BYD Battery Box Visualization - BatteryStand web component (static)
const cssUrl = new URL('../styles/battery.css?v=0.0.3', import.meta.url);

export class BatteryStand extends HTMLElement {
  constructor(){ super(); this.attachShadow({mode:'open'}); }
  connectedCallback(){ this._render(); this._ensureCss(); }
  async _ensureCss(){ if (this._sheet) return; try{ const t=(typeof window!=='undefined'&&window.__BYD_CSS_TEXT)?window.__BYD_CSS_TEXT:await fetch(cssUrl).then(r=>r.text()); const s=new CSSStyleSheet(); await s.replace(t); this.shadowRoot.adoptedStyleSheets=[s]; this._sheet=s; }catch(e){} }
  _render(){ this.shadowRoot.innerHTML = `<div class="battery-stand"><div class="foot left"></div><div class="foot right"></div></div>`; }
}

if (!customElements.get('byd-battery-stand')) customElements.define('byd-battery-stand', BatteryStand);
