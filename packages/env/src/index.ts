import { polyfill } from './polyfill.js';

export type * from './types.js';
export * from './polyfill.js';
export * from './env';

polyfill();
