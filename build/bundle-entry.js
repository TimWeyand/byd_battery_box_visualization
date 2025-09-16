// Build entry for bundling a single-file Lovelace plugin for HACS
// - Inlines shared CSS into window.__BYD_CSS_TEXT so components adopt it
// - Then imports/registers the actual HA card implementation
import cssText from '../styles/battery.css';
if (typeof window !== 'undefined') {
  window.__BYD_CSS_TEXT = cssText;
}
import '../ha/byd-battery-box-visualization.js';
