// BYD Battery Box Visualization - BatteryModule web component
// Renders one physical BMS module consisting of multiple cells

export class BatteryModule extends HTMLElement {
  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this._name = 'BMS';
    this._view = 'voltage'; // 'voltage' | 'temperature'
    this._yAxis = true;
    this._voltage = []; // mV per cell
    this._histMax = [];
    this._histMin = [];
    this._temp = []; // °C per sensor (half count of cells)
    this._balancing = []; // booleans per cell
    this._chart = { vMin: 3100, vMax: 3700, tMin: 0, tMax: 60 };
    this._last = { voltage: [], temp: [], histMin: [], histMax: [] };
    this._tip = { showUntil: 0, x: 0, y: 0, text: '' };
    this._showGrayCaps = true; // controls light-gray area from current to cell max (voltage view)
    this._displayUnit = 'mV'; // 'mV' | 'V'
    this._moduleView = 'detailed'; // 'detailed' | 'minimal'
  }

  connectedCallback(){ this._render(); this._adoptCss(); }

  _adoptCss(){
    try{
      if (this._sheet || !this.shadowRoot) return;
      const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : undefined);
      const apply = ()=>{ const s = g && g.__BYD_CSS_SHEET; if (s){ this.shadowRoot.adoptedStyleSheets = [s]; this._sheet = s; } };
      if (g && g.__BYD_CSS_SHEET){ apply(); return; }
      const onReady = ()=>{ window.removeEventListener('byd-css-ready', onReady); apply(); };
      window.addEventListener('byd-css-ready', onReady);
    }catch(e){}
  }

  // API methods
  setVoltage(arr){ this._setArray('voltage', arr); }
  setHistoryMaxVoltage(arr){ this._setArray('histMax', arr); }
  setHistoryMinVoltage(arr){ this._setArray('histMin', arr); }
  setChartMaxVoltage(v){ this._chart.vMax = Number(v)||this._chart.vMax; this._render(); }
  setChartMinVoltage(v){ this._chart.vMin = Number(v)||this._chart.vMin; this._render(); }
  setTemperature(arr){ this._setArray('temp', arr); }
  setChartMaxTemperature(v){ this._chart.tMax = Number(v)||this._chart.tMax; this._render(); }
  setChartMinTemperature(v){ this._chart.tMin = Number(v)||this._chart.tMin; this._render(); }
  setCellBallancing(arr){ this._balancing = Array.isArray(arr)?arr:[]; this._render(); }
  setShowGrayCaps(v){ this._showGrayCaps = v !== false; this._render(); }
  setDisplayUnit(u){ this._displayUnit = u === 'V' ? 'V' : 'mV'; this._render(); }
  setModuleView(mode){ this._moduleView = (mode==='minimal')?'minimal':(mode==='none'?'none':'detailed'); this._render(); }
  setStateOfCharge(){} // not used on module level
  setStateOfHealth(){}
  setEfficiency(){}
  setBMUPower(){}
  setBMUVersion(){}
  setBMSVersion(){}

  showVoltage(){ this._view = 'voltage'; this._render(); }
  showTemperature(){ this._view = 'temperature'; this._render(); }
  showYAxisValues(){ this._yAxis = true; this._render(); }
  hideYAxisValues(){ this._yAxis = false; this._render(); }

  set name(v){ this._name = v; this._render(); }
  get name(){ return this._name; }

  _setArray(key, arr){
    const field = key === 'voltage' ? 'voltage' : key === 'histMax' ? 'histMax' : key === 'histMin' ? 'histMin' : key;
    if (!Array.isArray(arr)) return;
    // keep last values for animations
    if (field === 'voltage') this._last.voltage = this._voltage.slice();
    if (field === 'temp') this._last.temp = this._temp.slice();
    if (field === 'histMin') this._last.histMin = this._histMin.slice();
    if (field === 'histMax') this._last.histMax = this._histMax.slice();
    this['_'+field] = arr.slice();
    this._render();
  }

  _getAxis(){
    if (this._view === 'temperature') return {min:this._chart.tMin, max:this._chart.tMax, unit:'°C'};
    // voltage (stored in mV); display unit can be 'mV' or 'V'
    const min = this._chart.vMin ?? Math.min(...this._histMin, ...this._voltage);
    const max = this._chart.vMax ?? Math.max(...this._histMax, ...this._voltage);
    const unit = this._displayUnit === 'V' ? 'V' : 'mV';
    return {min, max, unit};
  }

  _render(){
    const root = this.shadowRoot;
    if (!root) return;
    const axis = this._getAxis();
    const isTemp = this._view === 'temperature';

    // No Data view
    if (this._moduleView === 'none'){
      root.innerHTML = `
        <div class="battery-module nodata no-axis">
          <div class="module-name">${this._name||''}</div>
        </div>
      `;
      return;
    }
    // Minimalistic view branch
    if (this._moduleView === 'minimal'){
      const vVals = this._voltage.filter(v=>Number.isFinite(Number(v))).map(Number);
      const tVals = this._temp.filter(v=>Number.isFinite(Number(v))).map(Number);
      const med = (arr)=>{ if (!arr.length) return 0; const a=[...arr].sort((a,b)=>a-b); const mid=Math.floor(a.length/2); return a.length%2?a[mid]:(a[mid-1]+a[mid])/2; };
      const vMed = med(vVals);
      const hmMed = med(this._histMin.filter(v=>Number.isFinite(Number(v))).map(Number));
      const hMMed = med(this._histMax.filter(v=>Number.isFinite(Number(v))).map(Number));
      const tMed = med(tVals);
      // Horizontal scales for voltage and temperature
      const toXV = (v)=>{ const min = this._chart.vMin, max = this._chart.vMax; if (!Number.isFinite(v)||max===min) return 0; const c=Math.min(max,Math.max(min,Number(v))); return (c-min)/(max-min)*100; };
      const toXT = (v)=>{ const min = this._chart.tMin, max = this._chart.tMax; if (!Number.isFinite(v)||max===min) return 0; const c=Math.min(max,Math.max(min,Number(v))); return (c-min)/(max-min)*100; };
      // Fudge baseline if very small delta
      let fudgeDown = 0; { const delta = Math.max(0, vMed - hmMed); if (delta < 20) fudgeDown = 150; }
      const formatVal = (raw)=>{
        if (this._displayUnit === 'V') return `${(Number(raw)/1000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3})} V`;
        return `${Math.round(Number(raw))} mV`;
      };
      const startPct = toXV(hmMed - fudgeDown);
      const endPct = toXV(vMed);
      const widthPct = Math.max(0, endPct - startPct);
      const centerPct = startPct + widthPct/2;
      root.innerHTML = `
        <div class="battery-module minimal no-axis">
          <div class="mini">
            <div class="mini-row">
              <div class="mini-label">Voltage</div>
              <div class="hbar">
                <div class="hseg ${this._balancing?.some(b=>b===1||b===true)?'bluecap':'greencap'}" style="left:0;width:${Math.max(0,toXV(hmMed))}%;"></div>
                <div class="hseg cur${this._balancing?.some(b=>b===1||b===true)?' bal':''}" style="left:${startPct}%;width:${widthPct}%;"></div>
                ${this._showGrayCaps?`<div class=\"hseg max\" style=\"left:${endPct}%;width:${Math.max(0,toXV(hMMed)-endPct)}%\"></div>`:''}
                <div class="hnum" style="left:${centerPct}%; color:#fff;">${formatVal(vMed)}</div>
              </div>
            </div>
            <div class="mini-row">
              <div class="mini-label">Temperature</div>
              <div class="hbar">
                <div class="hseg cur" style="left:0;width:${Math.max(0,toXT(tMed))}%;"></div>
                <div class="hnum" style="left:${(Math.max(0,toXT(tMed)))/2}%; color:#fff;">${Number(tMed).toLocaleString(undefined,{maximumFractionDigits:1})} °C</div>
              </div>
            </div>
            <div class="mini-row">
              <div class="mini-label">Cell Balancing</div>
              <div class="mini-stat">${(this._balancing||[]).filter(b=>b===1||b===true).length}</div>
            </div>
          </div>
          <div class="module-name">${this._name||''}</div>
        </div>
      `;
      return;
    }

    // Detailed view structure
    root.innerHTML = `
      <div class="battery-module ${this._yAxis ? '' : 'no-axis'}">
        <div class="axis" style="display:${this._yAxis?'block':'none'}"></div>
        <div class="chart"></div>
        <div class="module-name">${this._name||''}</div>
      </div>
    `;

    const axisEl = root.querySelector('.axis');
    if (this._yAxis) this._renderAxis(axisEl, axis);

    const chart = root.querySelector('.chart');

    const cellsWrap = document.createElement('div');
    cellsWrap.className = 'cells';

    // Prepare tooltip element once per render
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.display = 'none';
    chart.appendChild(tooltip);
    const hide = ()=>{ if (!tooltip._sticky) tooltip.style.display='none'; };

    // Add horizontal grid lines spanning full module when Y axis is visible (overlay above cells)
    if (this._yAxis) {
      const grid = document.createElement('div');
      grid.className = 'grid-lines';
      const steps = 5;
      for (let i=0;i<=steps;i++){
        const y = i/steps; // 0..1
        const line = document.createElement('div');
        line.className = 'line';
        line.style.top = `${(1-y)*100}%`;
        grid.appendChild(line);
      }
      // append after tooltip so lines sit below tooltip but above cells via z-index
      chart.appendChild(grid);
    }

    const values = isTemp ? this._temp : this._voltage;
    const len = values.length;
    const max = axis.max, min = axis.min;

    const toH = (v)=>{
      if (v===undefined || v===null || isNaN(v)) return 0;
      if (max===min) return 0;
      const clamped = Math.min(max, Math.max(min, Number(v)));
      return (clamped - min) / (max - min) * 100; // percent
    };

    const formatVal = (raw)=>{
      if (isTemp) return `${Number(raw).toLocaleString(undefined,{maximumFractionDigits:1})} °C`;
      if (this._displayUnit === 'V') return `${(Number(raw)/1000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3})} V`;
      return `${Math.round(Number(raw))} mV`;
    };

    // If current and minimal voltages are almost identical across this module,
    // lower the effective baseline by 150 mV so green bars remain visible.
    let fudgeDown = 0;
    if (!isTemp) {
      const diffs = [];
      for (let i=0;i<len;i++){
        const v = Number(this._voltage[i]);
        const hm = Number(this._histMin[i]);
        if (Number.isFinite(v) && Number.isFinite(hm)) diffs.push(Math.max(0, v - hm));
      }
      const avg = diffs.length ? diffs.reduce((a,b)=>a+b,0) / diffs.length : 0;
      if (avg < 20) fudgeDown = 150;
    }

    for (let i=0;i<len;i++){
      const v = Number(values[i]);
      const cell = document.createElement('div'); cell.className = 'cell';

      // min/max and caps logic for voltage view
      let vMin = min, vMax = max;
      if (!isTemp){
        const hm = Number(this._histMin[i]);
        const hM = Number(this._histMax[i]);
        if (Number.isFinite(hm)) vMin = hm;
        if (Number.isFinite(hM)) vMax = hM;
        // bottom area between chart min and cell min (always shown; blue when balancing)
        if (Number.isFinite(vMin) && vMin > min){
          const isBal = this._balancing && (this._balancing[i]===true || this._balancing[i]===1);
          const bottomCap = document.createElement('div'); bottomCap.className='bar ' + (isBal ? 'bluecap' : 'greencap'); bottomCap.style.height = toH(vMin)+'%';
          cell.appendChild(bottomCap);
        }
        // light gray area from current value up to cell max
        const hCurLocal = toH(v);
        if (this._showGrayCaps && Number.isFinite(vMax)){
          const hCellMax = toH(vMax);
          const postH = Math.max(0, hCellMax - hCurLocal);
          if (postH > 0){
            const post = document.createElement('div'); post.className='bar max'; post.style.bottom = hCurLocal + '%'; post.style.height = postH + '%';
            cell.appendChild(post);
          }
        }
      }

      // current bar: from cell min up to current value (clamped)
      const cur = document.createElement('div');
      cur.className = 'bar cur';
      const hCur = toH(v);
      const hMin = toH(vMin - fudgeDown);
      const heightPct = Math.max(0, hCur - hMin);

      // prepare previous state for animation
      const last = isTemp ? this._last.temp[i] : this._last.voltage[i];
      const hasPrev = last !== undefined && !Number.isNaN(Number(last));
      if (hasPrev){
        let prevBottom = 0, prevHeight = 0;
        if (!isTemp){
          let prevMin = vMin;
          const pMin = Number(this._last.histMin[i]);
          if (Number.isFinite(pMin)) prevMin = pMin;
          const hPrevMin = toH(prevMin - fudgeDown);
          const hPrevCur = toH(Number(last));
          prevBottom = hPrevMin;
          prevHeight = Math.max(0, hPrevCur - hPrevMin);
        } else {
          // temperature: base is chart min (0%), animate height only
          prevBottom = 0;
          prevHeight = Math.max(0, toH(Number(last)));
        }
        cur.style.transition = 'none';
        cur.style.bottom = prevBottom + '%';
        cur.style.height = prevHeight + '%';
        // apply final in next frame to trigger transition
        requestAnimationFrame(()=>{
          cur.style.transition = 'height .6s ease, bottom .6s ease';
          cur.style.bottom = hMin + '%';
          cur.style.height = heightPct + '%';
        });
      } else {
        // no previous value; set final immediately
        cur.style.bottom = hMin + '%';
        cur.style.height = heightPct + '%';
      }

      // balancing color (voltage view only)
      if (!isTemp && this._balancing && (this._balancing[i]===true || this._balancing[i]===1))
        cell.classList.add('balancing');

      cell.appendChild(cur);

      // Tooltip interactions: hover and click (near cursor or hovered cell)
      const place = (ev)=>{
        const chartRect = chart.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.textContent = formatVal(v);
        // force measure
        const tipW = tooltip.offsetWidth || 50;
        const tipH = tooltip.offsetHeight || 20;

        let hasClient = ev && typeof ev.clientX === 'number' && typeof ev.clientY === 'number' && (ev.clientX !== 0 || ev.clientY !== 0);
        let x, y;
        if (hasClient){
          x = (ev.clientX - chartRect.left) + 10;
          y = (ev.clientY - chartRect.top) - 10 - tipH;
        } else {
          // Fallback to cell center if event lacks reliable coordinates (e.g., HA retargeted events)
          const cellRect = cell.getBoundingClientRect();
          x = (cellRect.left - chartRect.left) + cellRect.width/2 + 8;
          y = (cellRect.top - chartRect.top) - tipH - 8;
        }
        // clamp within chart
        x = Math.max(6, Math.min(x, chartRect.width - tipW - 6));
        y = Math.max(6, Math.min(y, chartRect.height - tipH - 6));
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        // persist tooltip position/text for re-renders during HA updates
        this._tip.x = x; this._tip.y = y; this._tip.text = valueText;
      };
      // Use Pointer Events for broader compatibility (mouse + touch + pen)
      cell.addEventListener('pointerenter', (ev)=>{ place(ev); });
      cell.addEventListener('pointermove', (ev)=>{ place(ev); });
      cell.addEventListener('pointerleave', hide);
      cell.addEventListener('pointerdown', (ev)=>{
        place(ev);
        tooltip.style.display = 'block';
        tooltip._sticky = true;
        // remember sticky until time
        const now = Date.now();
        this._tip.showUntil = now + 3000;
        clearTimeout(tooltip._t);
        tooltip._t = setTimeout(()=>{ tooltip._sticky = false; this._tip.showUntil = 0; hide(); }, 3000);
      });

      cellsWrap.appendChild(cell);
    }

    chart.appendChild(cellsWrap);

    // Restore sticky tooltip across re-renders (HA updates)
    if (this._tip?.showUntil && Date.now() < this._tip.showUntil){
      tooltip.style.display = 'block';
      tooltip.textContent = this._tip.text || '';
      const rect = chart.getBoundingClientRect();
      const tipW = tooltip.offsetWidth || 50;
      const tipH = tooltip.offsetHeight || 20;
      let x = this._tip.x, y = this._tip.y;
      x = Math.max(6, Math.min(x, rect.width - tipW - 6));
      y = Math.max(6, Math.min(y, rect.height - tipH - 6));
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip._sticky = true;
      clearTimeout(tooltip._t);
      const remaining = Math.max(0, this._tip.showUntil - Date.now());
      tooltip._t = setTimeout(()=>{ tooltip._sticky=false; this._tip.showUntil=0; hide(); }, remaining);
    }

    // Chart-level tooltip as a fallback (ensures it works even if cell events are retargeted in HA)
    if (len > 0) {
      const clamp = (v, min, max)=> Math.max(min, Math.min(max, v));
      const placeAt = (ev, idx)=>{
        const chartRect = chart.getBoundingClientRect();
        const val = values[idx];
        tooltip.style.display = 'block';
        tooltip.textContent = formatVal(val);
        const tipW = tooltip.offsetWidth || 50;
        const tipH = tooltip.offsetHeight || 20;
        let x = (ev?.clientX ?? (chartRect.left + chartRect.width/2)) - chartRect.left + 10;
        let y = (ev?.clientY ?? (chartRect.top + chartRect.height/2)) - chartRect.top - 10 - tipH;
        x = clamp(x, 6, chartRect.width - tipW - 6);
        y = clamp(y, 6, chartRect.height - tipH - 6);
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        // persist position/text for future re-renders
        this._tip.x = x; this._tip.y = y; this._tip.text = `${val} ${axis.unit}`;
      };
      chart.addEventListener('pointermove', (ev)=>{
        const rect = chart.getBoundingClientRect();
        const inner = rect.width - 12; // account for 6px padding on both sides
        const rel = clamp(((ev.clientX - rect.left) - 6) / (inner || 1), 0, 1);
        const idx = clamp(Math.floor(rel * len), 0, len-1);
        placeAt(ev, idx);
      });
      chart.addEventListener('pointerleave', hide);
    }
  }

  _renderAxis(el, axis){
    el.innerHTML = '';
    const steps = 5;
    for (let i=0; i<=steps; i++){
      const y = i/steps; // 0..1
      const tick = document.createElement('div'); tick.className='tick';
      tick.style.top = `${(1-y)*100}%`;
      const label = document.createElement('div'); label.className='label';
      const raw = axis.min + (axis.max - axis.min) * y;
      let txt;
      if (axis.unit === '°C'){
        txt = `${Number(raw).toLocaleString(undefined,{maximumFractionDigits:1})} ${axis.unit}`;
      } else if (axis.unit === 'V'){
        txt = `${(Number(raw)/1000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3})} V`;
      } else {
        txt = `${Math.round(Number(raw))} mV`;
      }
      label.textContent = txt;
      label.style.top = `${(1-y)*100}%`;
      el.appendChild(tick); el.appendChild(label);
    }
  }
}

if (!customElements.get('byd-battery-module')) customElements.define('byd-battery-module', BatteryModule);
