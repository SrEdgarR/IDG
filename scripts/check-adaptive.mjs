import assert from 'node:assert/strict';
import {startSegments, expectedHash} from '../fixtures/http/segments.mjs';

export async function checkAdaptive({probe, directory, traces, repetitions = 3}) {
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    for (const condition of ['per-request', 'shared']) {
      const rate = 4 * 1024 * 1024;
      const size = (condition === 'per-request' ? 64 : 32) * 1024 * 1024;
      const fixture = await startSegments({size, rate, condition,
        minimumTimerMs: condition === 'shared' ? 16 : 0});
      const id = `adaptive-${condition}-${repetition}`;
      const traceStart = traces.length;
      const samples = [];
      let done;
      try {
        await probe(['add-segmented', id], {
          input: {url: fixture.url + '/file', directory, name: id + '.bin',
            expected_sha256: expectedHash(size), conflict: 'reject'},
          options: {mode: 'automatic', replay_safe: true},
        });
        const deadline = performance.now() + 60000;
        while (performance.now() < deadline) {
          const started = performance.now();
          const {job} = await probe(['status', id]);
          samples.push({at: performance.now(), probe_ms: performance.now() - started,
            target: job.target_requests, active: job.active_requests, received: job.received_bytes});
          if (['completed', 'failed'].includes(job.state)) { done = job; break; }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const decisions = traces.slice(traceStart);
        // Diagnostics are emitted even on an assertion failure, without URL/path/ID.
        console.log('ADAPTIVE_HTTP ' + JSON.stringify({condition, repetition,
          probe_count: samples.length,
          probe_max_ms: Math.max(...samples.map(x => x.probe_ms)),
          snapshot_targets: samples.map(x => x.target), decisions, server: fixture.measurements}));
        assert.equal(done?.state, 'completed', JSON.stringify(done));
        assert.equal(done.verified_against_reference, true);
        assert.equal(done.received_bytes, String(size));
        assert.equal(done.ranges_durable, done.ranges_total);
        const trial = decisions.findIndex(x => x.decision === 'trial');
        assert.ok(trial >= 0, 'automatic measured trial');
        const wanted = condition === 'per-request' ? 'retain' : 'reject';
        const decision = decisions.slice(trial + 1).find(x => x.decision === wanted);
        assert.ok(decision, condition === 'shared'
          ? 'reject shared-bottleneck trial' : 'retain sustained measured improvement');
        const matchingTrial = decisions.slice(0, decisions.indexOf(decision))
          .findLast(x => x.decision === 'trial');
        assert.equal(decision.reference, matchingTrial.rate,
          'evaluate against the useful throughput measured when starting this trial');
        assert.ok(decision.total - decision.received >= 2 * 1024 * 1024,
          'observe the decision before the file tail can lower throughput');
        if (condition === 'shared') {
          assert.ok(decision.target < decision.before);
          const windows = fixture.measurements.slice(1);
          assert.ok(windows.length >= 3);
          for (const window of windows) {
            assert.ok(window.rate >= rate * 0.9, 'fixture must actually saturate shared budget');
            assert.ok(window.rate <= rate + 262144 * 1000 / window.window_ms,
              'fixture must bound shared credit');
          }
          assert.equal(decisions.filter(x => x.decision === 'retain').length, 0,
            'never retain a trial without sustained benefit in shared fixture');
        } else {
          assert.ok(decision.rate >= decision.reference * 1.1);
          const previous = decisions[decisions.indexOf(decision) - 1];
          assert.equal(previous.decision, 'trial_window');
          assert.ok(previous.rate >= decision.reference * 1.1);
        }
        console.log(`PASS automático HTTP: ${condition}, repetición ${repetition}, ${wanted}`);
      } finally {
        await fixture.close();
      }
    }
  }
}
