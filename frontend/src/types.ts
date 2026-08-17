export interface Conversation {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	has_document: boolean;
}

/** A reference from an answer back into the document it came from. */
export interface Citation {
	id: string;
	/** 1-based, and what the inline `#cite-N` anchor in the message body points at. */
	ordinal: number;
	page: number;
	/** The model's transcription of the passage. */
	quote: string;
	label: string;
	/** The passage in the document's own characters — what gets highlighted. */
	matched_text?: string | null;
	/** How confidently the quote was located: exact, normalised or partial. */
	match_kind?: "exact" | "normalised" | "partial" | null;
}

export interface Message {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	sources_cited: number;
	created_at: string;
	citations?: Citation[];
}

export interface Document {
	id: string;
	conversation_id: string;
	filename: string;
	page_count: number;
	uploaded_at: string;
}

export interface ConversationDetail extends Conversation {
	document?: Document;
}
