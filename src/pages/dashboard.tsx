import { useList } from "@refinedev/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, TrendingUp, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const toNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const getItemIdFromItem = (item: any): string | number | null => {
    return item?.id ?? null;
};

const getItemIdFromRecord = (record: any): string | number | null => {
    return record?.item_id ?? record?.inventory_item_id ?? null;
};

const getRecordTimestamp = (record: any): number => {
    const timestampSource = record?.recorded_at ?? record?.updated_at ?? record?.created_at;
    const parsed = timestampSource ? new Date(timestampSource).getTime() : NaN;
    if (Number.isFinite(parsed)) {
        return parsed;
    }

    if (typeof record?.year === "number" && typeof record?.month === "number") {
        return new Date(record.year, record.month - 1, 1).getTime();
    }

    return -Infinity;
};

const Dashboard = () => {
    // Fetch all items
    const { query: itemsQuery } = useList({
        resource: "items",
        pagination: { mode: "off" },
    });

    // Fetch inventory records for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { query: recordsQuery } = useList({
        resource: "inventory_records",
        pagination: { mode: "off" },
        filters: [
            {
                field: "recorded_at",
                operator: "gte",
                value: sixMonthsAgo.toISOString(),
            },
        ],
    });

    const { query: allRecordsQuery } = useList({
        resource: "inventory_records",
        pagination: { mode: "off" },
    });

    const items = itemsQuery.data?.data || [];
    const chartRecords = recordsQuery.data?.data || [];
    const allRecords = allRecordsQuery.data?.data || [];

    const latestRecordByItem = allRecords.reduce((acc: Map<string | number, any>, record: any) => {
        const itemId = getItemIdFromRecord(record);
        if (itemId === null) {
            return acc;
        }

        const existing = acc.get(itemId);
        const recordTime = getRecordTimestamp(record);
        const existingTime = existing ? getRecordTimestamp(existing) : -Infinity;

        if (!existing || recordTime >= existingTime) {
            acc.set(itemId, record);
        }

        return acc;
    }, new Map<string | number, any>());

    // Calculate metrics
    const totalItems = items.length;
    const lowStockCount = items.filter((item: any) => {
        const itemId = getItemIdFromItem(item);
        const latestRecord = itemId !== null ? latestRecordByItem.get(itemId) : null;
        const currentQuantity = latestRecord ? toNumber(latestRecord.ending_qty) : null;
        const bufferStock = toNumber(item.buffer_stock);
        if (bufferStock <= 0 || currentQuantity === null) {
            return false;
        }
        return currentQuantity <= bufferStock;
    }).length;

    // Group items by type
    const itemsByType = items.reduce((acc: Record<string, number>, item: any) => {
        const type = item.type || "Unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    // Prepare monthly data for chart
    const monthlyData = chartRecords.reduce((acc: any[], record: any) => {
        const date = new Date(record.recorded_at ?? record.created_at);
        if (Number.isNaN(date.getTime())) {
            return acc;
        }

        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const monthSort = Date.UTC(year, monthIndex, 1);
        const monthYear = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

        const existing = acc.find((d) => d.monthSort === monthSort);
        if (existing) {
            existing.totalQuantity += toNumber(record.ending_qty);
        } else {
            acc.push({
                month: monthYear,
                monthSort,
                totalQuantity: toNumber(record.ending_qty),
            });
        }
        return acc;
    }, []);

    // Sort by date
    monthlyData.sort((a: any, b: any) => a.monthSort - b.monthSort);

    const isLoading = itemsQuery.isLoading || recordsQuery.isLoading || allRecordsQuery.isLoading;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground">Overview of your warehouse inventory and key metrics</p>
            </div>

            {/* Metric Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Total Items Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{totalItems || 0}</div>
                                <p className="text-xs text-muted-foreground">Items in inventory</p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Low Stock Alert Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold text-orange-500">{lowStockCount || 0}</div>
                                <p className="text-xs text-muted-foreground">Items below buffer stock</p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Item Types Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Item Categories</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{Object.keys(itemsByType).length || 0}</div>
                                <p className="text-xs text-muted-foreground">Different types</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Items by Type Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle>Inventory by Type</CardTitle>
                    <CardDescription>Distribution of items across different categories</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ) : Object.keys(itemsByType).length > 0 ? (
                        <div className="space-y-4">
                            {Object.entries(itemsByType).map(([type, count]) => (
                                <div key={type} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">{type}</span>
                                        <span className="font-medium">
                                            {String(count)} {Number(count) === 1 ? "item" : "items"}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full"
                                            style={{
                                                width: `${(Number(count) / (totalItems || 1)) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>No items in inventory yet</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Monthly Overview Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Monthly Inventory Summary</CardTitle>
                    <CardDescription>Total inventory levels over the last 6 months</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-72 w-full" />
                    ) : monthlyData.length > 0 && monthlyData.some((d: { totalQuantity: number }) => d.totalQuantity > 0) ? (
                        <ChartContainer
                            config={{
                                totalQuantity: {
                                    label: "Total Quantity",
                                    color: "var(--chart-1)",
                                },
                            }}
                            className="h-72 w-full">
                            <BarChart data={monthlyData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="month" className="text-xs" />
                                <YAxis className="text-xs" />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="totalQuantity" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>No inventory data available yet</p>
                            <p className="text-xs mt-2">Add inventory records to see monthly trends</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Dashboard;
