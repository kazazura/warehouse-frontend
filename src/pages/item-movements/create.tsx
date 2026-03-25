import { CreateView, CreateViewHeader } from "@/components/refine-ui/views/create-view";
import UploadWidget from "@/components/upload-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type MaterialChargeTicketHeader = {
    district: string;
    department: string;
    requestNumber: string;
    requestDate: string;
    requisitioner: string;
    releaseDate: string;
    mctRelNumber: string;
    woNumber: string;
    joNumber: string;
    soNumber: string;
    purpose: string;
    notes: string;
};

type MaterialChargeTicketItem = {
    id: string;
    item_code: string;
    particulars: string;
    unit: string;
    unit_cost: number | null;
    qty: number | null;
    total_cost: number | null;
    purpose: string;
    remarks: string;
    notes: string;
};

const EMPTY_HEADER: MaterialChargeTicketHeader = {
    district: "",
    department: "",
    requestNumber: "",
    requestDate: "",
    requisitioner: "",
    releaseDate: "",
    mctRelNumber: "",
    woNumber: "",
    joNumber: "",
    soNumber: "",
    purpose: "",
    notes: "",
};

const HEADER_KEY_MAP: Record<string, keyof MaterialChargeTicketHeader> = {
    district: "district",
    department: "department",
    "request#": "requestNumber",
    "requestno": "requestNumber",
    reqno: "requestNumber",
    reqdate: "requestDate",
    "requestdate": "requestDate",
    "req.date": "requestDate",
    requisitioner: "requisitioner",
    reldate: "releaseDate",
    "releasedate": "releaseDate",
    "rel.date": "releaseDate",
    "mct/rel#": "mctRelNumber",
    "mctrel#": "mctRelNumber",
    "mctrelno": "mctRelNumber",
    "mct/relno": "mctRelNumber",
    "wo#": "woNumber",
    "jo#": "joNumber",
    "so#": "soNumber",
    purpose: "purpose",
    notes: "notes",
    "notes/sr#": "notes",
    "sr#": "notes",
};

const ITEM_KEY_MAP: Record<string, keyof MaterialChargeTicketItem> = {
    itemcode: "item_code",
    "itemcode#": "item_code",
    item: "item_code",
    code: "item_code",
    particulars: "particulars",
    description: "particulars",
    unit: "unit",
    type: "unit",
    uom: "unit",
    unitcost: "unit_cost",
    "unitcost(php)": "unit_cost",
    qty: "qty",
    quantity: "qty",
    totalcost: "total_cost",
    amount: "total_cost",
    total: "total_cost",
    purpose: "purpose",
    remarks: "notes",
    notes: "notes",
    "notes/sr#": "notes",
    "sr#": "notes",

};

const parseNumber = (value: string) => {
    if (!value) return null;
    const sanitized = value.replace(/[,\s]/g, "").replace(/[^0-9.+-]/g, "");
    if (!sanitized) return null;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCell = (value: string) =>
    value
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9#/.:_-]/g, "");

const normalizeRows = (rows: Array<Array<string | number | null | undefined>>) =>
    rows
        .map((row) => row.map((cell) => String(cell ?? "").trim()))
        .filter((row) => row.some((cell) => cell.length > 0));

const parseLabelValuePairs = (rows: string[][]) => {
    const header: MaterialChargeTicketHeader = { ...EMPTY_HEADER };

    rows.forEach((row) => {
        row.forEach((cell, index) => {
            if (!cell) return;
            const trimmed = cell.trim();
            const normalized = normalizeCell(trimmed);

            if (normalized.includes(":") && !normalized.endsWith(":")) {
                const [label, ...valueParts] = trimmed.split(":");
                const labelKey = normalizeCell(label);
                const mappedKey = HEADER_KEY_MAP[labelKey];
                if (!mappedKey) return;
                const inlineValue = valueParts.join(":").trim();
                if (inlineValue && !header[mappedKey]) {
                    header[mappedKey] = inlineValue;
                }
                return;
            }

            if (!normalized.endsWith(":")) return;
            const labelKey = normalized.replace(/:$/, "");
            const mappedKey = HEADER_KEY_MAP[labelKey];
            if (!mappedKey) return;

            for (let next = index + 1; next < row.length; next += 1) {
                const value = row[next]?.trim();
                if (!value) continue;
                const normalizedValue = normalizeCell(value);
                if (
                    normalizedValue.endsWith(":") ||
                    HEADER_KEY_MAP[normalizedValue] ||
                    (normalizedValue.includes(":") &&
                        HEADER_KEY_MAP[normalizeCell(value.split(":")[0] ?? "")])
                ) {
                    continue;
                }
                if (!header[mappedKey]) {
                    header[mappedKey] = value;
                }
                break;
            }
        });
    });

    return header;
};

const findItemsHeaderRow = (rows: string[][]) => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const normalizedRow = row.map((cell) => normalizeCell(cell));
        const hasItemCode = normalizedRow.some((cell) => cell === "itemcode");
        const hasParticulars = normalizedRow.some((cell) => cell === "particulars" || cell === "description");
        const hasUnitCost = normalizedRow.some((cell) => cell === "unitcost");
        const hasQty = normalizedRow.some((cell) => cell === "qty" || cell === "quantity");

        if (hasItemCode && hasParticulars && hasUnitCost && hasQty) {
            return { rowIndex, row, normalizedRow };
        }
    }
    return null;
};

