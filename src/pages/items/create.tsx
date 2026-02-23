import { CreateView, CreateViewHeader } from "@/components/refine-ui/views/create-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ItemImportPanel } from "@/components/items/item-import-panel";
import { useItemImport } from "@/hooks/use-item-import";
import { itemCreateSchema, ItemCreateValues } from "@/lib/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreate, useGo } from "@refinedev/core";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

const ItemCreate = () => {
    const go = useGo();
    const { mutateAsync: createRecord, mutation } = useCreate();
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const { importFile, setImportFile, fileSummary } = useItemImport();

    const monthOptions = useMemo(
        () =>
            Array.from({ length: 12 }, (_, index) => ({
                label: new Date(0, index, 1).toLocaleString("en-US", { month: "long" }),
                value: index + 1,
            })),
        []
    );

    const yearOptions = useMemo(
        () => Array.from({ length: 6 }, (_, offset) => currentYear - 2 + offset),
        [currentYear]
    );

    const form = useForm<ItemCreateValues>({
        resolver: zodResolver(itemCreateSchema),
        defaultValues: {
            item_code: "",
            description: "",
            type: "",
            buffer_stock: 0,
            starting_qty: undefined,
            month: currentDate.getMonth() + 1,
            year: currentYear,
        },
    });

    const onSubmit = async (values: ItemCreateValues) => {
        const createdItem = await createRecord({
            resource: "items",
            values: {
                item_code: values.item_code.trim(),
                description: values.description.trim(),
                type: values.type.trim(),
                buffer_stock: values.buffer_stock,
            },
        });

        const itemId = createdItem?.data?.id;
        if (itemId == null) {
            go({
                to: "/items",
                type: "replace",
            });
            return;
        }

        const startingQty = values.starting_qty ?? 0;
        const inventoryValues = {
            month: values.month,
            year: values.year,
            starting_qty: startingQty,
            ending_qty: startingQty,
        };

        try {
            await createRecord({
                resource: "inventory_records",
                values: {
                    item_id: itemId,
                    ...inventoryValues,
                },
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

            if (message.includes("item_id")) {
                await createRecord({
                    resource: "inventory_records",
                    values: {
                        inventory_item_id: itemId,
                        ...inventoryValues,
                    },
                });
            } else {
                throw error;
            }
        }

        go({
            to: "/items",
            type: "replace",
        });
    };

    return (
        <CreateView className="item-view">
            <CreateViewHeader title="Add an Item" />

            <div className="my-4 flex items-center">
                <Card className="item-form-card">
                    {/* <CardHeader>
                        <CardTitle className="text-2xl pb-0 font-semibold">Item Details</CardTitle>
                    </CardHeader>
                    <Separator /> */}

                    <CardContent className="mt-4">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-5"
                                autoComplete="off"
                            >
                                <ItemImportPanel
                                    file={importFile}
                                    onFileChange={setImportFile}
                                    showFooter={false}
                                />
                                {fileSummary ? (
                                    <p className="text-xs text-muted-foreground">
                                        Selected file: {fileSummary.name} ({fileSummary.sizeLabel})
                                    </p>
                                ) : null}


                                <FormField
                                    control={form.control}
                                    name="item_code"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Item Code <span className="text-destructive">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input placeholder="INV-××××××××" required autoComplete="off" {...field} />
                                            </FormControl>
                                            <FormDescription>Unique item identifier.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Type <span className="text-destructive">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input placeholder="" required autoComplete="off" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="buffer_stock"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Buffer Stock</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={0} step={1} autoComplete="off" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid items-start gap-4 sm:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="starting_qty"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Starting Quantity</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        autoComplete="off"
                                                        value={field.value ?? ""}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            field.onChange(value === "" ? undefined : Number(value));
                                                        }}
                                                        onBlur={field.onBlur}
                                                        name={field.name}
                                                        ref={field.ref}
                                                    />
                                                </FormControl>
                                                <FormDescription>Starting quantity of each month.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="month"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Month</FormLabel>
                                                <Select
                                                    onValueChange={(value) => field.onChange(Number(value))}
                                                    value={String(field.value)}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select month" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {monthOptions.map((month) => (
                                                            <SelectItem key={month.value} value={String(month.value)}>
                                                                {month.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="year"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Year</FormLabel>
                                                <Select
                                                    onValueChange={(value) => field.onChange(Number(value))}
                                                    value={String(field.value)}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select year" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {yearOptions.map((year) => (
                                                            <SelectItem key={year} value={String(year)}>
                                                                {year}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Description <span className="text-destructive">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Describe the item and specification"
                                                    className="min-h-28"
                                                    required
                                                    autoComplete="off"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <Separator />

                                <div className="flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            go({
                                                to: "/items",
                                                type: "replace",
                                            })
                                        }
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={mutation.isPending}>
                                        {mutation.isPending ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Saving...
                                            </span>
                                        ) : (
                                            "Add Item"
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
        </CreateView>
    );
};

export default ItemCreate;
