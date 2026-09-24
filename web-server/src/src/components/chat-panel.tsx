import React, {useState} from 'react';
import {Send} from 'lucide-react';
import {ScrollArea} from '@/components/ui/scroll-area.tsx';
import {Input} from '@/components/ui/input.tsx';
import {Button} from '@/components/ui/button.tsx';
import {Avatar, AvatarFallback} from '@/components/ui/avatar.tsx';
import {Separator} from '@/components/ui/separator.tsx';

type ChatPanelProps = {
	messages: string[];
	participants: string[];
	onSend: (message: string) => void;
};

export default function ChatPanel({
	messages,
	participants,
	onSend,
}: ChatPanelProps) {
	const [input, setInput] = useState('');

	function handleSend() {
		if (!input.trim()) return;
		onSend(input.trim());
		setInput('');
	}

	return (
		<div className="flex flex-col h-full bg-canvas border border-line rounded-xl overflow-hidden">
			<div className="px-4 py-3 border-b border-line">
				<p className="text-sm font-semibold text-ink">Chat</p>
				{participants.length > 0 && (
					<p
						className="text-xs text-ink-muted mt-0.5"
						data-testid="participants"
					>
						{participants.join(', ')}
					</p>
				)}
			</div>

			<ScrollArea className="flex-1 px-4 py-3">
				<div className="flex flex-col gap-3">
					{messages.length === 0 && (
						<p className="text-xs text-ink-muted text-center py-4">
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
								<Avatar className="h-6 w-6 shrink-0 mt-0.5">
									<AvatarFallback className="text-[10px] bg-surface-active text-ink">
										{sender?.[0]?.toUpperCase() ?? '?'}
									</AvatarFallback>
								</Avatar>
								<div>
									<p className="text-xs font-medium text-ink-soft">{sender}</p>
									<p className="text-sm text-ink">{text}</p>
								</div>
							</div>
						);
					})}
				</div>
			</ScrollArea>

			<Separator className="bg-line" />

			<div className="flex gap-2 px-4 py-3">
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
					className="bg-surface border-line-control text-ink placeholder:text-ink-muted focus-visible:ring-focus"
					suppressHydrationWarning={true}
					data-testid="chat-message-input"
				/>
				<Button
					onClick={handleSend}
					size="icon"
					aria-label="Send message"
					className="bg-surface-active hover:bg-surface-active-hover shrink-0"
					data-testid="chat-send-button"
				>
					<Send className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
