import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MOVEMENT_TYPE_OPTIONS, SYSTEM_WAREHOUSE, WAREHOUSE_OPTIONS } from "@/constants";
import { ItemMovementRow, MovementType } from "@/types";
import { useList } from "@refinedev/core";
import { cn } from "@/lib/utils";
import type { UseTableReturnType } from "@refinedev/react-table";
import {
    ArrowDownRight,
    ArrowUpRight,
    Download,
    Search,
    SlidersHorizontal,
} from "lucide-react";
import { ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

type ItemOption = {
    id: string;
    item_code: string;
    description: string;
};

type ItemMovementHistoryRow = ItemMovementRow & {
    created_by_name?: string | null;
    item_code?: string | null;
    item_description?: string | null;
    description?: string | null;
};

type ItemMovementDisplayRow = ItemMovementHistoryRow & {
    direction: MovementDirection;
    itemLabel: string;
    createdLabel: { date: string; time: string };
    createdBy: string;
};

const NOT_APPLICABLE = "N/A";

const formatWarehouse = (warehouse: string | null | undefined) => {
    if (!warehouse) return "-";
    return WAREHOUSE_OPTIONS.find((option) => option.value === warehouse)?.label ?? warehouse;
};

const formatMovementType = (movementType: MovementType | null | undefined) => {
    if (!movementType) return "-";
    return MOVEMENT_TYPE_OPTIONS.find((option) => option.value === movementType)?.label ?? movementType;
};

type MovementDirection = "inbound" | "outbound";

const getMovementDirection = (movement: ItemMovementHistoryRow): MovementDirection => {
    if (movement.movement_type === "delivery" || movement.movement_type === "return") {
        return "inbound";
    }
    if (movement.movement_type === "transfer") {
        if (movement.to_warehouse === SYSTEM_WAREHOUSE) {
            return "inbound";
        }
        if (movement.from_warehouse === SYSTEM_WAREHOUSE) {
            return "outbound";
        }
    }
    return "inbound";
};

const formatMovementTimestamp = (value: string | null | undefined) => {
    if (!value) return { date: "-", time: "" };
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return { date: "-", time: "" };
    }
    return {
        date: parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
};

const getMovementTypeDotColorFromLabel = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("transfer")) return "#2563eb";
    if (normalized.includes("delivery")) return "#10b981";
    if (normalized.includes("return")) return "#f59e0b";
    return "rgba(100,116,139,0.6)";
};

