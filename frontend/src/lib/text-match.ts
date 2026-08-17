/**
 * Locating a quoted passage inside a rendered PDF page.
 *
 * The passage was found server-side in PyMuPDF's extraction; the highlight has to
 * land in pdf.js's text layer, and the two do not agree character-for-character —
 * they split runs differently, and whitespace around line breaks is theirs to
 * invent. So matching is done on a folded copy of both strings, with an index map
 * back to the original so the highlight can be drawn where the reader is looking.
 *
 * Mirrors `backend/src/takehome/services/citations.py`, deliberately: the same
 * passage has to be findable on both sides of the wire.
 */

const SUBSTITUTIONS: Record<string, string> = {
	"‘": "'",
	"’": "'",
	"‚": "'",
	"“": '"',
	"”": '"',
	"„": '"',
	"–": "-",
	"—": "-",
	"−": "-",
	" ": " ",
};

export interface Folded {
	text: string;
	/** For each folded character, the index of the original character it came from. */
	origins: number[];
}

export function fold(input: string): Folded {
	const text: string[] = [];
	const origins: number[] = [];
	let previousWasSpace = false;

	for (let i = 0; i < input.length; i++) {
		const raw = input.charAt(i);
		const substituted = SUBSTITUTIONS[raw] ?? raw;
		for (const char of substituted.normalize("NFKC")) {
			if (/\s/.test(char)) {
				if (previousWasSpace) continue;
				text.push(" ");
				origins.push(i);
				previousWasSpace = true;
				continue;
			}
			previousWasSpace = false;
			for (const cased of char.toLowerCase()) {
				text.push(cased);
				origins.push(i);
			}
		}
	}

	return { text: text.join(""), origins };
}

/** The longest run of characters the two strings agree on, as offsets into `b`. */
function longestCommonRun(
	a: string,
	b: string,
): { start: number; size: number } {
	// Rolling single-row DP: the haystack is one page, so this stays cheap, and it
	// avoids holding an entire needle x haystack matrix.
	let previous = new Uint32Array(b.length + 1);
	let best = { start: 0, size: 0 };

	for (let i = 1; i <= a.length; i++) {
		const current = new Uint32Array(b.length + 1);
		for (let j = 1; j <= b.length; j++) {
			if (a.charAt(i - 1) !== b.charAt(j - 1)) continue;
			const run = (previous[j - 1] ?? 0) + 1;
			current[j] = run;
			if (run > best.size) best = { start: j - run, size: run };
		}
		previous = current;
	}

	return best;
}

export interface Span {
	start: number;
	end: number;
	exact: boolean;
}

/**
 * Find `quote` inside `haystack`, returning a span of the *original* haystack.
 *
 * Falls back to the longest agreeing run when the whole quote cannot be found, so a
 * citation still lands somewhere useful rather than nowhere. Returns null only when
 * even that run is too short to be evidence rather than coincidence.
 */
export function findSpan(quote: string, haystack: string): Span | null {
	if (!quote.trim() || !haystack.trim()) return null;

	const needle = fold(quote);
	const hay = fold(haystack);
	const trimmed = needle.text.trim();
	if (!trimmed) return null;

	const toOriginal = (
		start: number,
		size: number,
		exact: boolean,
	): Span | null => {
		const from = hay.origins[start];
		const to = hay.origins[Math.min(start + size, hay.origins.length) - 1];
		if (from === undefined || to === undefined) return null;
		return { start: from, end: to + 1, exact };
	};

	const at = hay.text.indexOf(trimmed);
	if (at !== -1) return toOriginal(at, trimmed.length, true);

	const run = longestCommonRun(trimmed, hay.text);
	const threshold = Math.max(30, Math.floor(trimmed.length * 0.6));
	if (run.size < threshold) return null;
	return toOriginal(run.start, run.size, false);
}
