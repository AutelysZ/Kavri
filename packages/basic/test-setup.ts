// Global test setup — runs before any test file is imported. Installs the
// `Map.prototype.getOrInsertComputed` (etc.) polyfill that `Metadata.ts`
// depends on, so per-file tests don't have to import `./index.ts` (which is
// where production code triggers `polyfill()`).
import { polyfill } from '@kavri/env';

polyfill();
