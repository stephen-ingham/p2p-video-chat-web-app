import React, {useState} from 'react';
import {Send, X} from 'lucide-react';
import {ScrollArea} from '@/components/ui/scroll-area.tsx';
import {Input} from '@/components/ui/input.tsx';
import {Button} from '@/components/ui/button.tsx';
import {Avatar, AvatarFallback} from '@/components/ui/avatar.tsx';
import {Separator} from '@/components/ui/separator.tsx';
import CallControlButton from '@/components/call-control-button.tsx';
import {cn} from '@/lib/utils.ts';

type ChatPanelProps = {
	messages: string[];
	participants: string[];
	onSend: (message: string) => void;
	variant?: 'sidebar' | 'sheet';
	titleId?: string;
	onClose?: () => void;
	// The sidebar lists everyone, with this user last as "(you)".
	currentUser?: string;
};

// Everyone on the call, one per line, with this user last as "(you)".
function ParticipantList({
	participants,
	currentUser,
}: {
	participants: string[];
	currentUser?: string;
}) {
	const everyone = currentUser
		? [...participants.filter((p) => p !== currentUser), currentUser]
		: participants;

	return (
		<div className="mt-1">
			<p className="text-xs text-ink-muted">In this call ({everyone.length})</p>
			<ul
				className="mt-1 flex flex-col text-[13px] leading-[18px] text-ink-soft"
				data-testid="participants"
			>
				{everyone.map((person) => (
					<li key={person} className="break-all">
						{person}
						{person === currentUser && (
							<span className="text-ink-muted"> (you)</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

// The sheet keeps the round phone control; the sidebar has a small X.
function CloseChatButton({
	sheet,
	onClose,
}: {
	sheet: boolean;
	onClose: () => void;
}) {
	return sheet ? (
		<CallControlButton
			icon={X}
			label="Close chat"
			testId="chat-close"
			onClick={onClose}
		/>
	) : (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Close chat"
			className="shrink-0 text-ink-muted hover:bg-surface-raised hover:text-ink"
			data-testid="chat-close"
			onClick={onClose}
		>
			<X />
		</Button>
	);
}

export default function ChatPanel({
	messages,
	participants,
	onSend,
	variant = 'sidebar',
	titleId,
	onClose,
	currentUser,
}: ChatPanelProps) {
	const [input, setInput] = useState('');
	const sheet = variant === 'sheet';

	function handleSend() {
		if (!input.trim()) return;
		onSend(input.trim());
		setInput('');
	}

	return (
		<div
			className={cn(
				'flex flex-col overflow-hidden',
				// The sidebar sits flat in its column (no outline, no rounded corners).
				sheet
					? 'min-h-0 gap-3 rounded-t-2xl border border-line bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
					: 'h-full bg-canvas',
			)}
		>
			<div
				className={cn(
					sheet
						? 'flex items-center justify-between gap-3'
						: 'flex items-start justify-between gap-3 px-4 py-3 border-b border-line',
				)}
			>
				<div className="min-w-0">
					<p
						id={titleId}
						className={cn(
							'font-semibold text-ink',
							sheet ? 'text-lg' : 'text-base',
						)}
					>
						Chat
					</p>
					{!sheet && (
						<ParticipantList
							participants={participants}
							currentUser={currentUser}
						/>
					)}
					{sheet && participants.length > 0 && (
						<p
							className={cn(
								'text-ink-muted mt-0.5',
								sheet ? 'text-[13px] line-clamp-2' : 'text-xs',
							)}
							data-testid="participants"
						>
							{participants.join(', ')}
						</p>
					)}
				</div>
				{onClose && <CloseChatButton sheet={sheet} onClose={onClose} />}
			</div>

			<ScrollArea className={sheet ? 'min-h-0 shrink' : 'flex-1 px-4 py-3'}>
				<div className={cn('flex flex-col', sheet ? 'gap-3 py-1' : 'gap-3')}>
					{messages.length === 0 && (
						<p
							className={cn(
								'text-ink-muted text-center',
								sheet ? 'text-[13px] py-4' : 'text-xs py-4',
							)}
						>
							No messages yet
						</p>
					)}
					{messages.map((message, i) => {
						const [sender, ...rest] = message.split(': ');
						const text = rest.join(': ');
						return (
							<div
								key={i}
								className="flex items-start gap-2"
								data-testid="chat-message"
							>
								<Avatar
									className={cn(
										'shrink-0',
										sheet ? 'size-7' : 'h-6 w-6 mt-0.5',
									)}
								>
									<AvatarFallback
										className={cn(
											'bg-surface-active text-ink',
											sheet ? 'text-[13px] font-semibold' : 'text-[10px]',
										)}
									>
										{sender?.[0]?.toUpperCase() ?? '?'}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0">
									<p
										className={cn(
											'font-medium text-ink-soft break-words',
											sheet ? 'text-[13px]' : 'text-xs',
										)}
									>
										{sender}
									</p>
									<p
										className={cn(
											'text-ink break-words',
											sheet ? 'text-base' : 'text-sm',
										)}
									>
										{text}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</ScrollArea>

			{!sheet && <Separator className="bg-line" />}

			<div className={cn('flex gap-2', sheet ? 'items-center' : 'px-4 py-3')}>
				<Input
					value={input}
					onChange={(event) => {
						setInput(event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') handleSend();
					}}
					placeholder="Type a message…"
					aria-label="Chat message"
					enterKeyHint="send"
					className={cn(
						'border-line-control text-ink placeholder:text-ink-muted focus-visible:ring-focus',
						sheet ? 'h-12 bg-surface-raised px-3 text-base' : 'bg-surface',
					)}
					suppressHydrationWarning={true}
					data-testid="chat-message-input"
				/>
				{sheet ? (
					<CallControlButton
						icon={Send}
						label="Send message"
						disabled={!input.trim()}
						testId="chat-send-button"
						onClick={handleSend}
					/>
				) : (
					<Button
						onClick={handleSend}
						size="icon"
						aria-label="Send message"
						className="bg-surface-active hover:bg-surface-active-hover shrink-0"
						data-testid="chat-send-button"
					>
						<Send className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
