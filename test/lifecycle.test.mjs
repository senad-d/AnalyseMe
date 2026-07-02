import assert from "node:assert/strict";
import test from "node:test";

import { EXTENSION_STATUS_KEY } from "../src/constants.ts";
import { registerAnalyseMeLifecycle } from "../src/events/lifecycle.ts";

test("AnalyseMe lifecycle clears UI status only when UI is available", async () => {
  const handlers = {};
  const statusCalls = [];
  const fakePi = {
    on: (event, handler) => {
      handlers[event] = handler;
    },
  };
  const ctxWithUi = {
    hasUI: true,
    ui: {
      setStatus: (key, value) => statusCalls.push({ key, value }),
    },
  };
  const ctxWithoutUi = {
    hasUI: false,
    ui: {
      setStatus: (key, value) => statusCalls.push({ key, value }),
    },
  };

  registerAnalyseMeLifecycle(fakePi);

  await handlers.session_start({ type: "session_start", reason: "startup" }, ctxWithUi);
  await handlers.session_shutdown({ type: "session_shutdown", reason: "quit" }, ctxWithUi);
  await handlers.session_start({ type: "session_start", reason: "startup" }, ctxWithoutUi);

  assert.deepEqual(statusCalls, [
    { key: EXTENSION_STATUS_KEY, value: undefined },
    { key: EXTENSION_STATUS_KEY, value: undefined },
  ]);
});
