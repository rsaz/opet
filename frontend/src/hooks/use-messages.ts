import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { Citation, Message } from "../types";

export function useMessages(conversationId: string | null) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [streaming, setStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
	/** The question that failed, kept so it can be asked again without retyping. */
	const [failedMessage, setFailedMessage] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setMessages([]);
			return;
		}
		try {
			setLoading(true);
			setError(null);
			const data = await api.fetchMessages(conversationId);
			setMessages(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load messages");
		} finally {
			setLoading(false);
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
		return () => {
			if (abortRef.current) {
				abortRef.current.abort();
			}
		};
	}, [refresh]);

	const send = useCallback(
		async (content: string) => {
			if (!conversationId || streaming) return;

			const userMessage: Message = {
				id: `temp-${Date.now()}`,
				conversation_id: conversationId,
				role: "user",
				content,
				sources_cited: 0,
				created_at: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setStreaming(true);
			setStreamingContent("");
			setStreamingCitations([]);
			setError(null);
			setFailedMessage(null);

			try {
				const response = await api.sendMessage(conversationId, content);

				if (!response.body) {
					throw new Error("No response body");
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				let buffer = "";
				let failure: string | null = null;

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					// Keep the last potentially incomplete line in the buffer
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed || !trimmed.startsWith("data: ")) continue;

						const data = trimmed.slice(6);
						if (data === "[DONE]") continue;

						try {
							const parsed = JSON.parse(data) as {
								type?: string;
								content?: string;
								delta?: string;
								message?: Message;
								citation?: Citation;
								error?: string;
							};

							if (parsed.type === "error") {
								// The server discarded the turn entirely rather than
								// saving an apology as if it were an answer.
								failure = parsed.error ?? "Something went wrong.";
								continue;
							}

							if (parsed.type === "delta" && parsed.delta) {
								accumulated += parsed.delta;
								setStreamingContent(accumulated);
							} else if (parsed.type === "content" && parsed.content) {
								accumulated += parsed.content;
								setStreamingContent(accumulated);
							} else if (parsed.type === "citation" && parsed.citation) {
								// Arrives right after the text it belongs to, so the chip
								// already in the stream can show its passage on hover.
								const citation = parsed.citation;
								setStreamingCitations((prev) => [...prev, citation]);
							} else if (parsed.type === "message" && parsed.message) {
								// Final message from server
								setMessages((prev) => [...prev, parsed.message as Message]);
								accumulated = "";
							} else if (parsed.content && !parsed.type) {
								// Fallback: plain content field
								accumulated += parsed.content;
								setStreamingContent(accumulated);
							}
						} catch {
							// Skip invalid JSON lines
						}
					}
				}

				if (failure) {
					// Nothing was persisted, so the server's view is the truth.
					setError(failure);
					setFailedMessage(content);
					setMessages(await api.fetchMessages(conversationId));
					return;
				}

				// If we accumulated content but never got a final message,
				// create a synthetic assistant message
				if (accumulated) {
					const assistantMessage: Message = {
						id: `stream-${Date.now()}`,
						conversation_id: conversationId,
						role: "assistant",
						content: accumulated,
						sources_cited: 0,
						created_at: new Date().toISOString(),
					};
					setMessages((prev) => [...prev, assistantMessage]);
				}

				// Refresh to get server-canonical messages
				const freshMessages = await api.fetchMessages(conversationId);
				setMessages(freshMessages);
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;
				setError(err instanceof Error ? err.message : "Failed to send message");
			} finally {
				setStreaming(false);
				setStreamingContent("");
				setStreamingCitations([]);
			}
		},
		[conversationId, streaming],
	);

	const retry = useCallback(async () => {
		if (!failedMessage) return;
		await send(failedMessage);
	}, [failedMessage, send]);

	return {
		messages,
		loading,
		error,
		failedMessage,
		retry,
		streaming,
		streamingContent,
		streamingCitations,
		send,
		refresh,
	};
}
