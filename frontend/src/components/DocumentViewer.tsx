import { FileText, Loader2 } from "lucide-react";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import { findSpan } from "../lib/text-match";
import type { Citation, Document } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 460;
/** A4's aspect ratio is exactly root two — used to size a page's placeholder before
    it renders, so the scroll height does not jump around as pages load. */
const PAGE_ASPECT = Math.SQRT2;
/** How many pages either side of the one in view to render eagerly. */
const RENDER_WINDOW = 2;

interface Band {
	top: number;
	left: number;
	width: number;
	height: number;
}

interface DocumentViewerProps {
	document: Document | null;
	/** The citation to reveal. Re-selecting the same one scrolls to it again. */
	activeCitation: Citation | null;
}

export function DocumentViewer({
	document,
	activeCitation,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [visiblePage, setVisiblePage] = useState(1);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	/** Which characters of which text items to mark on the cited page. */
	const [highlight, setHighlight] = useState<Map<number, [number, number]>>(
		new Map(),
	);
	/** Set when the quote could not be located and the whole page is flagged instead. */
	const [pageOnlyHighlight, setPageOnlyHighlight] = useState(false);
	/** The highlight as drawn: one band per line of the cited passage. */
	const [bands, setBands] = useState<Band[]>([]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	/**
	 * Text items per page, kept as they load.
	 *
	 * react-pdf reports a page's text content once, on first load. Recomputing the
	 * highlight for a second citation on an already-rendered page therefore cannot
	 * wait for that callback to fire again — the items have to be remembered.
	 */
	const textItems = useRef<Map<number, TextItem[]>>(new Map());

	const citedPage = activeCitation?.page ?? null;

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);

			const startX = e.clientX;
			const startWidth = width;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = startX - moveEvent.clientX;
				setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)));
			};

			const handleMouseUp = () => {
				setDragging(false);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[width],
	);

	// Track which page is in view, so the window of eagerly-rendered pages follows
	// the reader and the page indicator stays honest.
	const handleScroll = useCallback(() => {
		const container = scrollRef.current;
		if (!container) return;
		const middle = container.scrollTop + container.clientHeight / 2;
		let closest = 1;
		for (const [page, element] of pageRefs.current) {
			if (element.offsetTop <= middle) closest = page;
		}
		setVisiblePage(closest);
	}, []);

	/**
	 * Work out which characters of which text items to mark.
	 *
	 * The passage was already located server-side in PyMuPDF's extraction, but the
	 * highlight is drawn over pdf.js's text layer, which splits runs differently — so
	 * the quote is searched for again here, against the page as the browser sees it.
	 */
	const locateQuote = useCallback((citation: Citation) => {
		const items = textItems.current.get(citation.page);
		const quote = citation.matched_text ?? citation.quote;
		if (!items || !quote) return;

		const offsets: number[] = [];
		let joined = "";
		for (const item of items) {
			offsets.push(joined.length);
			joined += `${item.str} `;
		}

		const span = findSpan(quote, joined);
		if (!span) {
			// Never dead-end: the reader is still taken to the right page.
			setPageOnlyHighlight(true);
			return;
		}

		const ranges = new Map<number, [number, number]>();
		items.forEach((item, index) => {
			const start = offsets[index] ?? 0;
			const end = start + item.str.length;
			if (end <= span.start || start >= span.end) return;
			ranges.set(index, [
				Math.max(0, span.start - start),
				Math.min(item.str.length, span.end - start),
			]);
		});
		setHighlight(ranges);
	}, []);

	// A new selection clears the previous highlight, scrolls its page into view and
	// locates the passage. Keyed on the citation object rather than the page number,
	// so clicking the same chip twice — or two chips on one page — still re-locates.
	useEffect(() => {
		setHighlight(new Map());
		setPageOnlyHighlight(false);
		setBands([]);
		if (!activeCitation) return;
		pageRefs.current
			.get(activeCitation.page)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
		locateQuote(activeCitation);
	}, [activeCitation, locateQuote]);

	const handleTextLoaded = useCallback(
		(page: number, items: TextItem[]) => {
			textItems.current.set(page, items);
			// The citation may have been clicked before this page had loaded its text.
			if (activeCitation?.page === page) locateQuote(activeCitation);
		},
		[activeCitation, locateQuote],
	);

	/**
	 * Turn the marked characters into one band per line.
	 *
	 * Justified text reaches the text layer as a separate span per word, so painting
	 * the marks themselves comes out striped. Measuring them and merging by line
	 * draws the single continuous stroke a highlighter would leave.
	 */
	const measureBands = useCallback(() => {
		const container = citedPage ? pageRefs.current.get(citedPage) : null;
		if (!container) return;

		const anchors = Array.from(
			container.querySelectorAll<HTMLElement>("mark.citation-anchor"),
		);
		if (anchors.length === 0) {
			setBands([]);
			return;
		}

		const origin = container.getBoundingClientRect();
		const boxes = anchors
			.map((anchor) => anchor.getBoundingClientRect())
			.filter((rect) => rect.width > 0.5 && rect.height > 0.5)
			.map((rect) => ({
				top: rect.top - origin.top,
				left: rect.left - origin.left,
				right: rect.right - origin.left,
				bottom: rect.bottom - origin.top,
			}))
			.sort((a, b) => a.top - b.top || a.left - b.left);

		const lines: typeof boxes = [];
		for (const box of boxes) {
			const current = lines[lines.length - 1];
			const sameLine =
				current &&
				Math.abs(box.top - current.top) < (box.bottom - box.top) * 0.7;
			if (sameLine && current) {
				current.top = Math.min(current.top, box.top);
				current.left = Math.min(current.left, box.left);
				current.right = Math.max(current.right, box.right);
				current.bottom = Math.max(current.bottom, box.bottom);
			} else {
				lines.push({ ...box });
			}
		}

		setBands(
			lines.map((line) => ({
				top: line.top - 1,
				left: line.left - 2,
				width: line.right - line.left + 4,
				height: line.bottom - line.top + 2,
			})),
		);
	}, [citedPage]);

	// Measure after the marks have been laid out. Two frames, because the first only
	// guarantees the marks exist — the second that the text layer has been positioned.
	useEffect(() => {
		if (highlight.size === 0) {
			setBands([]);
			return;
		}
		let inner = 0;
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(measureBands);
		});
		return () => {
			cancelAnimationFrame(outer);
			cancelAnimationFrame(inner);
		};
	}, [highlight, measureBands]);

	const renderMarkedText = useCallback(
		({ str, itemIndex }: { str: string; itemIndex: number }) => {
			const range = highlight.get(itemIndex);
			if (!range) return escapeHtml(str);
			const [from, to] = range;
			return `${escapeHtml(str.slice(0, from))}<mark class="citation-anchor">${escapeHtml(
				str.slice(from, to),
			)}</mark>${escapeHtml(str.slice(to))}`;
		},
		[highlight],
	);

	const pdfPageWidth = width - 48; // account for px-4 padding on each side
	const placeholderHeight = Math.round(pdfPageWidth * PAGE_ASPECT);

	const renderedPages = useMemo(() => {
		const pages = new Set<number>();
		for (
			let page = visiblePage - RENDER_WINDOW;
			page <= visiblePage + RENDER_WINDOW;
			page++
		) {
			if (page >= 1 && page <= numPages) pages.add(page);
		}
		// Always render the cited page, even before the scroll reaches it.
		if (citedPage) pages.add(citedPage);
		return pages;
	}, [visiblePage, numPages, citedPage]);

	if (!document) {
		return (
			<div
				style={{ width }}
				className="flex h-full flex-shrink-0 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50"
			>
				<FileText className="mb-3 h-10 w-10 text-neutral-300" />
				<p className="text-sm text-neutral-400">No document uploaded</p>
			</div>
		);
	}

	return (
		<div
			style={{ width }}
			className="relative flex h-full flex-shrink-0 flex-col border-l border-neutral-200 bg-white"
		>
			{/* Resize handle */}
			<div
				className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-neutral-300 ${
					dragging ? "bg-neutral-400" : ""
				}`}
				onMouseDown={handleMouseDown}
			/>

			{/* Header */}
			<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-neutral-800">
						{document.filename}
					</p>
					<p className="text-xs text-neutral-400">
						{numPages > 0
							? `Page ${visiblePage} of ${numPages}`
							: `${document.page_count} page${document.page_count !== 1 ? "s" : ""}`}
					</p>
				</div>
			</div>

			{/* PDF content */}
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="flex-1 overflow-y-auto bg-neutral-100 p-4"
			>
				{pdfError && (
					<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{pdfError}
					</div>
				)}

				<PDFDocument
					file={getDocumentUrl(document.id)}
					onLoadSuccess={({ numPages: pages }) => {
						setNumPages(pages);
						setPdfError(null);
					}}
					onLoadError={(error) => {
						setPdfError(`Failed to load PDF: ${error.message}`);
					}}
					loading={
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
						</div>
					}
				>
					{Array.from({ length: numPages }, (_, index) => index + 1).map(
						(page) => {
							const isCited = page === citedPage;
							return (
								<div
									key={page}
									ref={(element) => {
										if (element) pageRefs.current.set(page, element);
										else pageRefs.current.delete(page);
									}}
									className={`relative mb-3 scroll-mt-4 bg-white shadow-sm ring-1 transition-all ${
										isCited && pageOnlyHighlight
											? "ring-2 ring-amber-400"
											: "ring-neutral-200"
									}`}
								>
									{isCited &&
										bands.map((band) => (
											<div
												key={`${band.top}-${band.left}`}
												className="citation-band"
												style={band}
											/>
										))}
									{renderedPages.has(page) ? (
										<Page
											pageNumber={page}
											width={pdfPageWidth}
											onGetTextSuccess={({ items }) =>
												handleTextLoaded(page, items as TextItem[])
											}
											customTextRenderer={
												isCited ? renderMarkedText : undefined
											}
											onRenderTextLayerSuccess={
												isCited ? measureBands : undefined
											}
											loading={
												<div
													style={{ height: placeholderHeight }}
													className="flex items-center justify-center"
												>
													<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
												</div>
											}
										/>
									) : (
										<div
											style={{ height: placeholderHeight }}
											className="flex items-center justify-center text-xs text-neutral-300"
										>
											{page}
										</div>
									)}
								</div>
							);
						},
					)}
				</PDFDocument>
			</div>
		</div>
	);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
