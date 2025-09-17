// Build entry for bundling a single-file Lovelace plugin for HACS
// - Inlines shared CSS into window.__BYD_CSS_TEXT so components adopt it
// - Then imports/registers the actual HA card implementation
import cssText from '../styles/battery.css';
// Expose shared CSS text globally for components to adopt without fetching at runtime
if (typeof globalThis !== 'undefined') {
  globalThis.__BYD_CSS_TEXT = cssText;
} else if (typeof window !== 'undefined') {
  // Fallback for very old environments
  window.__BYD_CSS_TEXT = cssText;
}
import '../ha/byd-battery-box-visualization.js';