const ItemMovementListPage = () => {
    const [activeTab, setActiveTab] = useState<MovementDirection>("inbound");
    const [typeFilter, setTypeFilter] = useState<MovementType | "all">("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const { result: itemsResult } = useList<ItemOption>({
        resource: "items",
        pagination: { mode: "off" },
    });

    const { result: movementResult, query: movementQuery } = useList<ItemMovementHistoryRow>({
        resource: "item_movements_with_user",
        sorters: [{ field: "created_at", order: "desc" }],
        pagination: { mode: "off" },
    });

    const items = itemsResult?.data ?? [];
    const movements = movementResult?.data ?? [];
    const isMovementLoading = movementQuery.isLoading;
    const itemLabelById = useMemo(() => {
        const labelMap = new Map<string, string>();
        items.forEach((item: ItemOption) => {
            const label = item.item_code?.trim()
                ? `${item.item_code} - ${item.description ?? ""}`
                : item.description ?? item.id;
            labelMap.set(String(item.id), label.trim());
        });
        return labelMap;
    }, [items]);

    const movementRows = useMemo<ItemMovementDisplayRow[]>(() => {
        return movements.map((movement) => {
            const movementItemCode = movement.item_code?.trim() || "";
            const movementItemDescription =
                movement.item_description?.trim() || movement.description?.trim() || "";
            const itemLabel =
                movementItemCode && movementItemDescription
                    ? `${movementItemCode} - ${movementItemDescription}`
                    : movementItemCode
                      ? movementItemCode
                      : itemLabelById.get(String(movement.item_id)) ?? String(movement.item_id ?? "-");

            return {
                ...movement,
                direction: getMovementDirection(movement),
                itemLabel,
                createdLabel: formatMovementTimestamp(movement.created_at),
                createdBy: movement.created_by_name?.trim() || movement.created_by?.trim() || NOT_APPLICABLE,
            };
        });
    }, [movements, itemLabelById]);

    const applyTypeFilter = (rows: typeof movementRows) => {
        if (typeFilter === "all") return rows;
        return rows.filter((movement) => movement.movement_type === typeFilter);
    };

    const inboundMovements = useMemo(
        () =>
            applyTypeFilter(
                movementRows.filter((movement) => movement.direction === "inbound")
            ),
        [movementRows, typeFilter]
    );
    const outboundMovements = useMemo(
        () =>
            applyTypeFilter(
                movementRows.filter((movement) => movement.direction === "outbound")
            ),
        [movementRows, typeFilter]
    );

    const paginatedInbound = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return inboundMovements.slice(start, start + pageSize);
    }, [currentPage, pageSize, inboundMovements]);

    const paginatedOutbound = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return outboundMovements.slice(start, start + pageSize);
    }, [currentPage, pageSize, outboundMovements]);

    const inboundPageCount = Math.max(1, Math.ceil(inboundMovements.length / pageSize));
    const outboundPageCount = Math.max(1, Math.ceil(outboundMovements.length / pageSize));

    const movementTotals = useMemo(() => {
        return applyTypeFilter(movementRows).reduce(
            (acc, movement) => {
                if (movement.direction === "inbound") {
                    acc.inbound += movement.quantity;
                } else {
                    acc.outbound += movement.quantity;
                }
                return acc;
            },
            { inbound: 0, outbound: 0 }
        );
    }, [movementRows, typeFilter]);

    const netMovement = movementTotals.inbound - movementTotals.outbound;
    const createHref = `/item-movements/create?direction=${activeTab}`;
    const isInboundTab = activeTab === "inbound";

    const movementColumns = useMemo<ColumnDef<ItemMovementDisplayRow>[]>(() => {
        return [
            {
                id: "created_at",
                accessorKey: "created_at",
                size: 150,
                header: () => <p className="column-title">Date</p>,
                cell: ({ row }) => (
                    <div className="whitespace-nowrap">
                        <div className="text-sm font-medium">{row.original.createdLabel.date}</div>
                        <div className="text-xs text-muted-foreground">{row.original.createdLabel.time}</div>
                    </div>
                ),
            },
            {
                id: "item",
                accessorKey: "itemLabel",
                size: 280,
                header: () => <p className="column-title">Item</p>,
                cell: ({ row }) => {
                    const typeLabel = formatMovementType(row.original.movement_type);
                    return (
                        <div className="max-w-[260px]">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="block truncate cursor-help">
                                        {row.original.itemLabel}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    align="start"
                                    className="w-max max-w-[min(90vw,48rem)] whitespace-normal break-words"
                                >
                                    {row.original.itemLabel}
                                </TooltipContent>
                            </Tooltip>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span
                                    className="text-[10px] leading-none"
                                    style={{ color: getMovementTypeDotColorFromLabel(typeLabel) }}
                                    aria-hidden="true"
                                >
                                    ●
                                </span>
                                {typeLabel}
                            </div>
                        </div>
                    );
                },
            },
            {
                id: "quantity",
                accessorKey: "quantity",
                size: 100,
                header: () => <div className="column-title w-full justify-end">Qty</div>,
                meta: {
                    headerClassName: "text-right",
                    cellClassName: "text-right",
                    cellInnerClassName: "font-semibold text-right",
                },
                cell: ({ row }) => {
                    const isInbound = row.original.direction === "inbound";
                    return (
                        <span className={cn(isInbound ? "text-emerald-600" : "text-amber-600")}>
                            {isInbound ? "+" : "-"}
                            {row.original.quantity}
                        </span>
                    );
                },
            },
            {
                id: "source",
                accessorKey: "from_warehouse",
                size: 120,
                header: () => <p className="column-title">Source</p>,
                cell: ({ row }) => (
                    <span className="text-sm">
                        {row.original.movement_type === "transfer"
                            ? formatWarehouse(row.original.from_warehouse)
                            : NOT_APPLICABLE}
                    </span>
                ),
            },
            {
                id: "destination",
                accessorKey: "to_warehouse",
                size: 120,
                header: () => <p className="column-title">Destination</p>,
                cell: ({ row }) => (
                    <span className="text-sm">
                        {formatWarehouse(row.original.to_warehouse) || NOT_APPLICABLE}
                    </span>
                ),
            },
            {
                id: "supplier",
                accessorKey: "supplier",
                size: 160,
                header: () => <p className="column-title">Supplier</p>,
                meta: {
                    headerClassName: "hidden lg:table-cell",
                    cellClassName: "hidden lg:table-cell",
                },
                cell: ({ row }) => (
                    <span className="text-sm">
                        {row.original.movement_type === "delivery"
                            ? row.original.supplier ?? NOT_APPLICABLE
                            : NOT_APPLICABLE}
                    </span>
                ),
            },
            {
                id: "return_reason",
                accessorKey: "return_reason",
                size: 180,
                header: () => <p className="column-title">Return Reason</p>,
                meta: {
                    headerClassName: "hidden lg:table-cell",
                    cellClassName: "hidden lg:table-cell",
                },
                cell: ({ row }) => (
                    <span className="text-sm">
                        {row.original.movement_type === "return"
                            ? row.original.return_reason ?? NOT_APPLICABLE
                            : NOT_APPLICABLE}
                    </span>
                ),
            },
            {
                id: "reference",
                accessorKey: "reference_number",
                size: 150,
                header: () => <p className="column-title">Reference</p>,
                meta: {
                    headerClassName: "hidden lg:table-cell",
                    cellClassName: "hidden lg:table-cell",
                },
                cell: ({ row }) => (
                    <span className="text-sm">{row.original.reference_number ?? NOT_APPLICABLE}</span>
                ),
            },
            {
                id: "user",
                accessorKey: "createdBy",
                size: 160,
                header: () => <p className="column-title">Created By</p>,
                meta: {
                    headerClassName: "hidden xl:table-cell",
                    cellClassName: "hidden xl:table-cell",
                },
                cell: ({ row }) => <span className="text-sm">{row.original.createdBy}</span>,
            },
        ];
    }, []);

    const inboundTable = useReactTable({
        data: paginatedInbound,
        columns: movementColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const outboundTable = useReactTable({
        data: paginatedOutbound,
        columns: movementColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const inboundDataTable = useMemo(
        () =>
            ({
                reactTable: inboundTable,
                refineCore: {
                    tableQuery: {
                        isLoading: isMovementLoading,
                        data: { total: inboundMovements.length, data: paginatedInbound },
                    },
                    currentPage,
                    setCurrentPage,
                    pageCount: inboundPageCount,
                    pageSize,
                    setPageSize,
                },
            }) as UseTableReturnType<ItemMovementDisplayRow>,
        [
            inboundTable,
            isMovementLoading,
            inboundMovements.length,
            paginatedInbound,
            currentPage,
            setCurrentPage,
            inboundPageCount,
            pageSize,
            setPageSize,
        ]
    );

    const outboundDataTable = useMemo(
        () =>
            ({
                reactTable: outboundTable,
                refineCore: {
                    tableQuery: {
                        isLoading: isMovementLoading,
                        data: { total: outboundMovements.length, data: paginatedOutbound },
                    },
                    currentPage,
                    setCurrentPage,
                    pageCount: outboundPageCount,
                    pageSize,
                    setPageSize,
                },
            }) as UseTableReturnType<ItemMovementDisplayRow>,
        [
            outboundTable,
            isMovementLoading,
            outboundMovements.length,
            paginatedOutbound,
            currentPage,
            setCurrentPage,
            outboundPageCount,
            pageSize,
            setPageSize,
        ]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, typeFilter, pageSize]);

    return (
        <ListView>
            <ListViewHeader title="Item Movement" />

            <div className="space-y-6">
                <div className="min-w-0 flex flex-col gap-6">
                    <div className="space-y-3">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="leading-none font-semibold">Item Movement History</div>
                                <div className="text-muted-foreground text-sm">
                                    Monitor inbound and outbound activity for Branch 2.
                                </div>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input className="pl-8" placeholder="Search items, refs, users" />
                                </div>
                                <Button variant="outline" className="gap-2">
                                    <SlidersHorizontal className="h-4 w-4" />
                                    Filters
                                </Button>
                                <Button variant="outline" className="gap-2">
                                    <Download className="h-4 w-4" />
                                    Export
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="min-w-0 space-y-4">
                        <Tabs
                            value={activeTab}
                            onValueChange={(value) => {
                                setActiveTab(value as MovementDirection);
                                setTypeFilter("all");
                            }}
                        >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <TabsList>
                                    <TabsTrigger value="inbound">
                                        Inbound
                                        <Badge variant="secondary" className="ml-1">
                                            {inboundMovements.length}
                                        </Badge>
                                    </TabsTrigger>
                                    <TabsTrigger value="outbound">
                                        Outbound
                                        <Badge variant="secondary" className="ml-1">
                                            {outboundMovements.length}
                                        </Badge>
                                    </TabsTrigger>
                                </TabsList>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge
                                        variant={typeFilter === "all" ? "secondary" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => setTypeFilter("all")}
                                    >
                                        All Types
                                    </Badge>
                                    <Badge
                                        variant={typeFilter === "delivery" ? "secondary" : "outline"}
                                        className={cn(
                                            "cursor-pointer",
                                            !isInboundTab ? "opacity-50 pointer-events-none" : ""
                                        )}
                                        onClick={() => (isInboundTab ? setTypeFilter("delivery") : null)}
                                    >
                                        Delivery
                                    </Badge>
                                    <Badge
                                        variant={typeFilter === "return" ? "secondary" : "outline"}
                                        className={cn(
                                            "cursor-pointer",
                                            !isInboundTab ? "opacity-50 pointer-events-none" : ""
                                        )}
                                        onClick={() => (isInboundTab ? setTypeFilter("return") : null)}
                                    >
                                        Return
                                    </Badge>
                                    <Badge
                                        variant={typeFilter === "transfer" ? "secondary" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => setTypeFilter("transfer")}
                                    >
                                        Transfer
                                    </Badge>
                                    <Badge variant="outline">Warehouse: Branch 2</Badge>
                                    <Badge variant="outline">Last 30 days</Badge>
                                    <Badge variant="outline">All items</Badge>
                                    <Badge variant="outline">All users</Badge>
                                    <Button asChild size="sm" className="ml-auto">
                                        <Link to={createHref}>Record Movement</Link>
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-lg border bg-card p-3">
                                    <p className="text-xs text-muted-foreground">Total Inbound Qty</p>
                                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-emerald-600">
                                        <ArrowUpRight className="h-4 w-4" />
                                        {movementTotals.inbound}
                                    </div>
                                </div>
                                <div className="rounded-lg border bg-card p-3">
                                    <p className="text-xs text-muted-foreground">Total Outbound Qty</p>
                                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-amber-600">
                                        <ArrowDownRight className="h-4 w-4" />
                                        {movementTotals.outbound}
                                    </div>
                                </div>
                                <div className="rounded-lg border bg-card p-3">
                                    <p className="text-xs text-muted-foreground">Net Change</p>
                                    <div className="mt-2 text-lg font-semibold">
                                        {netMovement >= 0 ? "+" : "-"}
                                        {Math.abs(netMovement)}
                                    </div>
                                </div>
                            </div>

                            <TabsContent value="inbound">
                                <DataTable table={inboundDataTable} />
                            </TabsContent>

                            <TabsContent value="outbound">
                                <DataTable table={outboundDataTable} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </ListView>
    );
};

export default ItemMovementListPage;
