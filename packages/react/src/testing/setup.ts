// Registers a DOM (window, document, ...) as globals before any React import,
// so @testing-library/react can render into it under the `node --test` runner.
// A tsx loader handles the provider's JSX; this file is preloaded via
// `node --import tsx --import ./src/testing/setup.ts --test`.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, mock } from "node:test";
import { cleanup } from "@testing-library/react";

GlobalRegistrator.register();

afterEach(() => {
  // Unmount anything a test rendered so trees, effects, and pending timers do
  // not leak across cases sharing the one registered DOM.
  cleanup();
  // Restore real timers even if a test that faked them threw before resetting.
  mock.timers.reset();
});
