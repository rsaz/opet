import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Flag, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Citation, DocumentSummary as Summary } from "../types";
import { CitationChip } from "./CitationChip";

interface DocumentSummaryProps {
	summary: Summary | null;
	loading: boolean;
	/** Open by default before the conversation starts, folded away once it has. */
	defaultOpen: boolean;
	onSelectCitation: (citation: Citation) => void;
}

/**
 * What the document says, before anyone has asked it anything.
 *
 * The chat can only answer questions a lawyer already knows to ask. Someone opening
 * an unfamiliar lease does not — so the document is read on arrival and the terms a
 * reviewer would go looking for are put on screen, each one clicking through to the
 * clause it came from, exactly like a citation in an answer.
 */
export function DocumentSummary({
	summary,
	loading,
	defaultOpen,
	onSelectCitation,
}: DocumentSummaryProps) {
	const [open, setOpen] = useState(defaultOpen);

	if (loading) {
		return (
			<div className="mx-auto flex w-full max-w-2xl items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-4 py-3">
				<Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
				<p className="text-sm text-neutral-500">Reading the document…</p>
			</div>
		);
	}

	if (!summary || summary.items.length === 0) return null;

	const risks = summary.items.filter((item) => item.risk).length;

	return (
		<Collapsible.Root
			open={open}
			onOpenChange={setOpen}
			className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-200 bg-white"
		>
			<Collapsible.Trigger className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50">
				<ChevronDown
					className={`h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform ${
						open ? "" : "-rotate-90"
					}`}
				/>
				<span className="text-sm font-semibold text-neutral-800">
					Key terms
				</span>
				<span className="text-xs text-neutral-400">
					{summary.document_type ?? "Document"} · {summary.items.length} terms
					{risks > 0 ? ` · ${risks} to review` : ""}
				</span>
			</Collapsible.Trigger>

			<Collapsible.Content>
				<dl className="divide-y divide-neutral-100 border-t border-neutral-100">
					{summary.items.map((item) => (
						<div
							key={item.id}
							className={`px-4 py-3 ${item.risk ? "bg-amber-50/40" : ""}`}
						>
							<dt className="mb-0.5 flex items-center gap-1.5">
								{item.risk && (
									<Flag className="h-3 w-3 flex-shrink-0 text-amber-600" />
								)}
								<span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
									{item.label}
								</span>
							</dt>
							<dd className="text-sm leading-relaxed text-neutral-800">
								{item.value}
								{item.citations.map((citation, index) => (
									<CitationChip
										key={`${item.id}-${citation.page}-${index}`}
										label={shortLabel(citation.label, citation.page)}
										citation={{
											...citation,
											id: `${item.id}-${index}`,
											ordinal: index + 1,
										}}
										onSelect={onSelectCitation}
									/>
								))}
							</dd>
						</div>
					))}
				</dl>
			</Collapsible.Content>
		</Collapsible.Root>
	);
}

/** Mirrors the backend's chip label so a summary chip reads like a chat one. */
function shortLabel(label: string, page: number): string {
	const numbered =
		/^(?:clause|section|paragraph)?\s*(\d[\d.]*(?:\([^)]{1,4}\))?)/i.exec(
			label.trim(),
		);
	return `${numbered ? `§${numbered[1]}` : label.trim()} · p${page}`;
}
