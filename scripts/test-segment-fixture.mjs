import assert from 'node:assert/strict';
import {startSegments, expectedHash} from '../fixtures/http/segments.mjs';
import {createHash} from 'node:crypto';

// Deliberately delayed timers reproduce the old sharedDue defect without
// changing Windows timer resolution or assuming anything about the CI host.
for (const clients of [2, 3]) {
  const size = 8 * 1024 * 1024;
  const rate = 4 * 1024 * 1024;
  const fixture = await startSegments({size, rate, condition: 'shared', minimumTimerMs: 16});
  const started = performance.now();
  try {
    await Promise.all(Array.from({length: clients}, async () => {
      const response = await fetch(fixture.url + '/file', {signal: AbortSignal.timeout(15000)});
      const body = Buffer.from(await response.arrayBuffer());
      assert.equal(body.length, size);
      assert.equal(createHash('sha256').update(body).digest('hex'), expectedHash(size));
    }));
    const elapsed = (performance.now() - started) / 1000;
    const throughput = clients * size / elapsed;
    console.log(JSON.stringify({fixture: 'shared-credit', clients, minimum_timer_ms: 16,
      elapsed_s: elapsed, useful_bytes: clients * size, rate: throughput, windows: fixture.measurements}));
    assert.ok(throughput >= rate * 0.90, 'shared fixture must saturate its budget with delayed timers');
    assert.ok(throughput <= rate * 1.05, 'shared fixture must respect its aggregate budget');
    for (const window of fixture.measurements.slice(1)) {
      assert.ok(window.rate <= rate + 262144 * 1000 / window.window_ms, 'bounded catch-up credit');
    }
  } finally {
    await fixture.close();
  }
}
