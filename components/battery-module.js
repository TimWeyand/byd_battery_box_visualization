// BYD Battery Box Visualization - BatteryModule web component
// Renders one physical BMS module consisting of multiple cells
// Performance optimized: debounced rendering, DOM patching instead of rebuild

const RENDER_DEBOUNCE_MS = 500; // 2 updates per second - sufficient for battery visualization

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
    this._showGrayCaps = true;
    this._displayUnit = 'mV'; // 'mV' | 'V'
    this._moduleView = 'detailed'; // 'detailed' | 'minimal' | 'none'

    // Performance: render scheduling
    this._renderScheduled = false;
    this._renderFrame = null;
    this._renderTimeout = null; // Store setTimeout ID for cleanup
    this._lastRenderTime = 0;
    this._dirty = true; // Flag to track if data changed

    // DOM cache
    this._dom = null;
    this._cellElements = [];
    this._tooltipTimer = null;
    this._cssReadyHandler = null;
    this._chartEventHandlers = null; // Store event handlers for cleanup
  }

  connectedCallback(){
    this._scheduleRender();
    this._adoptCss();
    // Guard: cleanup existing handler if remounted
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    // Re-render when tab becomes visible again
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this._dirty) {
        this._renderScheduled = false; // Reset to allow immediate render
        this._scheduleRender();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  disconnectedCallback(){
    // Cleanup to prevent memory leaks
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
    }
    if (this._renderFrame) {
      cancelAnimationFrame(this._renderFrame);
      this._renderFrame = null;
    }
    if (this._tooltipTimer) {
      clearTimeout(this._tooltipTimer);
      this._tooltipTimer = null;
    }
    if (this._cssReadyHandler) {
      window.removeEventListener('byd-css-ready', this._cssReadyHandler);
      this._cssReadyHandler = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    // Remove chart event listeners
    if (this._dom?.chart && this._chartEventHandlers) {
      this._dom.chart.removeEventListener('pointermove', this._chartEventHandlers.pointermove);
      this._dom.chart.removeEventListener('pointerleave', this._chartEventHandlers.pointerleave);
      this._dom.chart.removeEventListener('pointerdown', this._chartEventHandlers.pointerdown);
      this._chartEventHandlers = null;
    }
    this._renderScheduled = false;
    this._dom = null;
    this._cellElements = [];
  }

  _adoptCss(){
    try{
      if (this._sheet || !this.shadowRoot) return;
      const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : undefined);
      const apply = ()=>{ const s = g && g.__BYD_CSS_SHEET; if (s){ this.shadowRoot.adoptedStyleSheets = [s]; this._sheet = s; } };
      if (g && g.__BYD_CSS_SHEET){ apply(); return; }
      this._cssReadyHandler = ()=>{ window.removeEventListener('byd-css-ready', this._cssReadyHandler); this._cssReadyHandler = null; apply(); };
      window.addEventListener('byd-css-ready', this._cssReadyHandler);
    }catch(e){}
  }

  // Mark data as changed and schedule render (only if tab is visible)
  _markDirty(){
    this._dirty = true;
    // Don't schedule render if tab is in background - saves CPU/battery
    if (document.visibilityState === 'visible') {
      // FIX: If initial render is pending and data just arrived, reschedule to include new data
      if (this._renderScheduled && !this._hasRenderedOnce) {
        // Cancel pending empty render, schedule new one that will include this data
        if (this._renderTimeout) { clearTimeout(this._renderTimeout); this._renderTimeout = null; }
        if (this._renderFrame) { cancelAnimationFrame(this._renderFrame); this._renderFrame = null; }
        this._renderScheduled = false;
      }
      this._scheduleRender();
    }
    // visibilitychange handler will trigger render when tab becomes active
  }

  // Debounced render scheduling - batches multiple updates into one frame
  _scheduleRender(){
    if (this._renderScheduled) return;
    this._renderScheduled = true;

    // First render: no debounce - render immediately to avoid empty initial state
    if (!this._hasRenderedOnce) {
      this._renderFrame = requestAnimationFrame(() => this._doRender());
      return;
    }

    const now = performance.now();
    const elapsed = now - this._lastRenderTime;

    if (elapsed >= RENDER_DEBOUNCE_MS) {
      // Enough time passed, render on next frame
      this._renderFrame = requestAnimationFrame(() => this._doRender());
    } else {
      // Throttle: wait for remaining time
      this._renderTimeout = setTimeout(() => {
        this._renderTimeout = null;
        this._renderFrame = requestAnimationFrame(() => this._doRender());
      }, RENDER_DEBOUNCE_MS - elapsed);
    }
  }

  _doRender(){
    this._renderScheduled = false;
    this._lastRenderTime = performance.now();
    // Only render if data actually changed
    if (!this._dirty) return;
    this._dirty = false;
    this._render();
    this._hasRenderedOnce = true; // Track successful render
  }

  // API methods - only mark dirty if value actually changed
  setVoltage(arr){ this._setArray('voltage', arr); }
  setHistoryMaxVoltage(arr){ this._setArray('histMax', arr); }
  setHistoryMinVoltage(arr){ this._setArray('histMin', arr); }
  setChartMaxVoltage(v){ const n = Number(v)||this._chart.vMax; if (this._chart.vMax !== n) { this._chart.vMax = n; this._markDirty(); } }
  setChartMinVoltage(v){ const n = Number(v)||this._chart.vMin; if (this._chart.vMin !== n) { this._chart.vMin = n; this._markDirty(); } }
  setTemperature(arr){ this._setArray('temp', arr); }
  setChartMaxTemperature(v){ const n = Number(v)||this._chart.tMax; if (this._chart.tMax !== n) { this._chart.tMax = n; this._markDirty(); } }
  setChartMinTemperature(v){ const n = Number(v)||this._chart.tMin; if (this._chart.tMin !== n) { this._chart.tMin = n; this._markDirty(); } }
  setCellBallancing(arr){ const newArr = Array.isArray(arr)?arr:[]; if (!this._arraysEqual(this._balancing, newArr)) { this._balancing = newArr; this._markDirty(); } }
  setShowGrayCaps(v){ const newV = v !== false; if (this._showGrayCaps !== newV) { this._showGrayCaps = newV; this._markDirty(); } }
  setDisplayUnit(u){ const newU = u === 'V' ? 'V' : 'mV'; if (this._displayUnit !== newU) { this._displayUnit = newU; this._markDirty(); } }
  setModuleView(mode){
    const newMode = (mode==='minimal')?'minimal':(mode==='none'?'none':'detailed');
    if (this._moduleView !== newMode) {
      this._moduleView = newMode;
      this._dom = null; // Force full rebuild on view change
      this._markDirty();
    }
  }
  setStateOfCharge(){} // not used on module level
  setStateOfHealth(){}
  setEfficiency(){}
  setBMUPower(){}
  setBMUVersion(){}
  setBMSVersion(){}

  showVoltage(){
    if (this._view !== 'voltage') {
      this._view = 'voltage';
      this._dom = null; // Force rebuild on view change
      this._markDirty();
    }
  }
  showTemperature(){
    if (this._view !== 'temperature') {
      this._view = 'temperature';
      this._dom = null; // Force rebuild on view change
      this._markDirty();
    }
  }
  showYAxisValues(){
    if (!this._yAxis) {
      this._yAxis = true;
      this._dom = null;
      this._markDirty();
    }
  }
  hideYAxisValues(){
    if (this._yAxis) {
      this._yAxis = false;
      this._dom = null;
      this._markDirty();
    }
  }

  set name(v){
    if (this._name !== v) {
      this._name = v;
      // Just update name element if DOM exists
      if (this._dom?.nameEl) {
        this._dom.nameEl.textContent = v || '';
      } else {
        this._scheduleRender();
      }
    }
  }
  get name(){ return this._name; }

  // Simple array comparison for change detection
  _arraysEqual(a, b){
    if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++){
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  _setArray(key, arr){
    const field = key === 'voltage' ? 'voltage' : key === 'histMax' ? 'histMax' : key === 'histMin' ? 'histMin' : key;
    if (!Array.isArray(arr)) return;
    const current = this['_'+field];
    // Check if data actually changed - convert to numbers for comparison
    const numArr = arr.map(v => Number(v));
    const numCurrent = current.map(v => Number(v));
    if (this._arraysEqual(numCurrent, numArr)) return;
    arr = numArr; // Use normalized numeric array
    // keep last values for animations
    if (field === 'voltage') this._last.voltage = this._voltage.slice();
    if (field === 'temp') this._last.temp = this._temp.slice();
    if (field === 'histMin') this._last.histMin = this._histMin.slice();
    if (field === 'histMax') this._last.histMax = this._histMax.slice();
    this['_'+field] = arr.slice();
    this._markDirty();
  }

  _getAxis(){
    if (this._view === 'temperature') return {min:this._chart.tMin, max:this._chart.tMax, unit:'°C'};
    const min = this._chart.vMin ?? Math.min(...this._histMin, ...this._voltage);
    const max = this._chart.vMax ?? Math.max(...this._histMax, ...this._voltage);
    const unit = this._displayUnit === 'V' ? 'V' : 'mV';
    return {min, max, unit};
  }

  _render(){
    const root = this.shadowRoot;
    if (!root) return;

    // No Data view
    if (this._moduleView === 'none'){
      if (!this._dom || this._dom.type !== 'none') {
        root.innerHTML = `<div class="battery-module nodata no-axis"><div class="module-name"></div></div>`;
        this._dom = { type: 'none', nameEl: root.querySelector('.module-name') };
      }
      this._dom.nameEl.textContent = this._name || '';
      return;
    }

    // Minimalistic view
    if (this._moduleView === 'minimal'){
      this._renderMinimal(root);
      return;
    }

    // Detailed view
    this._renderDetailed(root);
  }

  _renderMinimal(root){
    const vVals = this._voltage.filter(v=>Number.isFinite(Number(v))).map(Number);
    const tVals = this._temp.filter(v=>Number.isFinite(Number(v))).map(Number);
    const med = (arr)=>{ if (!arr.length) return 0; const a=[...arr].sort((a,b)=>a-b); const mid=Math.floor(a.length/2); return a.length%2?a[mid]:(a[mid-1]+a[mid])/2; };
    const vMed = med(vVals);
    const hmMed = med(this._histMin.filter(v=>Number.isFinite(Number(v))).map(Number));
    const hMMed = med(this._histMax.filter(v=>Number.isFinite(Number(v))).map(Number));
    const tMed = med(tVals);

    const toXV = (v)=>{ const min = this._chart.vMin, max = this._chart.vMax; if (!Number.isFinite(v)||max===min) return 0; const c=Math.min(max,Math.max(min,Number(v))); return (c-min)/(max-min)*100; };
    const toXT = (v)=>{ const min = this._chart.tMin, max = this._chart.tMax; if (!Number.isFinite(v)||max===min) return 0; const c=Math.min(max,Math.max(min,Number(v))); return (c-min)/(max-min)*100; };

    let fudgeDown = 0; { const delta = Math.max(0, vMed - hmMed); if (delta < 20) fudgeDown = 150; }
    const formatVal = (raw)=>{
      if (this._displayUnit === 'V') return `${(Number(raw)/1000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3})} V`;
      return `${Math.round(Number(raw))} mV`;
    };

    const startPct = toXV(hmMed - fudgeDown);
    const endPct = toXV(vMed);
    const widthPct = Math.max(0, endPct - startPct);
    const centerPct = startPct + widthPct/2;
    const hasBal = this._balancing?.some(b=>b===1||b===true);
    const balCount = (this._balancing||[]).filter(b=>b===1||b===true).length;

    // Build or update DOM
    if (!this._dom || this._dom.type !== 'minimal') {
      root.innerHTML = `
        <div class="battery-module minimal no-axis">
          <div class="mini">
            <div class="mini-row">
              <div class="mini-label">Voltage</div>
              <div class="hbar">
                <div class="hseg greencap" data-el="vBase"></div>
                <div class="hseg cur" data-el="vCur"></div>
                <div class="hseg max" data-el="vMax"></div>
                <div class="hnum" data-el="vNum" style="color:#fff;"></div>
              </div>
            </div>
            <div class="mini-row">
              <div class="mini-label">Temperature</div>
              <div class="hbar">
                <div class="hseg cur" data-el="tCur"></div>
                <div class="hnum" data-el="tNum" style="color:#fff;"></div>
              </div>
            </div>
            <div class="mini-row">
              <div class="mini-label">Cell Balancing</div>
              <div class="mini-stat" data-el="balStat"></div>
            </div>
          </div>
          <div class="module-name" data-el="name"></div>
        </div>
      `;
      this._dom = {
        type: 'minimal',
        vBase: root.querySelector('[data-el="vBase"]'),
        vCur: root.querySelector('[data-el="vCur"]'),
        vMax: root.querySelector('[data-el="vMax"]'),
        vNum: root.querySelector('[data-el="vNum"]'),
        tCur: root.querySelector('[data-el="tCur"]'),
        tNum: root.querySelector('[data-el="tNum"]'),
        balStat: root.querySelector('[data-el="balStat"]'),
        nameEl: root.querySelector('[data-el="name"]')
      };
    }

    // Patch values
    const d = this._dom;
    d.vBase.className = `hseg ${hasBal ? 'bluecap' : 'greencap'}`;
    d.vBase.style.cssText = `left:0;width:${Math.max(0,toXV(hmMed))}%;`;
    d.vCur.className = `hseg cur${hasBal ? ' bal' : ''}`;
    d.vCur.style.cssText = `left:${startPct}%;width:${widthPct}%;`;
    d.vMax.style.cssText = this._showGrayCaps ? `left:${endPct}%;width:${Math.max(0,toXV(hMMed)-endPct)}%;` : 'display:none;';
    d.vNum.style.left = `${centerPct}%`;
    d.vNum.textContent = formatVal(vMed);

    const tPct = Math.max(0, toXT(tMed));
    d.tCur.style.cssText = `left:0;width:${tPct}%;`;
    d.tNum.style.left = `${tPct/2}%`;
    d.tNum.textContent = `${Number(tMed).toLocaleString(undefined,{maximumFractionDigits:1})} °C`;

    d.balStat.textContent = balCount;
    d.nameEl.textContent = this._name || '';
  }

  _renderDetailed(root){
    const axis = this._getAxis();
    const isTemp = this._view === 'temperature';
    const values = isTemp ? this._temp : this._voltage;
    const len = values.length;
    const max = axis.max, min = axis.min;

    const toH = (v)=>{
      if (v===undefined || v===null || isNaN(v)) return 0;
      if (max===min) return 0;
      const clamped = Math.min(max, Math.max(min, Number(v)));
      return (clamped - min) / (max - min) * 100;
    };

    const formatVal = (raw)=>{
      if (isTemp) return `${Number(raw).toLocaleString(undefined,{maximumFractionDigits:1})} °C`;
      if (this._displayUnit === 'V') return `${(Number(raw)/1000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3})} V`;
      return `${Math.round(Number(raw))} mV`;
    };

    // Calculate fudge for voltage view
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

    // Check if we need a full rebuild
    const needsRebuild = !this._dom || this._dom.type !== 'detailed' ||
                         this._dom.cellCount !== len || this._dom.isTemp !== isTemp;

    if (needsRebuild) {
      this._buildDetailedDOM(root, len, isTemp, axis);
    }

    // Update values
    this._updateDetailedValues(values, len, isTemp, toH, formatVal, fudgeDown, min, max, axis);
  }

  _buildDetailedDOM(root, len, isTemp, axis){
    root.innerHTML = `
      <div class="battery-module ${this._yAxis ? '' : 'no-axis'}">
        <div class="axis" style="display:${this._yAxis?'block':'none'}"></div>
        <div class="chart">
          <div class="tooltip" style="display:none"></div>
          ${this._yAxis ? '<div class="grid-lines"></div>' : ''}
          <div class="cells"></div>
        </div>
        <div class="module-name"></div>
      </div>
    `;

    const axisEl = root.querySelector('.axis');
    const chart = root.querySelector('.chart');
    const cellsWrap = root.querySelector('.cells');
    const tooltip = root.querySelector('.tooltip');
    const gridLines = root.querySelector('.grid-lines');
    const nameEl = root.querySelector('.module-name');

    // Build grid lines
    if (gridLines && this._yAxis) {
      const steps = 5;
      for (let i=0;i<=steps;i++){
        const y = i/steps;
        const line = document.createElement('div');
        line.className = 'line';
        line.style.top = `${(1-y)*100}%`;
        gridLines.appendChild(line);
      }
    }

    // Build cells
    this._cellElements = [];
    for (let i=0;i<len;i++){
      const cell = document.createElement('div');
      cell.className = 'cell';

      // Create bar elements for voltage view
      if (!isTemp) {
        const bottomCap = document.createElement('div');
        bottomCap.className = 'bar greencap';
        bottomCap.dataset.role = 'bottomCap';
        cell.appendChild(bottomCap);

        const maxCap = document.createElement('div');
        maxCap.className = 'bar max';
        maxCap.dataset.role = 'maxCap';
        cell.appendChild(maxCap);
      }

      const cur = document.createElement('div');
      cur.className = 'bar cur';
      cur.dataset.role = 'cur';
      cell.appendChild(cur);

      cellsWrap.appendChild(cell);
      this._cellElements.push({
        cell,
        cur,
        bottomCap: cell.querySelector('[data-role="bottomCap"]'),
        maxCap: cell.querySelector('[data-role="maxCap"]')
      });
    }

    // Setup tooltip interactions
    this._setupTooltipEvents(chart, tooltip, len);

    // Render axis
    if (this._yAxis) this._renderAxis(axisEl, axis);

    this._dom = {
      type: 'detailed',
      cellCount: len,
      isTemp,
      axisEl,
      chart,
      cellsWrap,
      tooltip,
      nameEl
    };
  }

  _setupTooltipEvents(chart, tooltip, len){
    const isTemp = this._view === 'temperature';

    const formatVal = (raw)=>{
      if (isTemp) return `${Number(raw).toLocaleString(undefined,{maximumFractionDigits:1})} °C`;
      if (this._displayUnit === 'V') return `${(Number(raw)/1000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3})} V`;
      return `${Math.round(Number(raw))} mV`;
    };

    const hide = ()=>{ if (!tooltip._sticky) tooltip.style.display='none'; };
    const clamp = (v, min, max)=> Math.max(min, Math.min(max, v));

    // Store handlers for cleanup in disconnectedCallback
    this._chartEventHandlers = {
      pointermove: (ev)=>{
        const rect = chart.getBoundingClientRect();
        const inner = rect.width - 12;
        const rel = clamp(((ev.clientX - rect.left) - 6) / (inner || 1), 0, 1);
        const idx = clamp(Math.floor(rel * len), 0, len-1);
        const vals = this._view === 'temperature' ? this._temp : this._voltage;
        const val = vals[idx];

        tooltip.style.display = 'block';
        tooltip.textContent = formatVal(val);
        const tipW = tooltip.offsetWidth || 50;
        const tipH = tooltip.offsetHeight || 20;
        let x = ev.clientX - rect.left + 10;
        let y = ev.clientY - rect.top - 10 - tipH;
        x = clamp(x, 6, rect.width - tipW - 6);
        y = clamp(y, 6, rect.height - tipH - 6);
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        this._tip.x = x; this._tip.y = y; this._tip.text = formatVal(val);
      },
      pointerleave: hide,
      pointerdown: (ev)=>{
        tooltip.style.display = 'block';
        tooltip._sticky = true;
        this._tip.showUntil = Date.now() + 3000;
        if (this._tooltipTimer) clearTimeout(this._tooltipTimer);
        this._tooltipTimer = setTimeout(()=>{ tooltip._sticky = false; this._tip.showUntil = 0; hide(); }, 3000);
      }
    };

    chart.addEventListener('pointermove', this._chartEventHandlers.pointermove);
    chart.addEventListener('pointerleave', this._chartEventHandlers.pointerleave);
    chart.addEventListener('pointerdown', this._chartEventHandlers.pointerdown);
  }

  _updateDetailedValues(values, len, isTemp, toH, formatVal, fudgeDown, min, max, axis){
    if (!this._dom || !this._cellElements.length) return;

    const d = this._dom;
    d.nameEl.textContent = this._name || '';

    for (let i=0;i<len;i++){
      const v = Number(values[i]);
      const el = this._cellElements[i];
      if (!el) continue;

      let vMin = min, vMax = max;

      if (!isTemp){
        const hm = Number(this._histMin[i]);
        const hM = Number(this._histMax[i]);
        if (Number.isFinite(hm)) vMin = hm;
        if (Number.isFinite(hM)) vMax = hM;

        // Update bottom cap
        if (el.bottomCap) {
          const isBal = this._balancing && (this._balancing[i]===true || this._balancing[i]===1);
          el.bottomCap.className = 'bar ' + (isBal ? 'bluecap' : 'greencap');
          if (Number.isFinite(vMin) && vMin > min){
            el.bottomCap.style.height = toH(vMin) + '%';
            el.bottomCap.style.display = '';
          } else {
            el.bottomCap.style.display = 'none';
          }
        }

        // Update max cap
        if (el.maxCap) {
          const hCurLocal = toH(v);
          if (this._showGrayCaps && Number.isFinite(vMax)){
            const hCellMax = toH(vMax);
            const postH = Math.max(0, hCellMax - hCurLocal);
            if (postH > 0){
              el.maxCap.style.bottom = hCurLocal + '%';
              el.maxCap.style.height = postH + '%';
              el.maxCap.style.display = '';
            } else {
              el.maxCap.style.display = 'none';
            }
          } else {
            el.maxCap.style.display = 'none';
          }
        }

        // Balancing class
        const isBal = this._balancing && (this._balancing[i]===true || this._balancing[i]===1);
        el.cell.classList.toggle('balancing', isBal);
      }

      // Update current bar
      const hCur = toH(v);
      const hMin = toH(vMin - fudgeDown);
      const heightPct = Math.max(0, hCur - hMin);

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
          prevBottom = 0;
          prevHeight = Math.max(0, toH(Number(last)));
        }
        el.cur.style.transition = 'none';
        el.cur.style.bottom = prevBottom + '%';
        el.cur.style.height = prevHeight + '%';
        requestAnimationFrame(()=>{
          el.cur.style.transition = 'height .6s ease, bottom .6s ease';
          el.cur.style.bottom = hMin + '%';
          el.cur.style.height = heightPct + '%';
        });
      } else {
        el.cur.style.bottom = hMin + '%';
        el.cur.style.height = heightPct + '%';
      }
    }

    // Restore sticky tooltip
    if (this._tip?.showUntil && Date.now() < this._tip.showUntil && d.tooltip){
      d.tooltip.style.display = 'block';
      d.tooltip.textContent = this._tip.text || '';
      const rect = d.chart.getBoundingClientRect();
      const tipW = d.tooltip.offsetWidth || 50;
      const tipH = d.tooltip.offsetHeight || 20;
      let x = this._tip.x, y = this._tip.y;
      x = Math.max(6, Math.min(x, rect.width - tipW - 6));
      y = Math.max(6, Math.min(y, rect.height - tipH - 6));
      d.tooltip.style.left = `${x}px`;
      d.tooltip.style.top = `${y}px`;
      d.tooltip._sticky = true;
    }
  }

  _renderAxis(el, axis){
    el.innerHTML = '';
    const steps = 5;
    for (let i=0; i<=steps; i++){
      const y = i/steps;
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
