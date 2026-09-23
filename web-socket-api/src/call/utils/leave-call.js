import {shutDownServer} from './ws-server.js';
import {wss} from './session-store.js';

// Shared by the leaveCall HTTP endpoint and logout's active-call cleanup:
// detaches `user` from `call`, finalising and tearing down the call's
// WebSocket server if they were its last active participant.
export async function removeUserFromCall(call, user) {
	// `status` lives on the CallParticipants join table, not on User — so it
	// has to be filtered via `through`, or MySQL rejects `user.status`.
	const activeUserCount = await call.countUsers({
		through: {where: {status: 'active'}},
	});

	if (activeUserCount > 1) {
		await call.removeUser(user);
		return;
	}

	const callFinishTime = Date.now();
	const callStartTime = call.startedAt;
	const callDurationSecs = callStartTime
		? (callFinishTime - callStartTime) / 1000
		: 0;

	await call.update({
		activeCall: false,
		totalDurationSecs: callDurationSecs,
		finishedAt: callFinishTime,
	});
	await call.removeUser(user);

	const isShutDownSuccess = await shutDownServer(call.callID);
	if (isShutDownSuccess) {
		wss.delete(call.callID);
	} else {
		console.error('Error shutting down requested ws server');
	}
}
