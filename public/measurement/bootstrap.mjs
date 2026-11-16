import { installMeasurement } from './runtime.mjs';

/** Repeatable after a failed fetch • importing this module has no side effects. */
export async function startMeasurement(options = {}) {
  if (window.__avilaMeasurement) return window.__avilaMeasurement;
  const response = await fetch(new URL('./sites.json', import.meta.url), { credentials: 'omit' });
  if (!response.ok) throw new Error('Measurement configuration unavailable: ' + response.status);
  return installMeasurement(await response.json(), options);
}
