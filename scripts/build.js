// Build script using esbuild to generate a single-file bundle for HACS
import { build } from 'esbuild';
import { readFileSync } from 'fs';

const uiBanner = `/* BYD Battery Box Visualization v0.0.5 - bundled single file for HACS */`;

// Read and minify shared CSS once, then inline at top of bundle
let cssText = '';
try { cssText = readFileSync('styles/battery.css', 'utf8'); } catch {}
// Very small CSS minifier: remove comments and collapse whitespace
if (cssText) {
  cssText = cssText
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .replace(/\s*{\s*/g, '{')            // trim around {
    .replace(/\s*}\s*/g, '}')            // trim around }
    .replace(/\s*;\s*/g, ';')            // trim around ;
    .replace(/\s*:\s*/g, ':')            // trim around :
    .replace(/;}/g, '}')                   // drop trailing semicolons
    .trim();
}
const cssLiteral = JSON.stringify(cssText);
const banner = `${uiBanner}\ntry{(globalThis||window).__BYD_CSS_TEXT=${cssLiteral};}catch(_){}\n`;

async function run(){
  try{
    await build({
      entryPoints: ['build/bundle-entry.js'],
      outfile: 'byd-battery-box-visualization.js',
      bundle: true,
      format: 'esm',
      platform: 'browser',
      minify: true,
      sourcemap: false,
      loader: { '.css': 'text' },
      banner: { js: banner },
      legalComments: 'none',
      drop: ['console','debugger'],
      logLevel: 'info',
    });
    console.log('Built byd-battery-box-visualization.js');
  }catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
