import { useCallback, useMemo, useState } from "react";

export const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

export const useItemImport = () => {
  const [importFile, setImportFile] = useState<File | null>(null);

  const clearImportFile = useCallback(() => {
    setImportFile(null);
  }, []);

  const handleDialogOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        clearImportFile();
      }
    },
    [clearImportFile]
  );

  const fileSummary = useMemo(() => {
    if (!importFile) return null;
    return {
      name: importFile.name,
      sizeLabel: formatBytes(importFile.size),
      type: importFile.type || "unknown",
    };
  }, [importFile]);

  return {
    importFile,
    setImportFile,
    clearImportFile,
    handleDialogOpenChange,
    hasImportFile: Boolean(importFile),
    fileSummary,
  };
};
