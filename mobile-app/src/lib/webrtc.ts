import {
	mediaDevices,
	MediaStream,
	RTCIceCandidate,
	RTCPeerConnection,
} from 'react-native-webrtc';
import type {CreatePeer, SessionDescription} from './call-types.ts';
import type {IceServer} from './api.ts';

// The only module that touches react-native-webrtc's native APIs, so it needs
// the dev-client build (Expo Go doesn't include the native module).
// react-native-webrtc asks for camera/mic permission itself on Android.

// Same fallback as the web client: public STUN only, used if the API's ICE
// config can't be fetched.
export const defaultIceServers: IceServer[] = [
	{urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']},
];

// 640x480 at 24fps: plenty for a phone-sized tile, cheaper to encode on
// low-end phones (and the emulator), and lighter on mobile data.
export async function getLocalStream() {
	return mediaDevices.getUserMedia({
		audio: true,
		video: {facingMode: 'user', width: 640, height: 480, frameRate: 24},
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

// React-native-webrtc's method and event types partly resolve to `any` (its
// vendored event-target-shim types don't ship), so values coming back from it
// are validated rather than trusted.
function asDescription(value: unknown): SessionDescription {
	if (!isRecord(value) || typeof value.type !== 'string') {
		throw new TypeError('Expected a session description');
	}

	return {
		type: value.type,
		sdp: typeof value.sdp === 'string' ? value.sdp : undefined,
	};
}

function toNative(description: SessionDescription) {
	return {type: description.type, sdp: description.sdp ?? ''};
}

export function createPeerFactory(
	localStream: MediaStream,
	iceServers: IceServer[],
): CreatePeer {
	return ({onIceCandidate, onRemoteStream}) => {
		const connection = new RTCPeerConnection({iceServers});
		for (const track of localStream.getTracks()) {
			connection.addTrack(track, localStream);
		}

		// The on* handlers are typed with a generic Event (react-native-webrtc's
		// addEventListener types don't resolve), so narrow the payloads here.
		connection.onicecandidate = (event: unknown) => {
			const candidate = isRecord(event) ? event.candidate : undefined;
			if (!isRecord(candidate) || typeof candidate.candidate !== 'string') {
				return;
			}

			onIceCandidate({
				candidate: candidate.candidate,
				sdpMid:
					typeof candidate.sdpMid === 'string' ? candidate.sdpMid : undefined,
				// eslint-disable-next-line @typescript-eslint/naming-convention -- standard RTCIceCandidate field
				sdpMLineIndex:
					typeof candidate.sdpMLineIndex === 'number'
						? candidate.sdpMLineIndex
						: undefined,
			});
		};

		connection.ontrack = (event: unknown) => {
			const streams = isRecord(event) ? event.streams : undefined;
			const stream: unknown = Array.isArray(streams) ? streams[0] : undefined;
			if (stream instanceof MediaStream) onRemoteStream(stream.toURL());
		};

		return {
			async createOffer() {
				const offer = asDescription(await connection.createOffer({}));
				await connection.setLocalDescription(toNative(offer));
				return offer;
			},
			async acceptOffer(offer: SessionDescription) {
				await connection.setRemoteDescription(toNative(offer));
				const answer = asDescription(await connection.createAnswer());
				await connection.setLocalDescription(toNative(answer));
				return answer;
			},
			async acceptAnswer(answer: SessionDescription) {
				await connection.setRemoteDescription(toNative(answer));
			},
			async addIceCandidate(candidate) {
				await connection.addIceCandidate(new RTCIceCandidate(candidate));
			},
			close() {
				connection.close();
			},
		};
	};
}
