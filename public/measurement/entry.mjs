import { installMeasurement } from './runtime.mjs';
const response = await fetch(new URL('./sites.json', import.meta.url), { credentials: 'omit' });
if (response.ok) installMeasurement(await response.json());
