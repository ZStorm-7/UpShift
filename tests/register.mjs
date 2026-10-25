// Test-only: lets `node --test` resolve the app's extensionless relative imports
// ('./timeline') to their .ts files, the way Metro and TypeScript do. The app
// source stays free of file extensions.
import { register } from 'node:module';
register('./resolve-ts-hooks.mjs', import.meta.url);
