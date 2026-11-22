// tests/e2e-live-melek-ai.cjs
// CommonJS wrapper delegating to canonical e2e-live-melek-ai.mjs

import("./e2e-live-melek-ai.mjs").catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
