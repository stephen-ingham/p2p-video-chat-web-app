import React from 'react';
import {
	MessageSquare,
	Mic,
	MicOff,
	PhoneOff,
	Video,
	VideoOff,
} from 'lucide-react';
import CallControlButton from '@/components/call-control-button.tsx';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import {shortcutLabel} from '@/lib/use-call-shortcuts.ts';

type CallControlBarProps = {
	micOn: boolean;
	cameraOn: boolean;
	chatOpen: boolean;
	unread: number;
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onToggleChat: () => void;
	onHangUp: () => void;
};

// The shortcuts themselves are handled by useCallShortcuts in CallScreen.
function WithTooltip({
	tip,
	shortcut,
	children,
}: {
	tip: string;
	shortcut?: string;
	children: React.ReactElement;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent>
				{tip}
				{shortcut && <kbd className="font-sans text-ink-muted">{shortcut}</kbd>}
			</TooltipContent>
		</Tooltip>
	);
}

// Figma "Control bar": a floating pill under the video grid.
export default function CallControlBar({
	micOn,
	cameraOn,
	chatOpen,
	unread,
	onToggleMic,
	onToggleCamera,
	onToggleChat,
	onHangUp,
}: CallControlBarProps) {
	return (
		<TooltipProvider>
			<div
				role="toolbar"
				aria-label="Call controls"
				className="flex items-center gap-3 self-center rounded-full border border-line bg-surface px-3 py-2 shadow-[0_8px_24px_rgb(0_0_0/0.4)]"
			>
				<WithTooltip
					tip={micOn ? 'Mute' : 'Unmute'}
					shortcut={shortcutLabel('D')}
				>
					<CallControlButton
						icon={micOn ? Mic : MicOff}
						label="Microphone"
						checked={micOn}
						testId="mic-toggle"
						onClick={onToggleMic}
					/>
				</WithTooltip>
				<WithTooltip
					tip={cameraOn ? 'Turn camera off' : 'Turn camera on'}
					shortcut={shortcutLabel('E')}
				>
					<CallControlButton
						icon={cameraOn ? Video : VideoOff}
						label="Camera"
						checked={cameraOn}
						testId="camera-toggle"
						onClick={onToggleCamera}
					/>
				</WithTooltip>
				<WithTooltip
					tip={chatOpen ? 'Close chat' : 'Open chat'}
					shortcut={shortcutLabel('C', {alt: true})}
				>
					<CallControlButton
						icon={MessageSquare}
						label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
						aria-expanded={chatOpen}
						active={chatOpen}
						badge={unread}
						testId="chat-toggle"
						onClick={onToggleChat}
					/>
				</WithTooltip>
				<div aria-hidden className="h-8 w-px bg-line-strong" />
				<WithTooltip tip="Hang up">
					<CallControlButton
						danger
						icon={PhoneOff}
						label="Hang up"
						testId="hang-up-button"
						onClick={onHangUp}
					/>
				</WithTooltip>
			</div>
		</TooltipProvider>
	);
}
