import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { useMemo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { Citation, Message } from "../types";
import { CitationChip, citationOrdinal } from "./CitationChip";

/**
 * Renders inline `[label](#cite-N)` anchors as citation chips.
 *
 * Streamdown turns ordinary markdown links into buttons and drops the href, so the
 * link element has to be overridden here or the citation loses the one thing that
 * makes it useful — which document position it points at.
 */
function citationComponents(citations: Citation[]) {
	const byOrdinal = new Map(citations.map((c) => [c.ordinal, c]));

	return {
		a: ({
			href,
			children,
		}: {
			href?: string;
			children?: React.ReactNode;
		}) => {
			const ordinal = citationOrdinal(href);
			if (ordinal === null) {
				return (
					<a href={href} target="_blank" rel="noreferrer">
						{children}
					</a>
				);
			}
			return (
				<CitationChip
					label={String(children)}
					citation={byOrdinal.get(ordinal)}
				/>
			);
		},
	};
}

interface MessageBubbleProps {
	message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
	const components = useMemo(
		() => citationComponents(message.citations ?? []),
		[message.citations],
	);

	if (message.role === "system") {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex justify-center py-2"
			>
				<p className="text-xs text-neutral-400">{message.content}</p>
			</motion.div>
		);
	}

	if (message.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex justify-end py-1.5"
			>
				<div className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-neutral-800">
						{message.content}
					</p>
				</div>
			</motion.div>
		);
	}

	// Assistant message
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 py-1.5"
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				<div className="prose">
					<Streamdown components={components}>{message.content}</Streamdown>
				</div>
			</div>
		</motion.div>
	);
}

interface StreamingBubbleProps {
	content: string;
	citations?: Citation[];
}

export function StreamingBubble({ content, citations }: StreamingBubbleProps) {
	const components = useMemo(
		() => citationComponents(citations ?? []),
		[citations],
	);

	return (
		<div className="flex gap-3 py-1.5">
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				{content ? (
					<div className="prose">
						<Streamdown mode="streaming" components={components}>
							{content}
						</Streamdown>
					</div>
				) : (
					<div className="flex items-center gap-1 py-2">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
				<span className="inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
			</div>
		</div>
	);
}
