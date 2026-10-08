/* eslint-disable @typescript-eslint/naming-convention -- callID mirrors the real HTTP response shape, not variable names */
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import CallScreen from '@/components/call-screen.tsx';

const createCall = vi.fn();
const leaveCall = vi.fn();

vi.mock('@/lib/use-token-worker.ts', () => ({
	useTokenWorker: () => ({
		createCall,
		joinCall: vi.fn(),
		leaveCall,
		logout: vi.fn(),
		getIceServers: vi.fn(),
	}),
}));

const connectToCall = vi.fn();
const sendChatMessageToCall = vi.fn();
const sendMediaStateToCall = vi.fn();
const setLocalTrackEnabled = vi.fn();

vi.mock('@/lib/rtc-utils.ts', () => ({
	async connectToCall(...arguments_: unknown[]): Promise<void> {
		await connectToCall(...arguments_);
	},
	sendChatMessageToCall(...arguments_: unknown[]): void {
		sendChatMessageToCall(...arguments_);
	},
	sendMediaStateToCall(...arguments_: unknown[]): void {
		sendMediaStateToCall(...arguments_);
	},
	async closeConns(): Promise<void> {
		// Nothing to close.
	},
	async closeWebSocketServerConn(): Promise<void> {
		// Nothing to close.
	},
	async setLocalTrackEnabled(...arguments_: unknown[]): Promise<void> {
		await setLocalTrackEnabled(...arguments_);
	},
	async getLocalStream(): Promise<undefined> {
		return undefined;
	},
	async startLocalMedia(): Promise<undefined> {
		return undefined;
	},
	async stopLocalMedia(): Promise<void> {
		// No local media to release
	},
}));

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- jsdom has no MediaStream; only object identity matters to these tests
const fakeRemoteStream = {id: 'remote'} as unknown as MediaStream;

type CallCallbacks = {
	addChatMessage: (message: string) => void;
	addParticipant: (name: string) => void;
	addRemoteVideo: (peerUser: string, stream: MediaStream) => void;
};

function setViewportMobile(matches: boolean) {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			matches,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
}

async function startCall(user: ReturnType<typeof userEvent.setup>) {
	let callbacks: CallCallbacks | undefined;
	createCall.mockResolvedValueOnce({callID: 'call-1'});
	connectToCall.mockImplementationOnce(
		async (
			_callId: string,
			_email: string,
			_username: string,
			_localVideoRef: unknown,
			_remoteVideoRefs: unknown,
			addChatMessage: CallCallbacks['addChatMessage'],
			addParticipant: CallCallbacks['addParticipant'],
			_removeParticipant: unknown,
			addRemoteVideo: CallCallbacks['addRemoteVideo'],
		) => {
			callbacks = {addChatMessage, addParticipant, addRemoteVideo};
		},
	);
	await user.click(screen.getByTestId('create-call-button'));
	await waitFor(() => {
		expect(callbacks).toBeDefined();
	});
	const {addChatMessage, addParticipant, addRemoteVideo} = callbacks!;
	return {
		addChatMessage(message: string) {
			act(() => {
				addChatMessage(message);
			});
		},
		addParticipant(name: string) {
			act(() => {
				addParticipant(name);
			});
		},
		addRemoteVideo(peerUser: string, stream: MediaStream) {
			act(() => {
				addRemoteVideo(peerUser, stream);
			});
		},
	};
}

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
	setViewportMobile(true);
	createCall.mockReset();
	leaveCall.mockReset();
	connectToCall.mockReset();
	sendChatMessageToCall.mockReset();
	setLocalTrackEnabled.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('CallScreen on mobile — before a call', () => {
	it('stacks Start a call and Join a call cards, without the chat panel', () => {
		renderCallScreen();

		expect(screen.getByText('Start a call')).toBeInTheDocument();
		expect(screen.getByText('Join a call')).toBeInTheDocument();
		expect(screen.getByLabelText('Call ID')).toBe(
			screen.getByTestId('join-call-input'),
		);
		expect(screen.queryByTestId('chat-message-input')).not.toBeInTheDocument();
		expect(screen.queryByTestId('local-video')).not.toBeInTheDocument();
	});

	it('shows the desktop lobby, with a camera preview, on wider screens', () => {
		setViewportMobile(false);
		renderCallScreen();

		expect(screen.getByTestId('lobby-mic-toggle')).toBeInTheDocument();
		expect(screen.getByTestId('local-video')).toBeInTheDocument();
		expect(screen.queryByTestId('chat-message-input')).not.toBeInTheDocument();
	});
});

