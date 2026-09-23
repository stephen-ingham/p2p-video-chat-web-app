/* eslint-disable @typescript-eslint/naming-convention -- message payloads mirror the signalling protocol (callID, sdpMLineIndex) */
import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {createCallSession} from '../src/lib/call-session.ts';
import type {CallEvents, CreatePeer, Peer} from '../src/lib/call-types.ts';

function createFakeSocket() {
	let listener: ((event: {data: unknown}) => void) | undefined;
	const sent: unknown[] = [];
	return {
		sent,
		socket: {
			send(data: string) {
				sent.push(JSON.parse(data));
			},
			close: jest.fn(),
			addEventListener(_type: 'message', l: (event: {data: unknown}) => void) {
				listener = l;
			},
		},
		// Delivers a server message, then lets the async handler finish.
		async receive(type: string, data: Record<string, unknown>) {
			listener?.({data: JSON.stringify({type, data})});
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
		},
	};
}

function createFakePeers() {
	const peers: Array<Peer & {handlers: Parameters<CreatePeer>[0]}> = [];
	const createPeer: CreatePeer = (handlers) => {
		const peer = {
			handlers,
			createOffer: jest.fn(async () => ({type: 'offer', sdp: 'offer-sdp'})),
			acceptOffer: jest.fn(async () => ({type: 'answer', sdp: 'answer-sdp'})),
			acceptAnswer: jest.fn(async () => undefined),
			addIceCandidate: jest.fn(async () => undefined),
			close: jest.fn(),
		};
		peers.push(peer);
		return peer;
	};

	return {peers, createPeer};
}

let fake: ReturnType<typeof createFakeSocket>;
let fakePeers: ReturnType<typeof createFakePeers>;
let events: {[K in keyof CallEvents]: jest.Mock<CallEvents[K]>};

function startSession() {
	return createCallSession({
		callId: 'call-1',
		email: 'me@example.com',
		socket: fake.socket,
		createPeer: fakePeers.createPeer,
		events,
	});
}

beforeEach(() => {
	fake = createFakeSocket();
	fakePeers = createFakePeers();
	events = {
		onParticipantJoined: jest.fn(),
		onParticipantLeft: jest.fn(),
		onRemoteStream: jest.fn(),
		onChat: jest.fn(),
		onError: jest.fn(),
	};
});

describe('createCallSession', () => {
	it('offers to everyone already on the call when joining', async () => {
		await startSession().start(['a@example.com', 'b@example.com']);

		expect(events.onParticipantJoined.mock.calls).toEqual([
			['a@example.com'],
			['b@example.com'],
		]);
		expect(fake.sent).toEqual([
			{
				type: 'offer',
				data: {
					offer: {type: 'offer', sdp: 'offer-sdp'},
					recipient: 'a@example.com',
					caller: 'me@example.com',
					currentUserEmail: 'me@example.com',
					callID: 'call-1',
				},
			},
			expect.objectContaining({
				data: expect.objectContaining({recipient: 'b@example.com'}),
			}),
		]);
	});

	it('answers an incoming offer, addressed back to the caller', async () => {
		startSession();
		await fake.receive('offer', {
			caller: 'joiner@example.com',
			recipient: 'me@example.com',
			offer: {type: 'offer', sdp: 'their-offer'},
		});

		expect(fakePeers.peers[0].acceptOffer).toHaveBeenCalledWith({
			type: 'offer',
			sdp: 'their-offer',
		});
		expect(fake.sent).toEqual([
			{
				type: 'answer',
				data: {
					caller: 'joiner@example.com',
					recipient: 'me@example.com',
					answer: {type: 'answer', sdp: 'answer-sdp'},
					callID: 'call-1',
				},
			},
		]);
	});

	it('queues ICE candidates that arrive before the offer', async () => {
		startSession();
		const candidate = {candidate: 'cand-1', sdpMid: '0', sdpMLineIndex: 0};
		await fake.receive('candidate', {caller: 'joiner@example.com', candidate});

		const [peer] = fakePeers.peers;
		expect(peer.addIceCandidate).not.toHaveBeenCalled();

		await fake.receive('offer', {
			caller: 'joiner@example.com',
			offer: {type: 'offer', sdp: 'their-offer'},
		});
		expect(fakePeers.peers).toHaveLength(1);
		expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
	});

	it('applies the answer to the peer it offered to', async () => {
		const session = startSession();
		await session.start(['a@example.com']);
		await fake.receive('answer', {
			caller: 'me@example.com',
			recipient: 'a@example.com',
			answer: {type: 'answer', sdp: 'their-answer'},
		});

		expect(fakePeers.peers[0].acceptAnswer).toHaveBeenCalledWith({
			type: 'answer',
			sdp: 'their-answer',
		});
	});

	it('sends local ICE candidates to the peer, tagged with our email', async () => {
		await startSession().start(['a@example.com']);
		fakePeers.peers[0].handlers.onIceCandidate({candidate: 'mine'});

		expect(fake.sent.at(-1)).toEqual({
			type: 'candidate',
			data: {
				candidate: {candidate: 'mine'},
				recipient: 'a@example.com',
				caller: 'me@example.com',
				callID: 'call-1',
			},
		});
	});

	it('reports remote streams, joins (except our own) and chat', async () => {
		await startSession().start(['a@example.com']);
		fakePeers.peers[0].handlers.onRemoteStream('stream-url');
		await fake.receive('receivedNewParticipantNotif', {
			email: 'me@example.com',
		});
		await fake.receive('receivedNewParticipantNotif', {email: 'c@example.com'});
		await fake.receive('chatMessage', {email: 'c@example.com', message: 'hi'});

		expect(events.onRemoteStream).toHaveBeenCalledWith(
			'a@example.com',
			'stream-url',
		);
		expect(events.onParticipantJoined).not.toHaveBeenCalledWith(
			'me@example.com',
		);
		expect(events.onParticipantJoined).toHaveBeenCalledWith('c@example.com');
		expect(events.onChat).toHaveBeenCalledWith('c@example.com', 'hi');
	});

	it('closes the peer when a participant leaves, and everything on leave', async () => {
		const session = startSession();
		await session.start(['a@example.com', 'b@example.com']);
		await fake.receive('participantLeftCall', {email: 'a@example.com'});

		expect(fakePeers.peers[0].close).toHaveBeenCalled();
		expect(events.onParticipantLeft).toHaveBeenCalledWith('a@example.com');

		session.leave();
		expect(fakePeers.peers[1].close).toHaveBeenCalled();
		expect(fake.socket.close).toHaveBeenCalled();
	});
});
