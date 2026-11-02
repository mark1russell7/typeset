import { defineCase, type CaseModule } from "../case.ts";

/** Small cases for the tests of the harness. They do not measure anything of typeset. */
export const cases: CaseModule = {
  "fixture.sum": defineCase({
    setup: () => Array.from({ length: 100 }, (_, i) => i),
    run: (values) => values.reduce((s, v) => s + v, 0),
  }),
  "fixture.join": defineCase({
    setup: () => ["a", "b", "c"],
    run: (parts) => parts.join("-"),
  }),
};