const parseItemsFromTable = (rows: string[][]) => {
    const headerInfo = findItemsHeaderRow(rows);
    if (!headerInfo) return [];

    const { rowIndex, row } = headerInfo;
    const headerMap = row.map((cell) => {
        const normalized = normalizeCell(cell);
        return ITEM_KEY_MAP[normalized] ?? null;
    });

    const items: MaterialChargeTicketItem[] = [];

    for (let i = rowIndex + 1; i < rows.length; i += 1) {
        const currentRow = rows[i];
        const joined = currentRow.join(" ").toLowerCase();

        if (!currentRow.some((cell) => cell.trim().length > 0)) {
            continue;
        }

        if (joined.includes("total") || joined.includes("nothingfollows") || joined.includes("purpose")) {
            break;
        }

        const item: MaterialChargeTicketItem = {
            id: `mct-row-${items.length + 1}`,
            item_code: "",
            particulars: "",
            unit: "",
            unit_cost: null,
            qty: null,
            total_cost: null,
            purpose: "",
            remarks: "",
            notes: "",
        };

        let hasItemValue = false;

        currentRow.forEach((cell, colIndex) => {
            const key = headerMap[colIndex];
            if (!key) return;
            const value = cell.trim();
            if (!value) return;

            if (key === "unit_cost" || key === "qty" || key === "total_cost") {
                item[key] = parseNumber(value);
            } else {
                item[key] = value;
            }
            hasItemValue = true;
        });

        if (hasItemValue && (item.item_code || item.particulars)) {
            items.push(item);
        }
    }

    return items;
};

const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let current: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                field += '"';
                i += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
            continue;
        }

        if (char === ",") {
            current.push(field);
            field = "";
            continue;
        }

        if (char === "\n") {
            current.push(field);
            rows.push(current);
            current = [];
            field = "";
            continue;
        }

        if (char === "\r") {
            continue;
        }

        field += char;
    }

    if (field.length > 0 || current.length > 0) {
        current.push(field);
        rows.push(current);
    }

    return rows;
};

const parseRowsToTicket = (rows: string[][]) => {
    if (!rows.length) {
        return { header: { ...EMPTY_HEADER }, items: [] };
    }

    const header = parseLabelValuePairs(rows);
    const items = parseItemsFromTable(rows);

    return { header, items };
};

