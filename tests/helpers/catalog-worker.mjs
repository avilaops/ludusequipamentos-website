import { catalogWorkerBundle } from '../../scripts/build-catalog-worker.mjs';

export const workerScript = await catalogWorkerBundle();
