// Build script using esbuild to generate a single-file bundle for HACS
import { build } from 'esbuild';

const banner = `/* BYD Battery Box Visualization v0.0.3 - bundled single file for HACS */`;

async function run(){
  try{
    await build({
      entryPoints: ['build/bundle-entry.js'],
      outfile: 'byd-battery-box-visualization.js',
      bundle: true,
      format: 'esm',
      minify: true,
      sourcemap: false,
      loader: { '.css': 'text' },
      banner: { js: banner },
      logLevel: 'info',
    });
    console.log('Built byd-battery-box-visualization.js');
  }catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
