import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // The build scripts' tests run under `@vitest-environment node`, which has no storage.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
