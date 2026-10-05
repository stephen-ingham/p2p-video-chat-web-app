/* eslint-disable @typescript-eslint/naming-convention -- callID mirrors the real HTTP response shape, not variable names */
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import CallScreen from '@/components/call-screen.tsx';

const createCall = vi.fn();
const joinCall = vi.fn();
const leaveCall = vi.fn();
const logout = vi.fn();
const getIceServers = vi.fn();

vi.mock('@/lib/use-token-worker.ts', () => ({
	useTokenWorker: () => ({
		createCall,
		joinCall,
		leaveCall,
		logout,
		getIceServers,
	}),
}));

const connectToCall = vi.fn();
const sendChatMessageToCall = vi.fn();
const closeConns = vi.fn();
const closeWebSocketServerConn = vi.fn();
const setLocalTrackEnabled = vi.fn();
const startLocalMedia = vi.fn();
const stopLocalMedia = vi.fn();
const getLocalStream = vi.fn();

// Rtc-utils.ts drives real WebRTC/getUserMedia/WebSocket — none of which
// jsdom implements. Mocked entirely; these tests assert CallScreen wires
// its callbacks/refs correctly, not that WebRTC itself works (that's
// e2e/chromium/call.spec.ts and chat.spec.ts, against real browsers).
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
	async setLocalTrackEnabled(...arguments_: unknown[]): Promise<void> {
		await setLocalTrackEnabled(...arguments_);
	},
	async getLocalStream(): Promise<unknown> {
		return getLocalStream();
	},
	async startLocalMedia(): Promise<unknown> {
		return startLocalMedia();
	},
	async stopLocalMedia(): Promise<void> {
		await stopLocalMedia();
	},
}));

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- jsdom has no MediaStream; only object identity matters to these tests
const fakeLocalStream = {id: 'local'} as unknown as MediaStream;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
const fakePreviewStream = {id: 'preview'} as unknown as MediaStream;
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
	getIceServers.mockReset();
	closeConns.mockReset();
	closeWebSocketServerConn.mockReset();
	setLocalTrackEnabled.mockReset();
	startLocalMedia.mockReset();
	startLocalMedia.mockResolvedValue(fakePreviewStream);
	stopLocalMedia.mockReset();
	getLocalStream.mockReset();
});

describe('CallScreen — lobby', () => {
	it('previews the camera, with no chat before a call', async () => {
		renderCallScreen();

		await waitFor(() => {
			expect(screen.getByTestId('local-video').srcObject).toBe(
				fakePreviewStream,
			);
		});
		expect(
			screen.getByText('Check your camera and mic before you join'),
		).toBeInTheDocument();
		expect(screen.queryByTestId('chat-message-input')).not.toBeInTheDocument();
		expect(screen.queryByTestId('participants')).not.toBeInTheDocument();
	});

	it('carries mic and camera choices made in the lobby into the call', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('lobby-mic-toggle'));
		await user.click(screen.getByTestId('lobby-camera-toggle'));
		setLocalTrackEnabled.mockClear();
		await user.click(screen.getByTestId('create-call-button'));

		expect(await screen.findByTestId('mic-toggle')).toHaveAttribute(
			'aria-checked',
			'false',
		);
		expect(screen.getByTestId('camera-toggle')).toHaveAttribute(
			'aria-checked',
			'false',
		);
		// Re-applied once the call's stream exists.
		expect(setLocalTrackEnabled).toHaveBeenCalledWith('audio', false);
		expect(setLocalTrackEnabled).toHaveBeenCalledWith('video', false);
	});

	it("says so when the camera or mic can't be opened", async () => {
		startLocalMedia.mockRejectedValue(new Error('NotAllowedError'));
		renderCallScreen();

		expect(
			await screen.findByText(
				"Couldn't access your camera or mic. Check your browser's permissions.",
			),
		).toBeInTheDocument();
		expect(screen.getByTestId('create-call-button')).toBeEnabled();
	});

	it('releases the camera and mic on unmount (log out)', () => {
		const {unmount} = renderCallScreen();

		unmount();

		expect(stopLocalMedia).toHaveBeenCalledTimes(1);
	});
});

describe('CallScreen — create call', () => {
	it('shows the local stream in the in-call tile', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		// The in-call tile is a new <video>; it picks up the stream the lobby
		// (or connectToCall) already captured.
		getLocalStream.mockResolvedValue(fakeLocalStream);
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));

		await waitFor(() => {
			expect(screen.getByTestId('local-video').srcObject).toBe(fakeLocalStream);
		});
		expect(screen.getByTestId('call-id')).toHaveTextContent('call-1');
	});
});

describe('CallScreen — ICE servers', () => {
	// ConnectToCall's 12th parameter — the STUN/TURN config the peer
	// connections are created with.
	const iceServersArgumentIndex = 11;

	it('passes the ICE servers fetched from the API through to connectToCall', async () => {
		const iceServers = [
			{urls: ['stun:turn.example.com:3478']},
			{
				urls: ['turn:turn.example.com:3478?transport=udp'],
				username: '1700000000:alice@example.com',
				credential: 'hmac',
			},
		];
		getIceServers.mockResolvedValueOnce(iceServers);
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));

		await waitFor(() => {
			expect(connectToCall).toHaveBeenCalledTimes(1);
		});
		expect(connectToCall.mock.calls[0][iceServersArgumentIndex]).toEqual(
			iceServers,
		);
	});

	it("falls back to connectToCall's default ICE servers when the fetch fails", async () => {
		getIceServers.mockResolvedValueOnce('Get ICE servers failed');
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));

		await waitFor(() => {
			expect(connectToCall).toHaveBeenCalledTimes(1);
		});
		expect(
			connectToCall.mock.calls[0][iceServersArgumentIndex],
		).toBeUndefined();
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
		joinCall.mockResolvedValueOnce(validCallId);
		connectToCall.mockImplementationOnce(
			async (
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
		// ConnectToCall builds the WebSocket URL from the callID itself.
		await waitFor(() => {
			expect(connectToCall.mock.calls[0][0]).toBe(validCallId);
		});
		await waitFor(() => {
			expect(screen.getByTestId('remote-video-bob@example.com').srcObject).toBe(
				fakeRemoteStream,
			);
		});
	});
});

