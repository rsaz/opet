import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Document } from "../types";

export function useDocument(conversationId: string | null) {
	const [document, setDocument] = useState<Document | null>(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setDocument(null);
			return;
		}
		try {
			setError(null);
			const detail = await api.fetchConversation(conversationId);
			setDocument(detail.document ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load document");
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	/**
	 * Upload to a named conversation.
	 *
	 * Takes the id explicitly so a document can arrive before the conversation it
	 * belongs to has been selected — which is the order a lawyer works in. They
	 * arrive holding a document, not holding a question.
	 */
	const uploadTo = useCallback(async (targetId: string, file: File) => {
		try {
			setUploading(true);
			setError(null);
			const doc = await api.uploadDocument(targetId, file);
			// Adopt it directly rather than refetching. The caller has just switched
			// to this conversation, and a refetch would run against whichever id this
			// hook was rendered with — which, on the create-then-upload path, is the
			// null it had a moment ago.
			setDocument(doc);
			return doc;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to upload document",
			);
			return null;
		} finally {
			setUploading(false);
		}
	}, []);

	const upload = useCallback(
		async (file: File) => {
			if (!conversationId) return null;
			return uploadTo(conversationId, file);
		},
		[conversationId, uploadTo],
	);

	return {
		document,
		uploading,
		error,
		upload,
		uploadTo,
		refresh,
	};
}
