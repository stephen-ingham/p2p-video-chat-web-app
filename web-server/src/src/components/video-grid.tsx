import React from 'react';
import {Badge} from '@/components/ui/badge.tsx';
import {Card} from '@/components/ui/card.tsx';

type RemoteStream = {
	peerUser: string;
	stream: MediaStream;
};

type VideoGridProps = {
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	localVideoRef: React.RefObject<HTMLVideoElement | null>;
	remoteStreams: RemoteStream[];
};

function VideoTile({
	label,
	videoRef,
	muted = false,
	testId,
}: {
	label: string;
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	videoRef?: React.RefObject<HTMLVideoElement | null>;
	muted?: boolean;
	stream?: MediaStream;
	testId: string;
}) {
	return (
		<Card className="relative overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center min-w-[280px]">
			<video
				ref={videoRef}
				autoPlay
				muted={muted}
				playsInline
				className="w-full h-full object-cover"
				data-testid={testId}
			/>
			<Badge className="absolute bottom-2 left-2 bg-black/60 text-white border-0">
				{label}
			</Badge>
		</Card>
	);
}

function RemoteTile({peerUser, stream}: RemoteStream) {
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	const ref = React.useRef<HTMLVideoElement | null>(null);

	React.useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);

	return (
		<VideoTile
			label={peerUser}
			videoRef={ref}
			testId={`remote-video-${peerUser}`}
		/>
	);
}

export default function VideoGrid({
	localVideoRef,
	remoteStreams,
}: VideoGridProps) {
	return (
		<div className="flex flex-wrap gap-3 w-full">
			<VideoTile
				label="You"
				videoRef={localVideoRef}
				muted
				testId="local-video"
			/>
			{remoteStreams.map((rs) => (
				<RemoteTile key={rs.peerUser} {...rs} />
			))}
		</div>
	);
}
