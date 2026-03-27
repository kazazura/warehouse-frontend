import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { Search, Plus, FileSpreadsheet, Pencil, Loader2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { MONTHS_OPTIONS } from "@/constants";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { DataTableFilterCombobox } from "@/components/refine-ui/data-table/data-table-filter";
import { DataTableSorter } from "@/components/refine-ui/data-table/data-table-sorter";
import { useTable } from "@refinedev/react-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { CrudFilters, useGetIdentity, useInvalidate, useList, useNotification, useOne } from "@refinedev/core";
import { ItemInventoryRow, UserRow } from "@/types";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useItemImport } from "@/hooks/use-item-import";
import { ItemImportPanel } from "@/components/items/item-import-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useUpdate } from "@refinedev/core";
import { supabaseClient } from "@/providers/supabase-client";

const MONTH_TO_NUMBER: Record<string, number> = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
};

const ITEMS_LIST_FILTERS_STORAGE_KEY = "items-list-filters";
const ITEMS_LIST_FILTERS_USER_KEY = "items-list-filters-user";

type ItemsListPersistedFilters = {
    selectedMonth: string;
    selectedYear: string;
    searchQuery: string;
};

type ItemInventoryRowWithId = ItemInventoryRow & {
    item_id?: number | string | null;
    inventory_item_id?: number | string | null;
};

const isUuidLike = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const getDefaultMonth = () => new Date().toLocaleString("en-US", { month: "long" });
const getDefaultYear = () => String(new Date().getFullYear());

const readPersistedItemsFilters = (storageKey: string): ItemsListPersistedFilters | null => {
    if (typeof window === "undefined") return null;

    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<ItemsListPersistedFilters>;
        const monthValues = new Set(["all", ...MONTHS_OPTIONS.map((month) => month.value)]);
        const selectedMonth = monthValues.has(parsed.selectedMonth ?? "")
            ? (parsed.selectedMonth as string)
            : getDefaultMonth();
        const selectedYear =
            typeof parsed.selectedYear === "string" && parsed.selectedYear.trim()
                ? parsed.selectedYear
                : getDefaultYear();
        const searchQuery = typeof parsed.searchQuery === "string" ? parsed.searchQuery : "";

        return { selectedMonth, selectedYear, searchQuery };
    } catch {
        return null;
    }
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message);
    }
    return "Unknown error";
};

const buildDateFilters = (
    selectedYear: string,
    selectedMonth: string
): CrudFilters => {
    const filters: CrudFilters = [];

    if (selectedYear !== "all") {
        filters.push({ field: "year", operator: "eq", value: Number(selectedYear) });
    }

    if (selectedMonth !== "all") {
        const monthNumber = MONTH_TO_NUMBER[selectedMonth];
        if (monthNumber) {
            filters.push({ field: "month", operator: "eq", value: monthNumber });
        }
    }

    return filters;
};

