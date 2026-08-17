import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Citation, Message, DocumentSummary as Summary } from "../types";
import { ChatInput } from "./ChatInput";
import { DocumentSummary } from "./DocumentSummary";
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
	summary: Summary | null;
	summaryLoading: boolean;
	conversationId: string | null;
	onSend: (content: string) => void;
	onUpload: (file: File) => void;
	onSelectCitation: (citation: Citation) => void;
	onRetry: () => void;
	onUploadNew: (file: File) => void;
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
	summary,
	summaryLoading,
	conversationId,
	onSend,
	onUpload,
	onSelectCitation,
	onRetry,
	onUploadNew,
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

	// Nothing selected. A lawyer arrives holding a document, so the document is the
	// way in — the conversation gets made around it.
	if (!conversationId) {
		return (
			<div className="flex flex-1 items-center justify-center bg-neutral-50">
				<EmptyState onUpload={onUploadNew} uploading={uploading} />
			</div>
		);
	}

	// Loading messages
	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center bg-neutral-50">
				<Loader2 className="h-6 w-6 animate-spin text-brand-500" />
			</div>
		);
	}

	// Empty conversation - show upload prompt
	if (messages.length === 0 && !streaming) {
		return (
			<div className="flex flex-1 flex-col bg-neutral-50">
				{hasDocument ? (
					<div className="flex-1 overflow-y-auto px-6 py-4">
						<DocumentSummary
							summary={summary}
							loading={summaryLoading}
							defaultOpen
							onSelectCitation={onSelectCitation}
						/>
						{!summaryLoading && (
							<p className="mx-auto mt-3 max-w-2xl text-center text-sm text-neutral-400">
								Ask a question, or click any reference to see it in the
								document.
							</p>
						)}
					</div>
				) : (
					<div className="flex flex-1 items-center justify-center">
						<EmptyState onUpload={onUpload} uploading={uploading} />
					</div>
				)}
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
		<div className="flex flex-1 flex-col bg-neutral-50">
			{error && (
				<div className="mx-auto mt-4 flex w-full max-w-2xl items-start gap-2.5 rounded-xl bg-danger-light px-3.5 py-3">
					<AlertCircle className="mt-px h-4 w-4 flex-shrink-0 text-danger-dark" />
					<div className="min-w-0 flex-1">
						<p className="text-sm text-danger-dark">{error}</p>
						<button
							type="button"
							onClick={onRetry}
							disabled={streaming}
							className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-neutral-0 px-2.5 py-1 text-xs font-medium text-danger-dark shadow-page transition-colors hover:bg-neutral-50 disabled:opacity-50"
						>
							<RotateCw className="h-3 w-3" />
							Ask again
						</button>
					</div>
				</div>
			)}

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
				{hasDocument && (
					<div className="mb-4">
						<DocumentSummary
							summary={summary}
							loading={summaryLoading}
							defaultOpen={false}
							onSelectCitation={onSelectCitation}
						/>
					</div>
				)}
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
