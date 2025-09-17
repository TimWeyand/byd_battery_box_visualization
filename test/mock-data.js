// Randomized mock data generator for standalone test page
export function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function genModuleVoltages(cells=32){
  // Around 3300–3360 mV with some spread
  return Array.from({length:cells}, ()=> randInt(3300, 3360));
}
function genModuleTemps(sensors=16){
  return Array.from({length:sensors}, ()=> randInt(18, 35));
}
function genModuleBalancing(cells=32){
  return Array.from({length:cells}, ()=> Math.random()<0.07 ? 1 : 0);
}

function deriveHistMax(vArr){ return vArr.map(v=> v + randInt(20, 60)); }
function deriveHistMin(vArr){ return vArr.map(v=> v - randInt(60, 100)); }

// Simulated total capacity for the entire battery stack (Wh)
export const totalCapacityWh = 38400; // 12.8 kWh typical demo value

export function createTower(id, modules=5, cells=32){
  const voltage = [];
  const temps = [];
  const balancing = [];
  for (let m=1; m<=modules; m++){
    const v = genModuleVoltages(cells);
    voltage.push({ m, v });
    temps.push({ m, t: genModuleTemps(Math.floor(cells/2)) });
    balancing.push({ m, b: genModuleBalancing(cells) });
  }

  const histMax = voltage.map(x=>({ m: x.m, v: deriveHistMax(x.v) }));
  const histMin = voltage.map(x=>( { m: x.m, v: deriveHistMin(x.v) } ));
  // Chart around common realistic range
  const chart = { vMin: 3200, vMax: 3500 };
  const soc = randInt(60, 85);
  const soh = randInt(96, 100);
  // Demo model naming
  const model = id % 2 === 0 ? 'HVM' : 'HVS';
  return { id, modules, voltage, histMax, histMin, temps, balancing, soc, soh, chart, bmsVersion: `1.${id-1}`, model };
}

export function createBMU(){ return { power: randInt(-2000, 2000), version: '2.0', totalCapacityWh, model: 'HVS' } ;}

export const tower1 = createTower(1, 5, 32);
export const tower2 = createTower(2, 5, 32);
export const tower3 = createTower(3, 5, 32);

export const bmu = createBMU();