describe('CallScreen on mobile — in a call', () => {
	it('shows the call ID and who is on the call in the top bar', async () => {
		const user = userEvent.setup();
		renderCallScreen();

		const call = await startCall(user);

		expect(screen.getByTestId('call-id')).toHaveTextContent(/^call-1$/v);
		expect(screen.getByTestId('call-status')).toHaveTextContent(
			'Waiting for others to join…',
		);
		expect(
			screen.getByText('Share the call ID so others can join.'),
		).toBeInTheDocument();

		call.addParticipant('bob@example.com');
		call.addRemoteVideo('bob@example.com', fakeRemoteStream);

		await waitFor(() => {
			expect(screen.getByTestId('call-status')).toHaveTextContent(
				'On the call: bob@example.com',
			);
		});
		expect(screen.getByTestId('remote-video-bob@example.com').srcObject).toBe(
			fakeRemoteStream,
		);
		expect(screen.getByTestId('local-video')).toBeInTheDocument();
		expect(screen.queryByTestId('username')).not.toBeInTheDocument();
	});

	it('toggles the mic and camera from the bottom bar', async () => {
		const user = userEvent.setup();
		renderCallScreen();
		await startCall(user);

		await user.click(screen.getByRole('switch', {name: 'Microphone'}));
		await user.click(screen.getByRole('switch', {name: 'Camera'}));

		expect(setLocalTrackEnabled).toHaveBeenCalledWith('audio', false);
		expect(setLocalTrackEnabled).toHaveBeenCalledWith('video', false);
		expect(screen.getByRole('switch', {name: 'Microphone'})).toHaveAttribute(
			'aria-checked',
			'false',
		);
		expect(screen.getByText('Your camera is off')).toBeInTheDocument();
	});

	it('opens chat as a sheet, sends from it, and closes it', async () => {
		const user = userEvent.setup();
		renderCallScreen();
		await startCall(user);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

		await user.click(screen.getByRole('button', {name: 'Chat'}));
		const sheet = screen.getByRole('dialog', {name: 'Chat'});
		expect(within(sheet).getByText('No messages yet')).toBeInTheDocument();
		expect(within(sheet).getByTestId('chat-send-button')).toBeDisabled();

		await user.type(within(sheet).getByTestId('chat-message-input'), 'Hello');
		await user.click(within(sheet).getByTestId('chat-send-button'));
		expect(sendChatMessageToCall).toHaveBeenCalledWith(
			'Hello',
			'call-1',
			'alice@example.com',
		);

		await user.click(within(sheet).getByTestId('chat-close'));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.getByRole('button', {name: 'Chat'})).toHaveFocus();
	});

	it('closes the chat sheet on Escape', async () => {
		const user = userEvent.setup();
		renderCallScreen();
		await startCall(user);

		await user.click(screen.getByTestId('chat-open'));
		await user.keyboard('{Escape}');

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});
});

describe('CallScreen on mobile — unread chat badge', () => {
	it("doesn't count your own lines, such as the echo of your join", async () => {
		const user = userEvent.setup();
		renderCallScreen();
		const call = await startCall(user);

		call.addChatMessage('alice@example.com: joined the call');
		call.addChatMessage('bob@example.com: joined the call');

		expect(await screen.findByTestId('chat-open-badge')).toHaveTextContent(
			/^1$/v,
		);
	});

	it('counts messages that arrive while the chat sheet is closed', async () => {
		const user = userEvent.setup();
		renderCallScreen();
		const call = await startCall(user);
		expect(screen.queryByTestId('chat-open-badge')).not.toBeInTheDocument();

		call.addChatMessage('bob@example.com: hi');
		call.addChatMessage('bob@example.com: are you there?');

		expect(await screen.findByTestId('chat-open-badge')).toHaveTextContent(
			/^2$/v,
		);
		expect(
			screen.getByRole('button', {name: 'Chat, 2 unread'}),
		).toBeInTheDocument();
	});

	it('clears when the sheet opens and stays clear for messages read there', async () => {
		const user = userEvent.setup();
		renderCallScreen();
		const call = await startCall(user);
		call.addChatMessage('bob@example.com: hi');
		await screen.findByTestId('chat-open-badge');

		await user.click(screen.getByTestId('chat-open'));
		call.addChatMessage('bob@example.com: read while open');
		await screen.findByText('read while open');
		await user.keyboard('{Escape}');

		expect(screen.queryByTestId('chat-open-badge')).not.toBeInTheDocument();
		expect(screen.getByRole('button', {name: 'Chat'})).toBeInTheDocument();

		call.addChatMessage('bob@example.com: and one more');
		expect(await screen.findByTestId('chat-open-badge')).toHaveTextContent(
			/^1$/v,
		);
	});

	it('caps the count at 9+', async () => {
		const user = userEvent.setup();
		renderCallScreen();
		const call = await startCall(user);

		for (let i = 0; i < 12; i++) call.addChatMessage(`bob@example.com: ${i}`);

		expect(await screen.findByTestId('chat-open-badge')).toHaveTextContent(
			'9+',
		);
		expect(
			screen.getByRole('button', {name: 'Chat, 12 unread'}),
		).toBeInTheDocument();
	});
});
