import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { DataTableSorter } from "@/components/refine-ui/data-table/data-table-sorter";
import { DataTableFilterCombobox } from "@/components/refine-ui/data-table/data-table-filter";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { History, Plus, RotateCcw, Search } from "lucide-react";
import { useTable } from "@refinedev/react-table";
import { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrudFilters, useGetIdentity, useInvalidate, useList, useNotification, useOne } from "@refinedev/core";
import { useNavigate } from "react-router";
import { supabaseClient } from "@/providers/supabase-client";

type MctRow = {
    id: string;
    district: string | null;
    department: string | null;
    request_number: string | null;
    request_date: string | null;
    requisitioner: string | null;
    release_date: string | null;
    mct_rel_number: string | null;
    wo_number: string | null;
    jo_number: string | null;
    so_number: string | null;
    purpose: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    status: string | null;
    mct_month: number | null;
    mct_year: number | null;
    rolled_back_at: string | null;
    rolled_back_by: string | null;
};

type MctItemRow = {
    id: string;
    mct_id: string;
    item_code: string | null;
    particulars: string | null;
    unit: string | null;
    unit_cost: number | null;
    qty: number | null;
    total_cost: number | null;
    c2: number | null;
    remarks: string | null;
};

type UserRow = {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role: string | null;
};