const ItemList = () => {
    const initialFilters =
        typeof window === "undefined"
            ? null
            : readPersistedItemsFilters(ITEMS_LIST_FILTERS_STORAGE_KEY);
    const [searchQuery, setSearchQuery] = useState(
        initialFilters?.searchQuery ?? ""
    );
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(() =>
        initialFilters?.selectedMonth ?? getDefaultMonth()
    );
    const [selectedYear, setSelectedYear] = useState<string>(
        initialFilters?.selectedYear ?? getDefaultYear()
    );
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ItemInventoryRowWithId | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | number | null>(null);
    const [editItemCode, setEditItemCode] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editType, setEditType] = useState("");
    const [editBufferStock, setEditBufferStock] = useState<number | "">("");
    const [editUnitCost, setEditUnitCost] = useState<number | "">("");
    const [editStartingQty, setEditStartingQty] = useState<number | "">("");
    const [editEndingQty, setEditEndingQty] = useState<number | "">("");
    const [isRolloverRunning, setIsRolloverRunning] = useState(false);
    const { importFile, setImportFile, handleDialogOpenChange, hasImportFile } =
        useItemImport();
    const { open } = useNotification();
    const invalidate = useInvalidate();
    const { data: identity } = useGetIdentity<{ id?: string | number; role?: string }>();
    const identityId = identity?.id ? String(identity.id) : "";
    const { result: userResult } = useOne<UserRow>({
        resource: "users",
        id: identityId,
        queryOptions: {
            enabled: Boolean(identityId),
        },
    });
    const normalizedRole = (userResult?.role ?? identity?.role ?? "user").toLowerCase();
    const isAdmin = normalizedRole === "admin";
    const { mutateAsync: updateRecord, mutation } = useUpdate({
        successNotification: false,
    });
    const isUpdatingItem = mutation.isPending;

    const openEditDialog = useCallback((item: ItemInventoryRowWithId) => {
        const fallbackId = item.id != null && isUuidLike(String(item.id)) ? item.id : null;
        const resolvedId = item.item_id ?? item.inventory_item_id ?? fallbackId;
        setEditingItem(item);
        setEditingItemId(resolvedId);
        setEditItemCode(item.item_code ?? "");
        setEditDescription(item.description ?? "");
        setEditType(item.type ?? "");
        setEditBufferStock(item.buffer_stock ?? 0);
        setEditUnitCost(item.unit_cost ?? 0);
        setEditStartingQty(item.starting_qty ?? 0);
        setEditEndingQty(item.ending_qty ?? 0);
        setEditDialogOpen(true);
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (!editingItemId || !editingItem) {
            open?.({
                type: "error",
                message: "Update failed",
                description: "Missing item details for this row.",
            });
            return;
        }

        try {
            await updateRecord({
                resource: "items",
                id: editingItemId,
                values: {
                    item_code: editItemCode.trim(),
                    description: editDescription.trim(),
                    type: editType.trim(),
                },
            });
        } catch (error) {
            open?.({
                type: "error",
                message: "Item update failed",
                description: getErrorMessage(error),
            });
            return;
        }

        try {
            if (editingItem.month && editingItem.year) {
                const nextStartingQty = editStartingQty === "" ? null : Number(editStartingQty);
                const nextEndingQty = editEndingQty === "" ? null : Number(editEndingQty);
                const nextBufferStock = editBufferStock === "" ? null : Number(editBufferStock);
                const nextUnitCost = editUnitCost === "" ? null : Number(editUnitCost);
                const { error } = await supabaseClient
                    .from("inventory_records")
                    .update({
                        starting_qty: nextStartingQty,
                        ending_qty: nextEndingQty,
                        buffer_stock: nextBufferStock,
                        unit_cost: nextUnitCost,
                    })
                    .eq("month", editingItem.month)
                    .eq("year", editingItem.year)
                    .eq("item_id", editingItemId);

                if (error) {
                    throw error;
                }
            }

            open?.({
                type: "success",
                message: "Item updated",
                description: "Item details have been saved.",
            });

            setEditDialogOpen(false);
            setEditingItem(null);
            setEditingItemId(null);
            itemTable.refineCore.setCurrentPage(1);
            itemTable.refineCore.tableQuery.refetch();
            invalidate({
                resource: "items_inventory_all",
                invalidates: ["list"],
            });
            invalidate({
                resource: "inventory_records",
                invalidates: ["list"],
            });
            invalidate({
                resource: "items",
                invalidates: ["list"],
            });
            invalidate({
                resource: "items_inventory_all",
                invalidates: ["list"],
            });
        } catch (error) {
            open?.({
                type: "error",
                message: "Quantity update failed",
                description: getErrorMessage(error),
            });
        }
    }, [
        editBufferStock,
        editDescription,
        editItemCode,
        editStartingQty,
        editEndingQty,
        editType,
        editUnitCost,
        editingItem,
        editingItemId,
        open,
        updateRecord,
    ]);

    const handleCopyItemCode = useCallback(
        async (itemCode: string) => {
            try {
                await navigator.clipboard.writeText(itemCode);
                open?.({
                    type: "success",
                    message: "Item code copied",
                    description: itemCode,
                });
            } catch {
                open?.({
                    type: "error",
                    message: "Copy failed",
                    description: "Could not copy item code to clipboard.",
                });
            }
        },
        [open]
    );

    const { result: yearsResult } = useList<ItemInventoryRowWithId>({
        resource: "items_inventory_all",
        pagination: { mode: "off" },
        filters: [],
        sorters: [{ field: "year", order: "desc" }],
    });

    const yearTabs = useMemo(() => {
        return (yearsResult.data ?? [])
            .map((row) => row.year)
            .filter((year): year is number => typeof year === "number")
            .filter((year, index, array) => array.indexOf(year) === index)
            .sort((a, b) => b - a);
    }, [yearsResult.data]);

    const typeOptions = useMemo(() => {
        return (yearsResult.data ?? [])
            .map((row) => row.type?.trim())
            .filter((type): type is string => Boolean(type))
            .filter((type, index, array) => array.indexOf(type) === index)
            .sort((a, b) => a.localeCompare(b));
    }, [yearsResult.data]);

    const itemTable = useTable<ItemInventoryRowWithId>({
        columns: useMemo<ColumnDef<ItemInventoryRowWithId>[]>(
            () => [
                {
                    id: "item_code",
                    accessorKey: "item_code",
                    size: 120,
                    header: ({ column }) => (
                        <div className="flex items-center gap-1">
                            <p className="column-title ml-2 whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                                Item Code
                            </p>
                            <DataTableSorter column={column} title={undefined} />
                        </div>
                    ),
                    cell: ({ getValue }) => {
                        const itemCode = getValue<string>() ?? "-";
                        return (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        className="cursor-pointer select-none"
                                        onClick={() => void handleCopyItemCode(itemCode)}
                                    >
                                        {itemCode}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="w-max max-w-[min(90vw,48rem)] whitespace-normal break-words">
                                    {`Click to copy: ${itemCode}`}
                                </TooltipContent>
                            </Tooltip>
                        );
                    },
                },
                {
                    id: "description",
                    accessorKey: "description",
                    size: 400,
                    header: () => (
                        <p className="column-title whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                            Description
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="whitespace-normal break-words">{getValue<string>()}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    id: "type",
                    accessorKey: "type",
                    size: 75,
                    header: ({ column, table }) => (
                        <div className="column-title">
                            <span className="whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">UOM</span>
                            <DataTableFilterCombobox
                                column={column}
                                table={table}
                                options={typeOptions.map((type) => ({ label: type, value: type }))}
                                    placeholder="UOM"
                                operators={["eq"]}
                            />
                        </div>
                    ),
                    cell: ({ getValue }) => (
                        <Badge variant="secondary">{getValue<string>()}</Badge>
                    ),
                    filterFn: "includesString",
                },
                {
                    id: "unit_cost",
                    accessorKey: "unit_cost",
                    size: 100,
                    header: () => (
                        <p className="column-title whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                            Unit Cost
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="text-foreground">
                            {(() => {
                                const value = getValue<number | null>();
                                if (value == null || Number.isNaN(value)) return "-";
                                return value.toFixed(2);
                            })()}
                        </span>
                    ),
                },
                {
                    id: "starting_qty",
                    accessorKey: "starting_qty",
                    size: 100    ,
                    header: () => (
                        <p className="column-title whitespace-normal wrap-break-wordword leading-tight sm:whitespace-nowrap">
                            Starting Qty.
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="text-foreground">{getValue<number | null>() ?? "-"}</span>
                    ),
                },
                {
                    id: "buffer_stock",
                    accessorKey: "buffer_stock",
                    size: 100,
                    header: () => (
                        <p className="column-title whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                            Buffer Stock
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="text-foreground">{getValue<number | null>() ?? "-"}</span>
                    ),
                },
                {
                    id: "ending_qty",
                    accessorKey: "ending_qty",
                    size: 100,
                    header: () => (
                        <p className="column-title whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                            Ending Qty.
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="text-foreground">{getValue<number | null>() ?? "-"}</span>
                    ),
                },
                {
                    id: "actions",
                    size: 90,
                    header: () => <p className="column-title">Actions</p>,
                    enableSorting: false,
                    enableColumnFilter: false,
                    cell: ({ row }) => (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Edit item"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditDialog(row.original)}
                        >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit item</span>
                        </Button>
                    ),
                },
            ],
            [handleCopyItemCode, openEditDialog, typeOptions]
        ),
        refineCoreProps: {
            resource: "items_inventory_all",
            pagination: { pageSize: 10, mode: "server" },
            filters: {
                mode: "server",
                initial: buildDateFilters(selectedYear, selectedMonth),
            },
            sorters: {
                initial: [{ field: "item_code", order: "asc" }],
            },
        },
    });
    const columnFilters = itemTable.reactTable.getState().columnFilters;

    const handleManualRollover = useCallback(async () => {
        if (!isAdmin || isRolloverRunning) return;
        if (!identityId) {
            open?.({
                type: "error",
                message: "Rollover failed",
                description: "No user identity found for this session.",
            });
            return;
        }
        setIsRolloverRunning(true);
        let didNotifyFinal = false;
        try {
            const { data, error } = await supabaseClient.rpc("rollover_inventory_month", {
                p_recorded_by: identityId,
            });

            if (error) {
                open?.({
                    type: "error",
                    message: "Rollover failed",
                    description: getErrorMessage(error),
                });
                return;
            }

            const insertedCount =
                typeof data === "number"
                    ? data
                    : typeof data === "string"
                      ? Number(data)
                      : null;

            if (insertedCount === 0) {
                open?.({
                    type: "success",
                    message: "No rollover needed",
                    description: "All current-month records already exist.",
                });
                didNotifyFinal = true;
            } else if (typeof insertedCount === "number" && Number.isFinite(insertedCount)) {
                open?.({
                    type: "success",
                    message: "Rollover complete",
                    description:
                        `Created ${insertedCount} new record${insertedCount === 1 ? "" : "s"}.`,
                });
                didNotifyFinal = true;
            } else {
                open?.({
                    type: "success",
                    message: "Rollover complete",
                    description: "New month records were created when missing.",
                });
                didNotifyFinal = true;
            }

            itemTable.refineCore.tableQuery.refetch();
        } catch (error) {
            open?.({
                type: "error",
                message: "Rollover failed",
                description: getErrorMessage(error),
            });
        } finally {
            if (!didNotifyFinal) {
                open?.({
                    type: "success",
                    message: "Rollover finished",
                    description: "Check the inventory list for any new month records.",
                });
            }
            setIsRolloverRunning(false);
        }
    }, [identityId, isAdmin, isRolloverRunning, itemTable.refineCore, open]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    useEffect(() => {
        if (!identityId || typeof window === "undefined") return;
        const storedUserId = window.sessionStorage.getItem(ITEMS_LIST_FILTERS_USER_KEY);

        if (storedUserId && storedUserId !== identityId) {
            const nextMonth = getDefaultMonth();
            const nextYear = getDefaultYear();
            setSelectedMonth(nextMonth);
            setSelectedYear(nextYear);
            setSearchQuery("");
            window.sessionStorage.removeItem(ITEMS_LIST_FILTERS_STORAGE_KEY);
            window.sessionStorage.setItem(ITEMS_LIST_FILTERS_USER_KEY, identityId);
            return;
        }

        if (!storedUserId) {
            window.sessionStorage.setItem(ITEMS_LIST_FILTERS_USER_KEY, identityId);
        }
    }, [identityId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const payload: ItemsListPersistedFilters = {
            selectedMonth,
            selectedYear,
            searchQuery,
        };
        window.sessionStorage.setItem(
            ITEMS_LIST_FILTERS_STORAGE_KEY,
            JSON.stringify(payload)
        );
    }, [searchQuery, selectedMonth, selectedYear]);

    useEffect(() => {
        const filters: CrudFilters = buildDateFilters(selectedYear, selectedMonth);
        const typeFilterValue = columnFilters.find(
            (filter) => filter.id === "type"
        )?.value;
        const selectedTypeFromColumn =
            typeof typeFilterValue === "string" ? typeFilterValue : undefined;

        if (selectedTypeFromColumn) {
            filters.push({ field: "type", operator: "eq", value: selectedTypeFromColumn });
        }

        if (debouncedSearchQuery) {
            filters.push({
                operator: "or",
                value: [
                    { field: "item_code", operator: "contains", value: debouncedSearchQuery },
                    { field: "description", operator: "contains", value: debouncedSearchQuery },
                    { field: "type", operator: "contains", value: debouncedSearchQuery },
                ],
            });
        }

        itemTable.refineCore.setFilters(filters, "replace");
    }, [
        selectedMonth,
        selectedYear,
        debouncedSearchQuery,
        columnFilters,
        itemTable.refineCore.setFilters,
    ]);

    return (
        <ListView>
            <ListViewHeader title="Inventory Items" />

            <div className="intro-row">
                <p className="text-muted-foreground">Manage and track all items in warehouse inventory</p>
                <div className="actions-row">
                    <div className="search-field">
                        <Search className="search-icon" />
                        <Input
                            type="text"
                            placeholder="Search item..."
                            className="pl-10 w-full"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by Month" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Months</SelectItem>
                                {MONTHS_OPTIONS.map((month) => (
                                    <SelectItem key={month.value} value={month.value}>
                                        {month.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Dialog
                            open={importDialogOpen}
                            onOpenChange={(isOpen) => {
                                setImportDialogOpen(isOpen);
                                handleDialogOpenChange(isOpen);
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button type="button" variant="outline">
                                    <FileSpreadsheet className="w-4 h-4" />
                                    <span>Import Excel</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[calc(100vw-2rem)] max-w-xl p-4 sm:p-6">
                                <ItemImportPanel
                                    file={importFile}
                                    onFileChange={setImportFile}
                                    onCancel={() => {
                                        handleDialogOpenChange(false);
                                        setImportDialogOpen(false);
                                    }}
                                    onContinue={() => {
                                        handleDialogOpenChange(false);
                                        setImportDialogOpen(false);
                                    }}
                                    continueDisabled={!hasImportFile}
                                />
                            </DialogContent>
                        </Dialog>

                        {isAdmin ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleManualRollover}
                                disabled={isRolloverRunning}
                            >
                                {isRolloverRunning ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Running
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2">
                                        <RefreshCw className="h-4 w-4" />
                                        Rollover Month
                                    </span>
                                )}
                            </Button>
                        ) : null}

                        <CreateButton>
                            <div className="flex items-center gap-2 font-semibold">
                                <Plus className="w-4 h-4" />
                                <span>Add Item</span>
                            </div>
                        </CreateButton>

                    </div>
                </div>
            </div>

            <DataTable
                table={itemTable}
                bottomContent={
                    <div className="-mt-px overflow-x-auto px-2">
                        <div className="flex min-w-max items-start gap-1">
                            <button
                                type="button"
                                onClick={() => setSelectedYear("all")}
                                className={`${selectedYear === "all"
                                    ? "relative rounded-b-lg border border-t-0 border-border bg-background px-4 py-1.5 text-sm text-foreground shadow-sm [box-shadow:inset_0_1px_0_var(--background)]"
                                    : "relative rounded-b-lg border border-t-0 border-border bg-muted/40 px-4 py-1.5 text-sm text-muted-foreground"
                                    }`}
                            >
                                All
                            </button>

                            {yearTabs.map((year) => (
                                <button
                                    key={year}
                                    type="button"
                                    onClick={() => setSelectedYear(String(year))}
                                    className={`${selectedYear === String(year)
                                        ? "relative rounded-b-lg border border-t-0 border-border bg-background px-4 py-1.5 text-sm text-foreground shadow-sm [box-shadow:inset_0_1px_0_var(--background)]"
                                        : "relative rounded-b-lg border border-t-0 border-border bg-muted/40 px-4 py-1.5 text-sm text-muted-foreground"
                                        }`}
                                >
                                    {year}
                                </button>
                            ))}
                        </div>
                    </div>
                }
            />

            <Dialog
                open={editDialogOpen}
                onOpenChange={(openState) => {
                    setEditDialogOpen(openState);
                    if (!openState) {
                        setEditingItem(null);
                        setEditingItemId(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-2xl overflow-hidden p-0 border-border/80 shadow-sm">
                    <DialogHeader className="border-b px-6 py-5">
                        <DialogTitle className="text-2xl">Edit Item</DialogTitle>
                        <DialogDescription>Update item details and inventory quantity.</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-5 px-6 py-6">
                        <div className="grid gap-4 rounded-xl border border-border/80 bg-muted/10 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item Details</p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Item Code</p>
                                    <Input
                                        value={editItemCode}
                                        onChange={(e) => setEditItemCode(e.target.value.toUpperCase())}
                                        placeholder="INV-××××××××"
                                        className="bg-background"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Type</p>
                                    <Input
                                        value={editType}
                                        onChange={(e) => setEditType(e.target.value.toUpperCase())}
                                        placeholder="Type"
                                        className="bg-background"
                                    />
                                </div>
                            </div>

                            <div className="grid gap-1.5">
                                <p className="text-sm font-medium">Description</p>
                                <Textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value.toUpperCase())}
                                    placeholder="Describe the item and specification"
                                    className="min-h-24 bg-background"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 rounded-xl border border-border/80 bg-muted/10 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventory</p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Buffer Stock</p>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editBufferStock}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setEditBufferStock(value === "" ? "" : Number(value));
                                        }}
                                        className="bg-background"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Unit Cost</p>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={editUnitCost}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setEditUnitCost(value === "" ? "" : Number(value));
                                        }}
                                        className="bg-background"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Starting Quantity</p>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editStartingQty}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setEditStartingQty(value === "" ? "" : Number(value));
                                        }}
                                        className="bg-background"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <p className="text-sm font-medium">Ending Quantity</p>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editEndingQty}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setEditEndingQty(value === "" ? "" : Number(value));
                                        }}
                                        className="bg-background"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="items-center border-t px-6 py-4 sm:justify-end">
                        <p className="mr-auto text-left text-xs text-muted-foreground">
                            {isUpdatingItem ? "Saving changes..." : "Changes apply immediately."}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditDialogOpen(false)}
                            disabled={isUpdatingItem}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={isUpdatingItem || !editingItem}
                        >
                            {isUpdatingItem ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving
                                </span>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ListView>
    );
};

export default ItemList;
