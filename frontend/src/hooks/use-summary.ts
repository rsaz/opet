import { useCallback, useEffect, useState } from "react";
import type { DocumentSummary } from "../types";

/**
 * Key terms for a document.
 *
 * The first request does the reading, so it takes several seconds; every request
 * after that is a database read. The loading state matters — this is the first
 * thing a reader sees after uploading.
 */
export function useSummary(documentId: string | null) {
	const [summary, setSummary] = useState<DocumentSummary | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!documentId) {
			setSummary(null);
			return;
		}
		try {
			setLoading(true);
			setError(null);
			const response = await fetch(`/api/documents/${documentId}/summary`);
			if (!response.ok) throw new Error(`API error ${response.status}`);
			setSummary((await response.json()) as DocumentSummary);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to read the document",
			);
		} finally {
			setLoading(false);
		}
	}, [documentId]);

	useEffect(() => {
		load();
	}, [load]);

	return { summary, loading, error, reload: load };
}