describe('CallScreen — participants', () => {
	it('lists a participant once when they are announced twice', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		connectToCall.mockImplementationOnce(
			async (
				_callId: string,
				_email: string,
				_username: string,
				_localVideoRef: unknown,
				_remoteVideoRefs: unknown,
				_addChatMessage: unknown,
				addParticipant: (name: string) => void,
			) => {
				addParticipant('bob@example.com');
				addParticipant('bob@example.com');
			},
		);
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));

		await waitFor(() => {
			expect(
				within(screen.getByTestId('participants'))
					.getAllByRole('listitem')
					.map((item) => item.textContent),
			).toEqual(['bob@example.com', 'alice@example.com (you)']);
		});
		expect(screen.getByText('In this call (2)')).toBeInTheDocument();
	});
});

describe('CallScreen — mic and camera', () => {
	it('turns the local mic and camera tracks off and on', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));
		await screen.findByTestId('hang-up-button');
		const mic = screen.getByRole('switch', {name: 'Microphone'});
		const camera = screen.getByRole('switch', {name: 'Camera'});
		expect(mic).toHaveAttribute('aria-checked', 'true');
		expect(camera).toHaveAttribute('aria-checked', 'true');

		await user.click(mic);
		expect(mic).toHaveAttribute('aria-checked', 'false');
		expect(setLocalTrackEnabled).toHaveBeenLastCalledWith('audio', false);

		await user.click(camera);
		expect(camera).toHaveAttribute('aria-checked', 'false');
		expect(setLocalTrackEnabled).toHaveBeenLastCalledWith('video', false);
		expect(screen.getByTestId('local-camera-off')).toBeInTheDocument();

		await user.click(camera);
		expect(setLocalTrackEnabled).toHaveBeenLastCalledWith('video', true);
		expect(screen.queryByTestId('local-camera-off')).not.toBeInTheDocument();
	});

	it('turns both back on for the next call after hanging up', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		leaveCall.mockResolvedValueOnce('User left call succesfully');
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));
		await user.click(await screen.findByTestId('mic-toggle'));
		await user.click(screen.getByTestId('camera-toggle'));
		await user.click(screen.getByTestId('hang-up-button'));

		createCall.mockResolvedValueOnce({callID: 'call-2'});
		await user.click(await screen.findByTestId('create-call-button'));

		expect(await screen.findByTestId('mic-toggle')).toHaveAttribute(
			'aria-checked',
			'true',
		);
		expect(screen.getByTestId('camera-toggle')).toHaveAttribute(
			'aria-checked',
			'true',
		);
	});
});

describe('CallScreen — leave call', () => {
	it('clears call state and shows the lobby again on hang up', async () => {
		const validCallId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
		joinCall.mockResolvedValueOnce(validCallId);
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

describe('CallScreen — control bar', () => {
	it('toggles the chat sidebar and badges messages that arrive while it is closed', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		let addChatMessage: ((message: string) => void) | undefined;
		connectToCall.mockImplementationOnce(
			async (
				_callId: string,
				_email: string,
				_username: string,
				_localVideoRef: unknown,
				_remoteVideoRefs: unknown,
				add: (message: string) => void,
			) => {
				addChatMessage = add;
			},
		);
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));
		const chat = await screen.findByTestId('chat-toggle');
		expect(chat).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByTestId('chat-message-input')).toBeInTheDocument();

		await user.click(chat);
		expect(chat).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByTestId('chat-message-input')).not.toBeInTheDocument();

		act(() => {
			addChatMessage?.('bob@example.com: hi');
			addChatMessage?.('alice@example.com: my own message');
		});
		expect(await screen.findByTestId('chat-toggle-badge')).toHaveTextContent(
			'1',
		);

		await user.click(chat);
		expect(screen.queryByTestId('chat-toggle-badge')).not.toBeInTheDocument();
		expect(screen.getByTestId('chat-message-input')).toBeInTheDocument();

		await user.click(screen.getByRole('button', {name: 'Close chat'}));
		expect(screen.queryByTestId('chat-message-input')).not.toBeInTheDocument();
		expect(chat).toHaveAttribute('aria-expanded', 'false');
	});

	it('lists only you before anyone joins', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));

		expect(await screen.findByText('In this call (1)')).toBeInTheDocument();
		expect(screen.getByTestId('participants')).toHaveTextContent(
			'alice@example.com (you)',
		);
	});

	it('names each control in a tooltip', async () => {
		createCall.mockResolvedValueOnce({callID: 'call-1'});
		const user = userEvent.setup();
		renderCallScreen();

		await user.click(screen.getByTestId('create-call-button'));
		await user.hover(await screen.findByTestId('mic-toggle'));

		expect(await screen.findByText('Mute')).toBeInTheDocument();
	});
});
