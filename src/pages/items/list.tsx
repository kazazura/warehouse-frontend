import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
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
import { useTable } from "@refinedev/react-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { CrudFilters, useList } from "@refinedev/core";
import { ItemInventoryRow } from "@/types";

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

const ItemList = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(() =>
        new Date().toLocaleString("en-US", { month: "long" })
    );
    const [selectedYear, setSelectedYear] = useState<string>(
        String(new Date().getFullYear())
    );

    const { result: yearsResult } = useList<ItemInventoryRow>({
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

    const itemTable = useTable<ItemInventoryRow>({
        columns: useMemo<ColumnDef<ItemInventoryRow>[]>(
            () => [
                {
                    id: "item_code",
                    accessorKey: "item_code",
                    size: 130,
                    header: () => (
                        <p className="column-title ml-2 whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                            Item Code
                        </p>
                    ),
                    cell: ({ getValue }) => <Badge>{getValue<string>()}</Badge>,
                },
                {
                    id: "description",
                    accessorKey: "description",
                    size: 350,
                    header: () => (
                        <p className="column-title whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">
                            Description
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="truncate line-clamp-2">{getValue<string>()}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    id: "type",
                    accessorKey: "type",
                    size: 120,
                    header: ({ column, table }) => (
                        <div className="column-title">
                            <span className="whitespace-normal wrap-break-word leading-tight sm:whitespace-nowrap">Type</span>
                            <DataTableFilterCombobox
                                column={column}
                                table={table}
                                options={typeOptions.map((type) => ({ label: type, value: type }))}
                                placeholder="Type"
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
                    id: "starting_qty",
                    accessorKey: "starting_qty",
                    size: 130,
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
                    size: 130,
                    header: () => (
                        <p className="column-title whitespace-normal break-words leading-tight sm:whitespace-nowrap">
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
                    size: 130,
                    header: () => (
                        <p className="column-title whitespace-normal break-words leading-tight sm:whitespace-nowrap">
                            Ending Qty.
                        </p>
                    ),
                    cell: ({ getValue }) => (
                        <span className="text-foreground">{getValue<number | null>() ?? "-"}</span>
                    ),
                },
            ],
            [typeOptions]
        ),
        refineCoreProps: {
            resource: "items_inventory_all",
            pagination: { pageSize: 10, mode: "server" },
            filters: { mode: "server", initial: [] },
            sorters: {},
        },
    });
    const columnFilters = itemTable.reactTable.getState().columnFilters;

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    useEffect(() => {
        const filters: CrudFilters = [];
        const typeFilterValue = columnFilters.find(
            (filter) => filter.id === "type"
        )?.value;
        const selectedTypeFromColumn =
            typeof typeFilterValue === "string" ? typeFilterValue : undefined;

        if (selectedYear !== "all") {
            filters.push({ field: "year", operator: "eq", value: Number(selectedYear) });
        }

        if (selectedMonth !== "all") {
            const monthNumber = MONTH_TO_NUMBER[selectedMonth];
            if (monthNumber) {
                filters.push({ field: "month", operator: "eq", value: monthNumber });
            }
        }

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
                <p>Manage and track all items in warehouse inventory</p>
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

                        <CreateButton />
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
        </ListView>
    );
};

export default ItemList;
