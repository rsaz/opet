import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Citation, Message } from "../types";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { MessageBubble, StreamingBubble } from "./MessageBubble";

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	streamingCitations: Citation[];
	hasDocument: boolean;
	uploading: boolean;
	conversationId: string | null;
	onSend: (content: string) => void;
	onUpload: (file: File) => void;
	onSelectCitation: (citation: Citation) => void;
	onRetry: () => void;
}

export function ChatWindow({
	messages,
	loading,
	error,
	streaming,
	streamingContent,
	streamingCitations,
	hasDocument,
	uploading,
	conversationId,
	onSend,
	onUpload,
	onSelectCitation,
	onRetry,
}: ChatWindowProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive or during streaming
	const messagesLength = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and streamingContent are intentional triggers for auto-scroll
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messagesLength, streamingContent]);

	// No conversation selected
	if (!conversationId) {
		return (
			<div className="flex flex-1 items-center justify-center bg-neutral-50">
				<div className="text-center">
					<p className="text-sm text-neutral-400">
						Select a conversation or create a new one
					</p>
				</div>
			</div>
		);
	}

	// Loading messages
	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center bg-white">
				<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
			</div>
		);
	}

	// Empty conversation - show upload prompt
	if (messages.length === 0 && !streaming) {
		return (
			<div className="flex flex-1 flex-col bg-white">
				<div className="flex flex-1 items-center justify-center">
					{hasDocument ? (
						<div className="text-center">
							<p className="text-sm text-neutral-500">
								Document uploaded. Ask a question to get started.
							</p>
						</div>
					) : (
						<EmptyState onUpload={onUpload} uploading={uploading} />
					)}
				</div>
				<ChatInput
					onSend={onSend}
					onUpload={onUpload}
					disabled={streaming}
					hasDocument={hasDocument}
					uploading={uploading}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col bg-white">
			{error && (
				<div className="mx-auto mt-3 flex w-full max-w-2xl items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3.5 py-3">
					<AlertCircle className="mt-px h-4 w-4 flex-shrink-0 text-red-500" />
					<div className="min-w-0 flex-1">
						<p className="text-sm text-red-700">{error}</p>
						<button
							type="button"
							onClick={onRetry}
							disabled={streaming}
							className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
						>
							<RotateCw className="h-3 w-3" />
							Ask again
						</button>
					</div>
				</div>
			)}

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
				<div className="mx-auto max-w-2xl space-y-1">
					{messages.map((message) => (
						<MessageBubble
							key={message.id}
							message={message}
							onSelectCitation={onSelectCitation}
						/>
					))}
					{streaming && (
						<StreamingBubble
							content={streamingContent}
							citations={streamingCitations}
							onSelectCitation={onSelectCitation}
						/>
					)}
				</div>
			</div>

			<ChatInput
				onSend={onSend}
				onUpload={onUpload}
				disabled={streaming}
				hasDocument={hasDocument}
				uploading={uploading}
			/>
		</div>
	);
}
