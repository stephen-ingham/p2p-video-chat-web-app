// Lives in unit/ rather than directly in web-server/tests/ — a file sitting
// beside tests/tsconfig.json itself doesn't get associated by
// typescript-eslint's project service in this repo; nested ones resolve fine.

// The `/vitest` subpath's own internal `import 'vitest'` doesn't resolve
// from web-server/tests/node_modules (a sibling of, not nested under,
// web-server/src/node_modules where vitest itself lives) — the standalone
// matchers avoid that by not importing vitest themselves; we extend the
// running vitest's own `expect` (which resolves fine here, same as it does
// in every test file) instead.
import * as matchers from '@testing-library/jest-dom/matchers';
import {expect} from 'vitest';

expect.extend(matchers);
