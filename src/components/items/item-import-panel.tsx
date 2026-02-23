import UploadWidget from "@/components/upload-widget";
import { Button } from "@/components/ui/button";

type ItemImportPanelProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  title?: string;
  description?: string;
  onCancel?: () => void;
  onContinue?: () => void;
  continueDisabled?: boolean;
  showFooter?: boolean;
};

export const ItemImportPanel = ({
  file,
  onFileChange,
  title = "Import Items from Excel",
  description = "Upload an Excel or CSV file to import multiple items.",
  onCancel,
  onContinue,
  continueDisabled = false,
  showFooter = true,
}: ItemImportPanelProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <UploadWidget value={file} onFileChange={onFileChange} />

      {showFooter ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onContinue} disabled={continueDisabled}>
            Continue
          </Button>
        </div>
      ) : null}
    </div>
  );
};
