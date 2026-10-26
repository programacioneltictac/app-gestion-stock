const test = require("node:test");
const assert = require("node:assert/strict");
const { runExclusive, isSyncRunning, getSyncRunStatus } = require("../utils/syncLock");

test("runExclusive rechaza una segunda corrida mientras la primera sigue", async () => {
  let release;
  const first = runExclusive("primera", () => new Promise((r) => (release = r)));
  assert.equal(isSyncRunning(), true);
  assert.equal(getSyncRunStatus().label, "primera");

  const second = await runExclusive("segunda", () => "no deberia correr");
  assert.equal(second.busy, true);
  assert.equal(second.status.label, "primera");

  release("ok");
  assert.deepEqual(await first, { busy: false, result: "ok" });
  assert.equal(isSyncRunning(), false);
});

test("runExclusive libera el lock aunque la corrida falle", async () => {
  await assert.rejects(runExclusive("falla", async () => { throw new Error("boom"); }), /boom/);
  assert.equal(isSyncRunning(), false);
  assert.deepEqual(getSyncRunStatus(), { running: false });
});
