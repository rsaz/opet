import { Loader2, Paperclip, SendHorizontal } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ChatInputProps {
	onSend: (content: string) => void;
	onUpload: (file: File) => void;
	disabled: boolean;
	hasDocument: boolean;
	uploading?: boolean;
}

export function ChatInput({
	onSend,
	onUpload,
	disabled,
	hasDocument,
	uploading = false,
}: ChatInputProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleSend = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [value, disabled, onSend]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const handleInput = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onUpload(file);
			}
			// Reset the input so the same file can be selected again
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[onUpload],
	);

	return (
		<div className="border-t border-neutral-100 bg-neutral-0 px-6 py-4">
			<div className="mx-auto flex max-w-2xl items-end gap-2 rounded-xl border border-neutral-200 bg-neutral-0 px-3 py-2 shadow-page transition-colors focus-within:border-brand-300">
				<Tooltip>
					<TooltipTrigger asChild>
						<div>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8 flex-shrink-0"
								disabled={hasDocument || uploading}
								onClick={() => fileInputRef.current?.click()}
							>
								{uploading ? (
									<Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
								) : (
									<Paperclip className="h-4 w-4 text-neutral-500" />
								)}
							</Button>
						</div>
					</TooltipTrigger>
					{(hasDocument || uploading) && (
						<TooltipContent>
							{uploading ? "Reading document…" : "Document already uploaded"}
						</TooltipContent>
					)}
				</Tooltip>

				<input
					ref={fileInputRef}
					type="file"
					accept=".pdf"
					className="hidden"
					onChange={handleFileChange}
				/>

				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onInput={handleInput}
					onKeyDown={handleKeyDown}
					placeholder="Ask a question about your document..."
					rows={1}
					className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-neutral-900 placeholder-neutral-400 outline-none"
					disabled={disabled}
				/>

				{/* Solid once there is something to send: the one place in the chat
				    that should read as the primary action. */}
				<button
					type="button"
					className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
						value.trim() && !disabled
							? "bg-brand-500 text-neutral-0 hover:bg-brand-600"
							: "bg-neutral-100 text-neutral-300"
					}`}
					disabled={!value.trim() || disabled}
					onClick={handleSend}
					title="Send"
				>
					<SendHorizontal className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
