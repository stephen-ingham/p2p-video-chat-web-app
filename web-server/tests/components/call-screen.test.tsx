/* eslint-disable @typescript-eslint/naming-convention -- callID/callURL mirror the real HTTP response shape, not variable names */
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import CallScreen from '@/components/call-screen.tsx';

const createCall = vi.fn();
const joinCall = vi.fn();
const leaveCall = vi.fn();
const logout = vi.fn();

vi.mock('@/lib/use-token-worker.ts', () => ({
	useTokenWorker: () => ({createCall, joinCall, leaveCall, logout}),
}));

const connectToCall = vi.fn();
const sendChatMessageToCall = vi.fn();
const closeConns = vi.fn();
const closeWebSocketServerConn = vi.fn();

// Rtc-utils.ts drives real WebRTC/getUserMedia/WebSocket — none of which
// jsdom implements. Mocked entirely; these tests assert CallScreen wires
// its callbacks/refs correctly, not that WebRTC itself works (that's
// e2e/call.spec.ts and chat.spec.ts, against real browsers).
vi.mock('@/lib/rtc-utils.ts', () => ({
	async connectToCall(...arguments_: unknown[]): Promise<void> {
		await connectToCall(...arguments_);
	},
	sendChatMessageToCall(...arguments_: unknown[]): void {
		sendChatMessageToCall(...arguments_);
	},
	async closeConns(...arguments_: unknown[]): Promise<void> {
		await closeConns(...arguments_);
	},
	async closeWebSocketServerConn(...arguments_: unknown[]): Promise<void> {
		await closeWebSocketServerConn(...arguments_);
	},
}));

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- jsdom has no MediaStream; only object identity matters to these tests
const fakeLocalStream = {id: 'local'} as unknown as MediaStream;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
const fakeRemoteStream = {id: 'remote'} as unknown as MediaStream;

function renderCallScreen() {
	return render(
		<CallScreen
			email="alice@example.com"
			username="alice"
			onLogout={vi.fn<() => void>()}
		/>,
	);
}

beforeEach(() => {
	createCall.mockReset();
	joinCall.mockReset();
	leaveCall.mockReset();
	connectToCall.mockReset();
	closeConns.mockReset();
	closeWebSocketServerConn.mockReset();
});

describe('CallScreen — create call', () => {
	it('attaches local media to the local video element', async () => {
		createCall.mockResolvedValueOnce({
			callID: 'call-1',
			callURL: 'wss://example/call-1',
		});
		connectToCall.mockImplementationOnce(
			async (
				_url: string,
				_callId: string,
				_email: string,
				_username: string,
				// eslint-disable-next-line @typescript-eslint/no-restricted-types -- matches connectToCall's real signature (React DOM refs are null-based)
				localVideoRef: React.RefObject<HTMLVideoElement | null>,
			) => {
				if (localVideoRef.current)
					localVideoRef.current.srcObject = fakeLocalStream;
			},
		);
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));

		await waitFor(() => {
			expect(screen.getByTestId('local-video').srcObject).toBe(fakeLocalStream);
		});
		expect(screen.getByTestId('call-id')).toHaveTextContent('call-1');
	});
});

describe('CallScreen — join call', () => {
	it('keeps join disabled and shows an error for a malformed call ID', async () => {
		const user = userEvent.setup();
		renderCallScreen();

		expect(screen.getByTestId('join-call-button')).toBeDisabled();

		await user.type(screen.getByTestId('join-call-input'), 'not-a-uuid');

		expect(screen.getByTestId('join-call-input-error')).toHaveTextContent(
			'Enter a valid call ID (UUID format).',
		);
		expect(screen.getByTestId('join-call-button')).toBeDisabled();
		expect(joinCall).not.toHaveBeenCalled();
	});

	it('enables join for a valid UUID and renders a remote participant on success', async () => {
		const validCallId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
		joinCall.mockResolvedValueOnce('wss://example/call-1');
		connectToCall.mockImplementationOnce(
			async (
				_url: string,
				_callId: string,
				_email: string,
				_username: string,
				_localVideoRef: unknown,
				_remoteVideoRefs: unknown,
				_addChatMessage: unknown,
				addParticipant: (name: string) => void,
				_removeParticipant: unknown,
				addRemoteVideo: (peerUser: string, stream: MediaStream) => void,
			) => {
				addParticipant('bob@example.com');
				addRemoteVideo('bob@example.com', fakeRemoteStream);
			},
		);
		const user = userEvent.setup();
		renderCallScreen();

		await user.type(screen.getByTestId('join-call-input'), validCallId);
		expect(
			screen.queryByTestId('join-call-input-error'),
		).not.toBeInTheDocument();
		expect(screen.getByTestId('join-call-button')).toBeEnabled();

		await user.click(screen.getByTestId('join-call-button'));

		expect(joinCall).toHaveBeenCalledWith(validCallId);
		await waitFor(() => {
			expect(screen.getByTestId('remote-video-bob@example.com').srcObject).toBe(
				fakeRemoteStream,
			);
		});
	});
});

describe('CallScreen — leave call', () => {
	it('clears call state and shows the controls bar again on hang up', async () => {
		const validCallId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
		joinCall.mockResolvedValueOnce('wss://example/call-1');
		leaveCall.mockResolvedValueOnce('User left call succesfully');
		const user = userEvent.setup();
		renderCallScreen();

		await user.type(screen.getByTestId('join-call-input'), validCallId);
		await user.click(screen.getByTestId('join-call-button'));
		expect(await screen.findByTestId('hang-up-button')).toBeInTheDocument();

		await user.click(screen.getByTestId('hang-up-button'));

		expect(leaveCall).toHaveBeenCalledWith(validCallId);
		expect(closeConns).toHaveBeenCalled();
		expect(closeWebSocketServerConn).toHaveBeenCalledWith(validCallId);
		expect(await screen.findByTestId('create-call-button')).toBeInTheDocument();
		expect(screen.queryByTestId('call-id')).not.toBeInTheDocument();
	});
});
