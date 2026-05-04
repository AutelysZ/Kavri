import { polyfill } from './polyfill.js';

export type * from './types.js';
export * from './env';
export * from './polyfill.js';

polyfill();
