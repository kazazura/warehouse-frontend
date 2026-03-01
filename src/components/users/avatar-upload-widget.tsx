import { cn } from "@/lib/utils";
import { Camera, ImageIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AvatarUploadWidgetProps = {
  value?: File | null;
  previewUrl?: string | null;
  onFileChange?: (file: File | null) => void;
  onClearPreview?: () => void;
  maxSizeMb?: number;
  className?: string;
  disabled?: boolean;
};

const ACCEPTED_IMAGE_TYPES =
  "image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp";

const AvatarUploadWidget = ({
  value = null,
  previewUrl = null,
  onFileChange,
  onClearPreview,
  maxSizeMb = 5,
  className,
  disabled = false,
}: AvatarUploadWidgetProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const validateFile = (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
    const maxSizeInBytes = maxSizeMb * 1024 * 1024;

    if (!extension || !allowedExtensions.has(extension)) {
      return "Only PNG, JPG, and WEBP files are allowed.";
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

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!value) {
      setFilePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(value);
    setFilePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [value]);

  const hasSelectedOrExistingImage = Boolean(value || previewUrl);
  const previewSource = filePreviewUrl || previewUrl;

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_IMAGE_TYPES}
        disabled={disabled}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0] ?? null;
          selectFile(selectedFile);
        }}
      />

      <div className="flex flex-col items-center gap-2">
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
            "group relative h-28 w-28 overflow-hidden rounded-full border border-dashed transition-colors",
            "border-border/70 bg-muted/30 hover:bg-muted/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            isDragActive && "border-primary bg-primary/5",
            error && "border-destructive/80 bg-destructive/5",
            disabled && "cursor-not-allowed opacity-60"
          )}
          aria-label="Upload avatar"
        >
          {previewSource ? (
            <>
              <img
                src={previewSource}
                alt="Avatar preview"
                className="h-full w-full object-cover transition-all duration-150 group-hover:brightness-75"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </span>
            </>
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1">
              <Camera className="h-7 w-7 text-primary" />
              <span className="text-[11px] font-semibold text-primary">Upload</span>
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>{value?.name ?? "PNG, JPG, WEBP up to " + maxSizeMb + "MB"}</span>
          {hasSelectedOrExistingImage ? (
            <button
              type="button"
              onClick={() => {
                selectFile(null);
                if (!value) {
                  onClearPreview?.();
                }
              }}
              disabled={disabled}
              className="inline-flex shrink-0 items-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Remove avatar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
};

export default AvatarUploadWidget;