const formatDecimal = (value: number | null) => {
    if (value == null || Number.isNaN(value)) return "-";
    return value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const sumNumbers = (values: Array<number | null>) =>
    values.reduce<number>((acc, value) => (value == null || Number.isNaN(value) ? acc : acc + value), 0);

const IssueReturnCreatePage = () => {
    const [file, setFile] = useState<File | null>(null);
    const [ticketHeader, setTicketHeader] = useState<MaterialChargeTicketHeader | null>(null);
    const [ticketItems, setTicketItems] = useState<MaterialChargeTicketItem[]>([]);
    const [parseError, setParseError] = useState<string | null>(null);
    const [parseStatus, setParseStatus] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setTicketHeader(null);
            setTicketItems([]);
            setParseError(null);
            setParseStatus(null);
            return;
        }

        const parseFile = async () => {
            setParseError(null);
            setParseStatus("Parsing file...");

            try {
                const extension = file.name.split(".").pop()?.toLowerCase();
                if (extension === "csv") {
                    const text = await file.text();
                    const rows = parseCsvRows(text);
                    const normalizedRows = normalizeRows(rows);
                    const { header, items } = parseRowsToTicket(normalizedRows);
                    setTicketHeader(header);
                    setTicketItems(items);
                    setParseStatus(`Parsed ${items.length} item${items.length === 1 ? "" : "s"}.`);
                    return;
                }

                if (extension === "xlsx" || extension === "xls") {
                    const buffer = await file.arrayBuffer();
                    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
                    const [sheetName] = workbook.SheetNames;
                    if (!sheetName) {
                        throw new Error("No sheets found in the workbook.");
                    }
                    const sheet = workbook.Sheets[sheetName];
                    const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as Array<
                        Array<string | number | null>
                    >;
                    const normalizedRows = normalizeRows(sheetRows);
                    const { header, items } = parseRowsToTicket(normalizedRows);
                    setTicketHeader(header);
                    setTicketItems(items);
                    setParseStatus(`Parsed ${items.length} item${items.length === 1 ? "" : "s"}.`);
                    return;
                }

                throw new Error("Unsupported file format. Please upload a CSV or Excel file.");
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unable to parse file.";
                setParseError(message);
                setTicketHeader(null);
                setTicketItems([]);
                setParseStatus(null);
            }
        };

        void parseFile();
    }, [file]);

    const summaryHeader = useMemo(() => ticketHeader ?? EMPTY_HEADER, [ticketHeader]);
    const totalQty = useMemo(() => sumNumbers(ticketItems.map((item) => item.qty)), [ticketItems]);
    const totalCost = useMemo(() => sumNumbers(ticketItems.map((item) => item.total_cost)), [ticketItems]);

    return (
        <CreateView className="item-view">
            <CreateViewHeader title="MCT" />
            <div className="my-4 flex items-center">
                <Card className="w-full max-w-5xl mx-auto item-form-card gap-0 overflow-hidden border-border/80 shadow-sm">
                    <CardHeader className="border-b">
                        <CardTitle>Material Charge Ticket</CardTitle>
                        <CardDescription>
                            Upload an Excel or CSV file to extract Material Charge Ticket details.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5 space-y-5">
                        <UploadWidget value={file} onFileChange={setFile} />
                        {parseStatus ? <p className="text-sm text-muted-foreground">{parseStatus}</p> : null}
                        {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Ticket Details
                            </p>
                            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                <div className="grid gap-3">
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">District</span>
                                        <span className="font-medium">{summaryHeader.district || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">Department</span>
                                        <span className="font-medium">{summaryHeader.department || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">Request #</span>
                                        <span className="font-medium">{summaryHeader.requestNumber || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">Req. Date</span>
                                        <span className="font-medium">{summaryHeader.requestDate || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">Requisitioner</span>
                                        <span className="font-medium">{summaryHeader.requisitioner || "-"}</span>
                                    </div>
                                </div>

                                <div className="grid gap-3">
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">Rel. Date</span>
                                        <span className="font-medium">{summaryHeader.releaseDate || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">MCT/Rel #</span>
                                        <span className="font-medium">{summaryHeader.mctRelNumber || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">WO #</span>
                                        <span className="font-medium">{summaryHeader.woNumber || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">JO #</span>
                                        <span className="font-medium">{summaryHeader.joNumber || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">SO #</span>
                                        <span className="font-medium">{summaryHeader.soNumber || "-"}</span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Ticket Items
                            </p>
                            <div className="overflow-x-auto rounded-md border bg-background">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12 text-center">#</TableHead>
                                            <TableHead>Item Code</TableHead>
                                            <TableHead>Particulars</TableHead>
                                            <TableHead>Unit</TableHead>
                                            <TableHead className="text-right">Unit Cost</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Total Cost</TableHead>
                                            <TableHead>Remarks</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {ticketItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                                                    No item rows detected yet.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            ticketItems.map((item, index) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                                                    <TableCell className="font-medium">{item.item_code || "-"}</TableCell>
                                                    <TableCell className="min-w-[220px] whitespace-normal">{item.particulars || "-"}</TableCell>
                                                    <TableCell>{item.unit || "-"}</TableCell>
                                                    <TableCell className="text-right">{formatDecimal(item.unit_cost)}</TableCell>
                                                    <TableCell className="text-right">{item.qty ?? "-"}</TableCell>
                                                    <TableCell className="text-right">{formatDecimal(item.total_cost)}</TableCell>
                                                    <TableCell className="min-w-[160px] whitespace-normal">{item.notes || "-"}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                        {ticketItems.length > 0 ? (
                                            <TableRow>
                                                <TableCell className="text-center text-sm font-semibold text-muted-foreground">-</TableCell>
                                                <TableCell />
                                                <TableCell />
                                                <TableCell />
                                                <TableCell className="text-right text-sm font-semibold">
                                                    Total:
                                                </TableCell>
                                                <TableCell className="text-right text-sm font-semibold">
                                                    {Number.isFinite(totalQty) ? totalQty : "-"}
                                                </TableCell>
                                                <TableCell className="text-right text-sm font-semibold">
                                                    {formatDecimal(totalCost)}
                                                </TableCell>
                                                <TableCell />
                                            </TableRow>
                                        ) : null}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="grid gap-4">
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Purpose</p>
                                    <Textarea value={summaryHeader.purpose} readOnly className="min-h-24 bg-background" />
                                </div>
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Notes / SR #</p>
                                    <Textarea value={summaryHeader.notes} readOnly className="h-24 resize-y overflow-auto bg-background" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </CreateView>
    );
};

export default IssueReturnCreatePage;
