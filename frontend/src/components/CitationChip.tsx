import type { Citation } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** Pulls the ordinal out of a `#cite-3` anchor. Returns null for any other href. */
export function citationOrdinal(href: string | undefined): number | null {
	if (!href) return null;
	const match = /^#cite-(\d+)$/.exec(href);
	return match ? Number(match[1]) : null;
}

interface CitationChipProps {
	label: string;
	citation?: Citation;
}

/**
 * An inline reference from an answer back into the document.
 *
 * Deliberately quiet: it sits inside legal prose that a lawyer is reading closely, so
 * it has to be findable without competing with the sentence it supports. Hovering
 * shows the passage itself — most verification questions are answered by reading the
 * words, without going near the document.
 */
export function CitationChip({ label, citation }: CitationChipProps) {
	const approximate = citation?.match_kind === "partial";

	const chip = (
		<span
			className={`ml-1 whitespace-nowrap rounded bg-neutral-100 px-1.5 py-px align-baseline font-mono text-[0.6875rem] font-medium text-neutral-500 ${
				approximate ? "underline decoration-dotted underline-offset-2" : ""
			}`}
		>
			{label}
		</span>
	);

	// Before the citation has arrived from the server there is nothing to show, so
	// the chip stays a plain marker rather than an empty tooltip.
	if (!citation) return chip;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{chip}</TooltipTrigger>
			<TooltipContent side="top" align="start" className="max-w-sm px-3 py-2.5">
				<p className="font-serif text-[0.8125rem] leading-relaxed text-neutral-100">
					“{citation.matched_text ?? citation.quote}”
				</p>
				<p className="mt-1.5 text-[0.6875rem] text-neutral-400">
					{citation.label} · page {citation.page}
					{approximate ? " · closest match in the document" : ""}
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
