import {runSnapshotTest} from './snapshot.js';

// Prod's settings, so the snapshot also covers the coturn VM resources and
// the Google-managed certificate.
await runSnapshotTest('prod', {
	'voneo-video-chat:domain': 'snapshot.example.com',
	'voneo-video-chat:turnEnabled': 'true',
	'voneo-video-chat:turnSecret': 'snapshot-test-turn-secret',
});
