import {useEffect, useRef, useState} from 'react';
import type {MediaStream} from 'react-native-webrtc';
import type {ChatLine} from '../screens/in-call-view.tsx';
import * as api from './api.ts';
import {createCallSession, type CallSession} from './call-session.ts';
import type {MediaState} from './call-types.ts';
import {connectToCall} from './signalling.ts';
import {
	createPeerFactory,
	defaultIceServers,
	getLocalStream,
} from './webrtc.ts';

// State and lifecycle of the current call: local media, the call's
// WebSocket, and a CallSession negotiating WebRTC with everyone else on it.
export function useCall({
	token,
	email,
	username,
	onPeerError,
}: {
	token: string;
	email: string;
	username: string;
	onPeerError: () => void;
}) {
	const [callId, setCallId] = useState<string>();
	const [localStreamUrl, setLocalStreamUrl] = useState<string>();
	const [remoteStreams, setRemoteStreams] = useState<Record<string, string>>(
		{},
	);
	const [participants, setParticipants] = useState<string[]>([]);
	const [chat, setChat] = useState<ChatLine[]>([]);
	const [micOn, setMicOn] = useState(true);
	const [cameraOn, setCameraOn] = useState(true);
	// Remote participants' mic/camera state, by email. Missing means both on.
	const [peerMediaStates, setPeerMediaStates] = useState<
		Record<string, MediaState>
	>({});
	// Mirrors micOn/cameraOn for async code and back-to-back toggles, which
	// would otherwise see the values from an earlier render.
	const mediaChoices = useRef<MediaState>({audio: true, video: true});
	const session = useRef<CallSession | undefined>(undefined);
	const localStream = useRef<MediaStream | undefined>(undefined);
	const nextChatId = useRef(0);

	function addChat(from: string, message: string) {
		nextChatId.current += 1;
		const id = nextChatId.current;
		setChat((lines) => [...lines, {id, email: from, message}]);
	}

	function teardown() {
		session.current?.leave();
		session.current = undefined;
		localStream.current?.release();
		localStream.current = undefined;
		setCallId(undefined);
		setLocalStreamUrl(undefined);
		setRemoteStreams({});
		setParticipants([]);
		setPeerMediaStates({});
		setChat([]);
		setMicOn(true);
		setCameraOn(true);
		mediaChoices.current = {audio: true, video: true};
	}

	// Muting disables the local track rather than removing it, so peers keep
	// their connection and just receive silence / black frames.
	function setTracksEnabled(kind: 'audio' | 'video', enabled: boolean) {
		const tracks =
			kind === 'audio'
				? localStream.current?.getAudioTracks()
				: localStream.current?.getVideoTracks();
		for (const track of tracks ?? []) track.enabled = enabled;
	}

	// Leave the call's media and socket behind if the screen goes away.
	useEffect(() => teardown, []);

	async function enter(id: string) {
		const iceServers = await api
			.getIceServers(token)
			.catch(() => defaultIceServers);
		const stream = await getLocalStream();
		localStream.current = stream;
		setLocalStreamUrl(stream.toURL());

		const connection = await connectToCall({callId: id, email, username});
		session.current = createCallSession({
			callId: id,
			email,
			socket: connection.socket,
			createPeer: createPeerFactory(stream, iceServers),
			events: {
				onParticipantJoined(joined) {
					setParticipants((list) =>
						list.includes(joined) ? list : [...list, joined],
					);
				},
				onParticipantLeft(left) {
					setParticipants((list) => list.filter((p) => p !== left));
					setRemoteStreams(({[left]: _removed, ...rest}) => rest);
					setPeerMediaStates(({[left]: _removed, ...rest}) => rest);
					addChat(left, 'left the call');
				},
				onPeerMediaState(peer, state) {
					setPeerMediaStates((states) => ({...states, [peer]: state}));
				},
				onRemoteStream(peer, url) {
					setRemoteStreams((streams) => ({...streams, [peer]: url}));
				},
				onChat: addChat,
				onError: onPeerError,
			},
		});
		setCallId(id);
		// After the join handshake: the server only accepts our media state
		// from the connection we joined on.
		session.current.sendMediaState(mediaChoices.current);
		await session.current.start(
			connection.participants,
			connection.peerMediaStates,
		);
	}

	async function hangUp() {
		const id = callId;
		teardown();
		// Best effort: the API also notices the closed socket.
		if (id) await api.leaveCall(token, id).catch(() => undefined);
	}

	return {
		callId,
		localStreamUrl,
		remoteStreams,
		participants,
		peerMediaStates,
		chat,
		enter,
		hangUp,
		teardown,
		micOn,
		cameraOn,
		toggleMic() {
			const audio = !mediaChoices.current.audio;
			mediaChoices.current = {...mediaChoices.current, audio};
			setTracksEnabled('audio', audio);
			setMicOn(audio);
			session.current?.sendMediaState(mediaChoices.current);
		},
		toggleCamera() {
			const video = !mediaChoices.current.video;
			mediaChoices.current = {...mediaChoices.current, video};
			setTracksEnabled('video', video);
			setCameraOn(video);
			session.current?.sendMediaState(mediaChoices.current);
		},
		sendChat(message: string) {
			session.current?.sendChat(message);
		},
	};
}
