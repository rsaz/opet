import { useCallback, useEffect, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocument } from "./hooks/use-document";
import { useMessages } from "./hooks/use-messages";
import { useSummary } from "./hooks/use-summary";
import type { Citation } from "./types";

export default function App() {
	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		refresh: refreshConversations,
	} = useConversations();

	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		streamingCitations,
		send,
		retry,
	} = useMessages(selectedId);

	const {
		document,
		uploading,
		upload,
		refresh: refreshDocument,
	} = useDocument(selectedId);

	const { summary, loading: summaryLoading } = useSummary(document?.id ?? null);

	const handleSend = useCallback(
		async (content: string) => {
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const doc = await upload(file);
			if (doc) {
				refreshDocument();
				refreshConversations();
			}
		},
		[upload, refreshDocument, refreshConversations],
	);

	const handleCreate = useCallback(async () => {
		await create();
	}, [create]);

	// The citation the reader is currently checking. Held here rather than in the
	// chat pane because it is what connects the two halves of the screen.
	const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

	// Switching conversations means the previous highlight belongs to a document
	// that is no longer on screen.
	useEffect(() => {
		setActiveCitation(null);
	}, []);

	// A fresh object time, so clicking the same chip again re-locates it instead
	// of being swallowed as "no change".
	const handleSelectCitation = useCallback((citation: Citation) => {
		setActiveCitation({ ...citation });
	}, []);

	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex h-screen bg-neutral-50">
				<ChatSidebar
					conversations={conversations}
					selectedId={selectedId}
					loading={conversationsLoading}
					onSelect={select}
					onCreate={handleCreate}
					onDelete={remove}
				/>

				<ChatWindow
					messages={messages}
					loading={messagesLoading}
					error={messagesError}
					streaming={streaming}
					streamingContent={streamingContent}
					streamingCitations={streamingCitations}
					hasDocument={!!document}
					uploading={uploading}
					summary={summary}
					summaryLoading={summaryLoading}
					conversationId={selectedId}
					onSend={handleSend}
					onUpload={handleUpload}
					onSelectCitation={handleSelectCitation}
					onRetry={retry}
				/>

				<DocumentViewer document={document} activeCitation={activeCitation} />
			</div>
		</TooltipProvider>
	);
}