const ItemMovementListPage = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [transactionType, setTransactionType] = useState("mct");
    const [selectedMct, setSelectedMct] = useState<MctRow | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [rollbackOpen, setRollbackOpen] = useState(false);
    const [rollbackTarget, setRollbackTarget] = useState<MctRow | null>(null);
    const purposeRef = useRef<HTMLTextAreaElement | null>(null);
    const notesRef = useRef<HTMLTextAreaElement | null>(null);
    const navigate = useNavigate();
    const { data: identity } = useGetIdentity<{ id?: string | number }>();
    const identityId = identity?.id ? String(identity.id) : "";
    const invalidate = useInvalidate();
    const { open } = useNotification();

    const { result: currentUserResult } = useOne<UserRow>({
        resource: "users",
        id: identityId,
        queryOptions: {
            enabled: Boolean(identityId),
        },
    });
    const normalizedRole = (currentUserResult?.role ?? "").toLowerCase();
    const isAdmin = normalizedRole === "admin";

    const { result: mctItemsResult, query: mctItemsQuery } = useList<MctItemRow>({
        resource: "mct_items",
        filters: selectedMct ? [{ field: "mct_id", operator: "eq", value: selectedMct.id }] : [],
        pagination: { mode: "off" },
        queryOptions: {
            enabled: Boolean(selectedMct?.id),
        },
    });

    const { result: usersResult } = useList<UserRow>({
        resource: "users",
        pagination: { mode: "off" },
    });

    const { result: mctOptionsResult } = useList<MctRow>({
        resource: "mcts",
        pagination: { mode: "off" },
    });


    const mctItems = mctItemsResult?.data ?? [];
    const totalQty = useMemo(
        () => mctItems.reduce((acc, item) => acc + (item.qty ?? 0), 0),
        [mctItems]
    );
    const totalCost = useMemo(
        () => mctItems.reduce((acc, item) => acc + (item.total_cost ?? 0), 0),
        [mctItems]
    );

    const formatCost = (value: number | null | undefined) => {
        if (value == null || Number.isNaN(value)) return "-";
        return value.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const formatC2 = (value: number | null | undefined) => {
        if (value == null || Number.isNaN(value)) return "-";
        return value.toLocaleString("en-US", {
            maximumFractionDigits: 0,
        });
    };

    const formatDate = useCallback((value: string | null | undefined) => {
        if (!value) return "-";
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
        });
    }, []);

    const userLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const user of usersResult?.data ?? []) {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
            const label = user.name?.trim() || fullName || user.email?.trim() || user.id;
            map.set(user.id, label);
        }
        return map;
    }, [usersResult?.data]);

    const getUserLabel = useCallback((userId: string | null | undefined) => {
        if (!userId) return "-";
        return userLabelMap.get(userId) ?? userId;
    }, [userLabelMap]);

    const openDetails = (mct: MctRow) => {
        setSelectedMct(mct);
        setDetailOpen(true);
    };

    const canRollback = (mct: MctRow) => {
        if (!identityId) return false;
        if (mct.status && mct.status !== "active") return false;
        return isAdmin || mct.created_by === identityId;
    };

    const openRollbackDialog = (mct: MctRow) => {
        setRollbackTarget(mct);
        setRollbackOpen(true);
    };

    const handleRollback = async () => {
        if (!rollbackTarget) return;
        try {
            const { error } = await supabaseClient.rpc("rollback_mct_transaction", {
                p_mct_id: rollbackTarget.id,
            });

            if (error) {
                open?.({
                    type: "error",
                    message: "Rollback failed",
                    description: error.message,
                });
                return;
            }

            open?.({
                type: "success",
                message: "MCT rolled back",
                description: "Inventory quantities have been restored.",
            });
            setRollbackOpen(false);
            setRollbackTarget(null);
            if (detailOpen) {
                setDetailOpen(false);
                setSelectedMct(null);
            }
            await invalidate({ resource: "mcts", invalidates: ["list"] });
            await invalidate({ resource: "inventory_records", invalidates: ["list"] });
        } catch (error) {
            open?.({
                type: "error",
                message: "Rollback failed",
                description: error instanceof Error ? error.message : "Unable to rollback MCT.",
            });
        }
    };

    const renderClickableCell = (value: string | null | undefined, row: MctRow) => (
        <button
            type="button"
            className="w-full text-left"
            onClick={() => openDetails(row)}
        >
            {value ?? "-"}
        </button>
    );

    const renderBadgeCell = (value: string | null | undefined, row: MctRow) => {
        const label = value?.trim();
        return (
            <button
                type="button"
                className="w-full text-left"
                onClick={() => openDetails(row)}
            >
                {label ? (
                    <Badge className="font-semibold">
                        {label}
                    </Badge>
                ) : (
                    "-"
                )}
            </button>
        );
    };

    const requisitionerOptions = useMemo(() => {
        const rows = mctOptionsResult?.data ?? [];
        const unique = Array.from(
            new Set(rows.map((row) => row.requisitioner).filter(Boolean))
        ) as string[];
        return unique.map((value) => ({ label: value, value }));
    }, [mctOptionsResult?.data]);

    const columns = useMemo<ColumnDef<MctRow>[]>(
        () => [
                {
                    id: "mct_rel_number",
                    accessorKey: "mct_rel_number",
                    size: 160,
                    header: ({ column }) => (
                        <div className="flex items-center gap-1">
                            <p className="column-title ml-2 whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                                MCT/Rel #
                            </p>
                            <DataTableSorter column={column} title={undefined} />
                        </div>
                    ),
                    cell: ({ row, getValue }) => renderBadgeCell(getValue<string>(), row.original),
                },
                {
                    id: "request_number",
                    accessorKey: "request_number",
                    size: 150,
                    header: () => <p className="column-title">Request #</p>,
                    cell: ({ row, getValue }) => renderBadgeCell(getValue<string>(), row.original),
                },
                {
                    id: "release_date",
                    accessorKey: "release_date",
                    size: 140,
                    header: () => <p className="column-title">Rel. Date</p>,
                    cell: ({ row, getValue }) => (
                        <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => openDetails(row.original)}
                        >
                            <Badge variant="secondary" className="font-medium">
                                {formatDate(getValue<string>())}
                            </Badge>
                        </button>
                    ),
                },
                {
                    id: "requisitioner",
                    accessorKey: "requisitioner",
                    size: 200,
                    header: ({ column, table }) => (
                        <div className="column-title">
                            <span>Requisitioner</span>
                            <DataTableFilterCombobox
                                column={column}
                                table={table}
                                options={requisitionerOptions}
                                placeholder="Requisitioner"
                                operators={["eq"]}
                            />
                        </div>
                    ),
                    meta: {
                        cellInnerClassName: "whitespace-normal break-words",
                    },
                    cell: ({ row, getValue }) => (
                        <button
                            type="button"
                            className="w-full text-left whitespace-normal break-words font-medium text-foreground"
                            onClick={() => openDetails(row.original)}
                        >
                            {getValue<string>() ?? "-"}
                        </button>
                    ),
                },
                {
                    id: "purpose",
                    accessorKey: "purpose",
                    size: 320,
                    header: () => <p className="column-title">Purpose</p>,
                    meta: {
                        cellInnerClassName: "whitespace-normal break-words",
                    },
                    cell: ({ row, getValue }) => (
                        <button
                            type="button"
                            className="w-full text-left whitespace-normal break-words text-sm text-muted-foreground line-clamp-2"
                            onClick={() => openDetails(row.original)}
                        >
                            {getValue<string>() ?? "-"}
                        </button>
                    ),
                },
                {
                    id: "created_at",
                    accessorKey: "created_at",
                    size: 160,
                    header: () => <p className="column-title">Add Date</p>,
                    cell: ({ row, getValue }) => (
                        <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => openDetails(row.original)}
                        >
                            <Badge variant="outline" className="font-medium">
                                {formatDate(getValue<string>())}
                            </Badge>
                        </button>
                    ),
                },
                {
                    id: "created_by",
                    accessorKey: "created_by",
                    size: 200,
                    header: () => <p className="column-title">Added By</p>,
                    cell: ({ row, getValue }) => {
                        const label = getUserLabel(getValue<string>());
                        const mct = row.original;
                        return (
                            <div className="grid gap-1">
                                <button
                                    type="button"
                                    className="w-full text-left font-medium"
                                    onClick={() => openDetails(mct)}
                                >
                                    {label}
                                </button>
                                {canRollback(mct) ? (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline"
                                        onClick={() => openRollbackDialog(mct)}
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        Rollback
                                    </button>
                                ) : null}
                            </div>
                        );
                    },
                },
        ],
        [getUserLabel, formatDate, requisitionerOptions]
    );

    const mctTable = useTable<MctRow>({
        columns,
        refineCoreProps: {
            resource: "mcts",
            pagination: { pageSize: 10, mode: "server" },
            sorters: { initial: [{ field: "created_at", order: "desc" }] },
            filters: {
                mode: "server",
                initial: [{ field: "status", operator: "eq", value: "active" }],
            },
        },
    });
    const listError = mctTable.refineCore.tableQuery.error instanceof Error
        ? mctTable.refineCore.tableQuery.error.message
        : null;

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const applySearchFilters = useCallback((value: string) => {
        const normalized = value.trim();
        if (!normalized) {
            mctTable.refineCore.setFilters(
                [{ field: "status", operator: "eq", value: "active" }],
                "replace"
            );
            return;
        }

        mctTable.refineCore.setFilters(
            [
                { field: "status", operator: "eq", value: "active" },
                {
                    operator: "or",
                    value: [
                        { field: "mct_rel_number", operator: "contains", value: normalized },
                        { field: "request_number", operator: "contains", value: normalized },
                        { field: "district", operator: "contains", value: normalized },
                        { field: "department", operator: "contains", value: normalized },
                        { field: "requisitioner", operator: "contains", value: normalized },
                        { field: "purpose", operator: "contains", value: normalized },
                        { field: "request_date", operator: "contains", value: normalized },
                        { field: "release_date", operator: "contains", value: normalized },
                    ],
                },
            ],
            "replace"
        );
    }, [mctTable.refineCore.setFilters]);

    useEffect(() => {
        applySearchFilters(debouncedSearchQuery);
    }, [applySearchFilters, debouncedSearchQuery]);

    useEffect(() => {
        const resizeTextarea = (ref: { current: HTMLTextAreaElement | null }) => {
            if (!ref.current) return;
            ref.current.style.height = "auto";
            ref.current.style.height = `${ref.current.scrollHeight}px`;
        };

        resizeTextarea(purposeRef);
        resizeTextarea(notesRef);
    }, [selectedMct?.purpose, selectedMct?.notes, detailOpen]);

    return (
        <ListView>
            <ListViewHeader title="Issue/Return" />

            <div className="grid gap-6 min-w-0">
                <div className="intro-row">
                    <div className="w-full sm:w-[240px]">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Transaction Type
                        </p>
                        <Select value={transactionType} onValueChange={setTransactionType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mct">MCT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="actions-row">
                        <div className="search-field">
                            <Search className="search-icon" />
                            <Input
                                type="text"
                                placeholder="Search MCT..."
                                className="pl-10 w-full"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                            />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="font-semibold"
                            onClick={() => navigate("/issue-return/history")}
                        >
                            <History className="h-4 w-4" />
                            History
                        </Button>
                        <CreateButton resource="issue_return">
                            <div className="flex items-center gap-2 font-semibold">
                                <Plus className="h-4 w-4" />
                                <span>MCT</span>
                            </div>
                        </CreateButton>
                    </div>
                </div>

                {listError ? (
                    <Alert variant="destructive">
                        <AlertTitle>Unable to load MCTs</AlertTitle>
                        <AlertDescription>{listError}</AlertDescription>
                    </Alert>
                ) : null}

                <div className="min-w-0">
                    <DataTable table={mctTable} />
                </div>
            </div>
            <Dialog
                open={detailOpen}
                onOpenChange={(openState) => {
                    setDetailOpen(openState);
                    if (!openState) {
                        setSelectedMct(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto thin-scrollbar">
                    <DialogHeader>
                        <DialogTitle>MCT Details</DialogTitle>
                        <DialogDescription>
                            {selectedMct?.mct_rel_number ?? "Material Charge Ticket"}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket Details</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-3">
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">District</span>
                                <span className="font-medium">{selectedMct?.district ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">Department</span>
                                <span className="font-medium">{selectedMct?.department ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">Request #</span>
                                <span className="font-medium">{selectedMct?.request_number ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">Req. Date</span>
                                <span className="font-medium">{selectedMct?.request_date ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">Requisitioner</span>
                                <span className="font-medium">{selectedMct?.requisitioner ?? "-"}</span>
                            </div>
                        </div>
                        <div className="grid gap-3">
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">Rel. Date</span>
                                <span className="font-medium">{selectedMct?.release_date ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">MCT/Rel #</span>
                                <span className="font-medium">{selectedMct?.mct_rel_number ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">WO #</span>
                                <span className="font-medium">{selectedMct?.wo_number ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">JO #</span>
                                <span className="font-medium">{selectedMct?.jo_number ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                                <span className="text-muted-foreground">SO #</span>
                                <span className="font-medium">{selectedMct?.so_number ?? "-"}</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket Items</p>
                        <div className="rounded-md border bg-background overflow-x-auto">
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
                                    <TableHead className="text-right">C2</TableHead>
                                    <TableHead>Remarks</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mctItemsQuery.isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                                            Loading items...
                                        </TableCell>
                                    </TableRow>
                                ) : mctItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                                            No items found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    mctItems.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                                            <TableCell className="font-medium">{item.item_code ?? "-"}</TableCell>
                                            <TableCell className="min-w-[220px] whitespace-normal break-words">{item.particulars ?? "-"}</TableCell>
                                            <TableCell>{item.unit ?? "-"}</TableCell>
                                            <TableCell className="text-right">{formatCost(item.unit_cost)}</TableCell>
                                            <TableCell className="text-right">{item.qty ?? "-"}</TableCell>
                                            <TableCell className="text-right">{formatCost(item.total_cost)}</TableCell>
                                            <TableCell className="text-right">{formatC2(item.c2)}</TableCell>
                                            <TableCell className="min-w-[160px] whitespace-normal break-words">{item.remarks ?? "-"}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            {mctItems.length > 0 ? (
                                <TableFooter>
                                    <TableRow>
                                        <TableCell className="text-center text-muted-foreground">-</TableCell>
                                        <TableCell />
                                        <TableCell />
                                        <TableCell />
                                        <TableCell className="text-right text-sm font-semibold text-muted-foreground">
                                            Total:
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-semibold">
                                            {totalQty}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-semibold">
                                            {formatCost(totalCost)}
                                        </TableCell>
                                        <TableCell />
                                        <TableCell />
                                    </TableRow>
                                </TableFooter>
                            ) : null}
                        </Table>
                    </div>

                    <div className="grid gap-4">
                        <div className="grid gap-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purpose</p>
                            <Textarea
                                ref={purposeRef}
                                value={selectedMct?.purpose ?? ""}
                                readOnly
                                className="min-h-24 h-auto resize-none overflow-hidden bg-background"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes / SR #</p>
                            <Textarea
                                ref={notesRef}
                                value={selectedMct?.notes ?? ""}
                                readOnly
                                className="min-h-24 h-auto resize-none overflow-hidden bg-background"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDetailOpen(false)}
                        >
                            Close
                        </Button>
                        {selectedMct && canRollback(selectedMct) ? (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => openRollbackDialog(selectedMct)}
                            >
                                <RotateCcw className="h-4 w-4" />
                                Rollback
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog
                open={rollbackOpen}
                onOpenChange={(openState) => {
                    setRollbackOpen(openState);
                    if (!openState) {
                        setRollbackTarget(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rollback MCT</DialogTitle>
                        <DialogDescription>
                            This will restore inventory quantities and mark the MCT as rolled back.
                            You can view it later in the history page.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRollbackOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void handleRollback()}
                        >
                            <RotateCcw className="h-4 w-4" />
                            Rollback MCT
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ListView>
    );
};

export default ItemMovementListPage;
