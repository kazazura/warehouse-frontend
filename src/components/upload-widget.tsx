import { cn } from "@/lib/utils";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";

type UploadWidgetProps = {
    value?: File | null;
    onFileChange?: (file: File | null) => void;
    maxSizeMb?: number;
    className?: string;
    disabled?: boolean;
};

const ACCEPTED_EXCEL_FILE_TYPES =
    ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

const UploadWidget = ({
    value = null,
    onFileChange,
    maxSizeMb = 5,
    className,
    disabled = false,
}: UploadWidgetProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateFile = (file: File) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const allowedExtensions = new Set(["xlsx", "xls", "csv"]);
        const maxSizeInBytes = maxSizeMb * 1024 * 1024;

        if (!extension || !allowedExtensions.has(extension)) {
            return "Only .xlsx, .xls, and .csv files are allowed.";
        }

        if (file.size > maxSizeInBytes) {
            return `File is too large. Max size is ${maxSizeMb}MB.`;
        }

        return null;
    };

    const selectFile = (file: File | null) => {
        if (!file) {
            if (inputRef.current) {
                inputRef.current.value = "";
            }
            setError(null);
            onFileChange?.(null);
            return;
        }

        const validationError = validateFile(file);

        if (validationError) {
            setError(validationError);
            onFileChange?.(null);
            if (inputRef.current) {
                inputRef.current.value = "";
            }
            return;
        }

        setError(null);
        onFileChange?.(file);

        // Allow selecting the same file again after remove/error by clearing native input value.
        if (inputRef.current) {
            inputRef.current.value = "";
        }
    };

    return (
        <div className={cn("space-y-3", className)}>
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_EXCEL_FILE_TYPES}
                disabled={disabled}
                onChange={(event) => {
                    const selectedFile = event.target.files?.[0] ?? null;
                    selectFile(selectedFile);
                }}
            />

            <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!disabled) {
                        setIsDragActive(true);
                    }
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragActive(false);
                    if (disabled) {
                        return;
                    }
                    const droppedFile = event.dataTransfer.files?.[0] ?? null;
                    selectFile(droppedFile);
                }}
                className={cn(
                    "w-full cursor-pointer rounded-lg border border-dashed px-4 py-7 text-center transition-colors",
                    "bg-muted/40 hover:bg-muted/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    isDragActive && "border-primary bg-primary/5",
                    error && "border-destructive/80 bg-destructive/5",
                    disabled && "cursor-not-allowed opacity-60"
                )}
            >
                <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="h-8 w-8 text-blue-500" />
                    <p className="text-sm font-semibold text-blue-600">Click to upload Excel</p>
                    <p className="text-xs text-muted-foreground">
                        XLSX, XLS, CSV up to {maxSizeMb}MB
                    </p>
                </div>
            </button>

            {value ? (
                <div className="flex items-center justify-between gap-2 overflow-hidden rounded-md border bg-background px-3 py-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                        <span className="truncate text-sm">{value.name}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => selectFile(null)}
                        className="inline-flex shrink-0 items-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Remove file"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
    );
};

export default UploadWidget;
