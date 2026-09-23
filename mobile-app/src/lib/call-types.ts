// Shapes shared by call-session.ts (signalling) and webrtc.ts (the real
// react-native-webrtc peers). Kept structural so tests can supply fakes.

export type SessionDescription = {type: string; sdp?: string};

export type IceCandidate = {
	candidate?: string;
	sdpMid?: string | undefined;

	sdpMLineIndex?: number | undefined;
};

export type Peer = {
	// Creates an offer and sets it as the local description.
	createOffer(): Promise<SessionDescription>;
	// Sets the remote offer, then creates and sets the local answer.
	acceptOffer(offer: SessionDescription): Promise<SessionDescription>;
	acceptAnswer(answer: SessionDescription): Promise<void>;
	addIceCandidate(candidate: IceCandidate): Promise<void>;
	close(): void;
};

export type CreatePeer = (handlers: {
	onIceCandidate(candidate: IceCandidate): void;
	onRemoteStream(streamUrl: string): void;
}) => Peer;

export type SocketLike = {
	send(data: string): void;
	close(): void;
	addEventListener(
		type: 'message',
		listener: (event: {data: unknown}) => void,
	): void;
};

export type CallEvents = {
	onParticipantJoined(email: string): void;
	onParticipantLeft(email: string): void;
	onRemoteStream(email: string, streamUrl: string): void;
	onChat(email: string, message: string): void;
	onError(error: unknown): void;
};
