import { FileSearch } from "lucide-react";
import { DocumentUpload } from "./DocumentUpload";

interface EmptyStateProps {
	onUpload: (file: File) => void;
	uploading?: boolean;
}

export function EmptyState({ onUpload, uploading }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center px-4">
			<div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500">
				<FileSearch className="h-7 w-7 text-neutral-0" />
			</div>
			<h2 className="mb-2 text-center text-lg font-semibold tracking-tight text-neutral-900">
				Start with a document
			</h2>
			<p className="mb-8 max-w-sm text-center text-sm leading-relaxed text-neutral-500">
				Drop in a lease, title report or environmental assessment. Every answer
				comes back with the clause it came from.
			</p>
			<DocumentUpload onUpload={onUpload} uploading={uploading} />
		</div>
	);
}
