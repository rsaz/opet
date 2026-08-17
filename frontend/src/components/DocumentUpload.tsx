import { Loader2, Upload } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";

interface DocumentUploadProps {
	onUpload: (file: File) => void;
	uploading?: boolean;
}

export function DocumentUpload({
	onUpload,
	uploading = false,
}: DocumentUploadProps) {
	const [dragOver, setDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file && file.type === "application/pdf") {
				onUpload(file);
			}
		},
		[onUpload],
	);

	const handleClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onUpload(file);
			}
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[onUpload],
	);

	return (
		<button
			type="button"
			className={`w-full max-w-md cursor-pointer rounded-2xl border-2 border-dashed px-8 py-12 text-center transition-colors ${
				dragOver
					? "border-brand-500 bg-brand-50"
					: "border-neutral-200 bg-neutral-0 hover:border-brand-300 hover:bg-brand-50/50"
			}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onClick={handleClick}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf"
				className="hidden"
				onChange={handleFileChange}
			/>

			{uploading ? (
				<div className="flex flex-col items-center">
					<Loader2 className="mb-3 h-9 w-9 animate-spin text-brand-500" />
					<p className="text-sm font-medium text-neutral-600">
						Reading document…
					</p>
				</div>
			) : (
				<div className="flex flex-col items-center">
					<Upload className="mb-3 h-9 w-9 text-neutral-400" />
					<p className="text-sm font-medium text-neutral-700">
						Upload a PDF document
					</p>
					<p className="mt-1 text-xs text-neutral-400">
						Click, or drag and drop
					</p>
				</div>
			)}
		</button>
	);
}
