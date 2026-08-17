import { AnimatePresence, motion } from "framer-motion";
import { FileText, MessageSquarePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { relativeTime } from "../lib/utils";
import type { Conversation } from "../types";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface ChatSidebarProps {
	conversations: Conversation[];
	selectedId: string | null;
	loading: boolean;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
}

export function ChatSidebar({
	conversations,
	selectedId,
	loading,
	onSelect,
	onCreate,
	onDelete,
}: ChatSidebarProps) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	return (
		<div className="flex h-full w-[264px] flex-shrink-0 flex-col border-r border-neutral-200 bg-neutral-0">
			<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3.5">
				<span className="text-[0.8125rem] font-semibold tracking-wide text-neutral-700 uppercase">
					Documents
				</span>
				<Button
					variant="ghost"
					size="icon"
					onClick={onCreate}
					title="New conversation"
					className="text-neutral-500 hover:bg-brand-50 hover:text-brand-700"
				>
					<MessageSquarePlus className="h-4 w-4" />
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-2">
					{loading && conversations.length === 0 && (
						<div className="space-y-2 p-2">
							{[1, 2, 3].map((i) => (
								<div key={i} className="animate-pulse space-y-1">
									<div className="h-4 w-3/4 rounded bg-neutral-100" />
									<div className="h-3 w-1/2 rounded bg-neutral-50" />
								</div>
							))}
						</div>
					)}

					{!loading && conversations.length === 0 && (
						<p className="px-3 py-8 text-center text-xs leading-relaxed text-neutral-400">
							Upload a document to begin
						</p>
					)}

					<AnimatePresence initial={false}>
						{conversations.map((conversation) => (
							<motion.div
								key={conversation.id}
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{ duration: 0.15 }}
							>
								{/* The delete control is a sibling of the row, not a child of it.
								    Nesting one button inside another is invalid HTML and leaves
								    delete unreachable by keyboard. */}
								<div
									className={`group relative mb-0.5 overflow-hidden rounded-lg transition-colors ${
										selectedId === conversation.id
											? "bg-brand-50"
											: "hover:bg-neutral-50"
									}`}
									onMouseEnter={() => setHoveredId(conversation.id)}
									onMouseLeave={() => setHoveredId(null)}
								>
									{/* A quiet accent bar rather than a heavier fill: the selected
									    document should be obvious at a glance without turning the
									    list into a stack of blocks. */}
									{selectedId === conversation.id && (
										<span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-500" />
									)}
									<button
										type="button"
										className="flex w-full items-start gap-2.5 px-3.5 py-2.5 pr-9 text-left"
										onClick={() => onSelect(conversation.id)}
									>
										{conversation.has_document && (
											<FileText
												className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${
													selectedId === conversation.id
														? "text-brand-600"
														: "text-neutral-400"
												}`}
											/>
										)}
										<div className="min-w-0 flex-1 overflow-hidden">
											<p
												className={`truncate text-sm ${
													selectedId === conversation.id
														? "font-semibold text-neutral-900"
														: "font-medium text-neutral-800"
												}`}
											>
												{conversation.title}
											</p>
											<p className="mt-0.5 text-xs text-neutral-400">
												{relativeTime(conversation.updated_at)}
											</p>
										</div>
									</button>

									<button
										type="button"
										className={`absolute top-2.5 right-2 rounded p-1 text-neutral-400 transition-opacity hover:bg-neutral-200 hover:text-danger-dark focus-visible:opacity-100 ${
											hoveredId === conversation.id
												? "opacity-100"
												: "opacity-0"
										}`}
										onClick={() => onDelete(conversation.id)}
										title="Delete conversation"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</ScrollArea>
		</div>
	);
}
