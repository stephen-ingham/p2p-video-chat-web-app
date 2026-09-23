/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion -- fakes mirror react-native-webrtc's API names (RTCView, toURL) and stand in for native objects only partially */
import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {fireEvent, render, screen} from '@testing-library/react-native';
import type * as ReactNative from 'react-native';
import * as api from '../src/lib/api.ts';
import * as signalling from '../src/lib/signalling.ts';
import * as webrtc from '../src/lib/webrtc.ts';
import CallScreen from '../src/screens/call-screen.tsx';

// Real useCall + call-session run against these fakes. jsdom-style
// environments have no WebRTC, and react-native-webrtc is a native module,
// so its view and the webrtc.ts wrapper are replaced.
jest.mock('react-native-webrtc', () => {
	const {View} = jest.requireActual<typeof ReactNative>('react-native');
	return {RTCView: View};
});
jest.mock('../src/lib/api.ts');
jest.mock('../src/lib/signalling.ts');
jest.mock('../src/lib/webrtc.ts');

const mockedApi = jest.mocked(api);
const mockedSignalling = jest.mocked(signalling);
const mockedWebrtc = jest.mocked(webrtc);

const socket = {send: jest.fn(), close: jest.fn(), addEventListener: jest.fn()};
const stream = {toURL: () => 'local-stream', release: jest.fn()};
const validCallId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const session = {
	token: 'jwt-abc',
	email: 'john.smith@gmail.com',
	username: 'john.smith',
};

beforeEach(() => {
	jest.resetAllMocks();
	mockedApi.getIceServers.mockResolvedValue([]);
	mockedApi.leaveCall.mockResolvedValue(undefined);
	mockedWebrtc.getLocalStream.mockResolvedValue(
		stream as unknown as Awaited<ReturnType<typeof webrtc.getLocalStream>>,
	);
	mockedSignalling.connectToCall.mockResolvedValue({
		socket: socket as unknown as WebSocket,
		participants: [],
	});
	mockedWebrtc.createPeerFactory.mockReturnValue(() => ({
		createOffer: async () => ({type: 'offer', sdp: 'offer-sdp'}),
		acceptOffer: async () => ({type: 'answer', sdp: 'answer-sdp'}),
		acceptAnswer: async () => undefined,
		addIceCandidate: async () => undefined,
		close: jest.fn<() => void>(),
	}));
});

async function renderScreen() {
	await render(
		<CallScreen session={session} onLogout={jest.fn<() => void>()} />,
	);
}

describe('CallScreen', () => {
	it('creates a call and shows its ID with the local video', async () => {
		mockedApi.createCall.mockResolvedValueOnce(validCallId);
		await renderScreen();

		await fireEvent.press(screen.getByTestId('create-call-button'));

		expect(await screen.findByTestId('call-id')).toHaveTextContent(
			`Call ID: ${validCallId}`,
		);
		expect(screen.getByTestId('local-video')).toBeOnTheScreen();
		expect(mockedSignalling.connectToCall).toHaveBeenCalledWith({
			callId: validCallId,
			email: 'john.smith@gmail.com',
			username: 'john.smith',
		});
	});

	it('only enables join for a valid call ID', async () => {
		await renderScreen();

		await fireEvent.changeText(screen.getByTestId('join-call-input'), 'nope');
		expect(screen.getByTestId('join-call-input-error')).toBeOnTheScreen();
		expect(screen.getByTestId('join-call-button')).toBeDisabled();

		await fireEvent.changeText(
			screen.getByTestId('join-call-input'),
			validCallId,
		);
		expect(screen.queryByTestId('join-call-input-error')).toBeNull();
		expect(screen.getByTestId('join-call-button')).toBeEnabled();
	});

	it('joins a call and lists the participants already on it', async () => {
		mockedApi.joinCall.mockResolvedValueOnce(validCallId);
		mockedSignalling.connectToCall.mockResolvedValueOnce({
			socket: socket as unknown as WebSocket,
			participants: ['sam.clarence@gmail.com'],
		});
		await renderScreen();

		await fireEvent.changeText(
			screen.getByTestId('join-call-input'),
			validCallId,
		);
		await fireEvent.press(screen.getByTestId('join-call-button'));

		expect(await screen.findByTestId('participants')).toHaveTextContent(
			'On the call: sam.clarence@gmail.com',
		);
		expect(mockedApi.joinCall).toHaveBeenCalledWith('jwt-abc', validCallId);
		// The joiner offers to everyone already on the call.
		expect(socket.send).toHaveBeenCalledWith(
			expect.stringContaining('"type":"offer"'),
		);
	});

	it('shows an error and stays in the lobby when creating fails', async () => {
		mockedApi.createCall.mockRejectedValueOnce(new Error('500'));
		await renderScreen();

		await fireEvent.press(screen.getByTestId('create-call-button'));

		expect(await screen.findByTestId('call-error')).toHaveTextContent(
			'Failed to create a call.',
		);
		expect(screen.getByTestId('create-call-button')).toBeOnTheScreen();
	});

	it('hangs up: leaves the call and releases media', async () => {
		mockedApi.createCall.mockResolvedValueOnce(validCallId);
		await renderScreen();
		await fireEvent.press(screen.getByTestId('create-call-button'));
		await screen.findByTestId('call-id');

		await fireEvent.press(screen.getByTestId('hang-up-button'));

		expect(await screen.findByTestId('create-call-button')).toBeOnTheScreen();
		expect(socket.close).toHaveBeenCalled();
		expect(stream.release).toHaveBeenCalled();
		expect(mockedApi.leaveCall).toHaveBeenCalledWith('jwt-abc', validCallId);
	});
});
