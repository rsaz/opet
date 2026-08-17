import type { Citation } from "../types";

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
 * Deliberately quiet: it sits inside legal prose that a lawyer is reading closely,
 * so it has to be findable without competing with the sentence it supports.
 */
export function CitationChip({ label }: CitationChipProps) {
	return (
		<span className="ml-1 whitespace-nowrap rounded bg-neutral-100 px-1.5 py-px align-baseline font-mono text-[0.6875rem] font-medium text-neutral-500">
			{label}
		</span>
	);
}
