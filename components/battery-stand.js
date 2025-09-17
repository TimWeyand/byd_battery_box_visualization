// BYD Battery Box Visualization - BatteryStand web component (static)
export class BatteryStand extends HTMLElement {
  constructor(){ super(); this.attachShadow({mode:'open'}); }
  connectedCallback(){ this._render(); this._adoptCss(); }
  _adoptCss(){ try{ const g=(typeof globalThis!=='undefined')?globalThis:(typeof window!=='undefined'?window:undefined); if (this._sheet || !this.shadowRoot) return; const apply=()=>{ const s=g&&g.__BYD_CSS_SHEET; if (s){ this.shadowRoot.adoptedStyleSheets=[s]; this._sheet=s; } }; if (g&&g.__BYD_CSS_SHEET){ apply(); return; } const onReady=()=>{ window.removeEventListener('byd-css-ready', onReady); apply(); }; window.addEventListener('byd-css-ready', onReady); }catch(e){} }
  _render(){ this.shadowRoot.innerHTML = `<div class="battery-stand"><div class="foot left"></div><div class="foot right"></div></div>`; }
}

if (!customElements.get('byd-battery-stand')) customElements.define('byd-battery-stand', BatteryStand);
