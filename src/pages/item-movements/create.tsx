import { CreateView, CreateViewHeader } from "@/components/refine-ui/views/create-view";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    MOVEMENT_TYPE_OPTIONS,
    SYSTEM_WAREHOUSE,
    TRANSFER_SOURCE_WAREHOUSE_OPTIONS,
} from "@/constants";
import { WarehouseCode } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudFilters, useCreate, useGo, useList, useNotification } from "@refinedev/core";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Link, useSearchParams } from "react-router";

const movementSchema = z
    .object({
        direction: z.enum(["inbound", "outbound"]),
        movement_type: z.enum(["delivery", "return", "transfer"]),
        items: z
            .array(
                z.object({
                    item_id: z.string().min(1, "Item is required"),
                    quantity: z
                        .coerce
                        .number()
                        .int("Quantity must be a whole number")
                        .min(1, "Quantity must be at least 1"),
                })
            )
            .min(1, "At least one item is required"),
        from_warehouse: z.enum(["branch_1", "branch_2", "branch_3"]).optional(),
        to_warehouse: z.enum(["branch_1", "branch_2", "branch_3"]).optional(),
        supplier: z.string().max(120, "Supplier must be 120 characters or fewer").optional(),
        return_reason: z.string().max(300, "Reason must be 300 characters or fewer").optional(),
        reference_number: z
            .string()
            .trim()
            .min(1, "Reference number is required")
            .max(80, "Reference number must be 80 characters or fewer"),
        notes: z.string().max(300, "Notes must be 300 characters or fewer").optional(),
    })
    .superRefine((value, ctx) => {
        if (value.direction === "outbound" && value.movement_type !== "transfer") {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["movement_type"],
                message: "Outbound movements must be inter-warehouse transfers",
            });
        }

        if (value.movement_type === "transfer") {
            if (value.direction === "inbound") {
                if (!value.from_warehouse) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["from_warehouse"],
                        message: "Source warehouse is required for transfers",
                    });
                }

                if (value.from_warehouse === SYSTEM_WAREHOUSE) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["from_warehouse"],
                        message: "Source cannot be Branch 2",
                    });
                }

                if (value.to_warehouse !== SYSTEM_WAREHOUSE) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["to_warehouse"],
                        message: "Destination must be Branch 2",
                    });
                }
            }

            if (value.direction === "outbound") {
                if (value.from_warehouse !== SYSTEM_WAREHOUSE) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["from_warehouse"],
                        message: "Source must be Branch 2",
                    });
                }

                if (!value.to_warehouse || value.to_warehouse === SYSTEM_WAREHOUSE) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["to_warehouse"],
                        message: "Destination must be a branch other than Branch 2",
                    });
                }
            }
        }

        if (value.movement_type === "delivery" && !value.supplier?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["supplier"],
                message: "Supplier is required for delivery",
            });
        }

        if (value.movement_type === "return" && !value.return_reason?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["return_reason"],
                message: "Reason is required for return",
            });
        }

        if (value.direction === "inbound" && value.movement_type !== "transfer") {
            if (value.to_warehouse !== SYSTEM_WAREHOUSE) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["to_warehouse"],
                    message: "Destination must be Branch 2",
                });
            }
        }
    });

type MovementFormValues = z.infer<typeof movementSchema>;

type ItemOption = {
    id: string;
    item_code: string;
    description: string;
};

type SelectedItemSnapshot = {
    id: string;
    code: string;
    label: string;
};

const ItemMovementCreatePage = () => {
    const [searchParams] = useSearchParams();
    const initialDirection = searchParams.get("direction") === "outbound" ? "outbound" : "inbound";
    const selectedItemIdParam = searchParams.get("selected_item_id");
    const go = useGo();
    const { open } = useNotification();
    const { mutateAsync: createMovement, mutation } = useCreate();
    const [direction, setDirection] = useState<"inbound" | "outbound">(initialDirection);
    const [activeItemRowId, setActiveItemRowId] = useState<string | null>(null);
    const [itemPickerOpen, setItemPickerOpen] = useState(false);
    const [itemSearchQuery, setItemSearchQuery] = useState("");
    const [debouncedItemSearchQuery, setDebouncedItemSearchQuery] = useState("");
    const [selectedItemSnapshots, setSelectedItemSnapshots] = useState<Record<string, SelectedItemSnapshot>>({});

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedItemSearchQuery(itemSearchQuery.trim());
        }, 300);
        return () => clearTimeout(timeout);
    }, [itemSearchQuery]);

    const itemFilters = useMemo<CrudFilters>(() => {
        if (!debouncedItemSearchQuery) return [];

        return [
            {
                operator: "or",
                value: [
                    { field: "item_code", operator: "contains", value: debouncedItemSearchQuery },
                    { field: "description", operator: "contains", value: debouncedItemSearchQuery },
                ],
            },
        ];
    }, [debouncedItemSearchQuery]);

    const form = useForm<MovementFormValues>({
        resolver: zodResolver(movementSchema),
        defaultValues: {
            direction: initialDirection,
            movement_type: "delivery",
            items: [{ item_id: "", quantity: 1 }],
            from_warehouse: undefined,
            to_warehouse: SYSTEM_WAREHOUSE,
            supplier: "",
            return_reason: "",
            reference_number: "",
            notes: "",
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const movementType = form.watch("movement_type");

    useEffect(() => {
        form.setValue("direction", direction);
        if (direction === "outbound") {
            form.setValue("movement_type", "transfer");
            form.setValue("from_warehouse", SYSTEM_WAREHOUSE);
            form.setValue("to_warehouse", undefined);
            form.setValue("supplier", "");
            form.setValue("return_reason", "");
        } else {
            form.setValue("to_warehouse", SYSTEM_WAREHOUSE);
            if (movementType === "transfer" && form.getValues("from_warehouse") === SYSTEM_WAREHOUSE) {
                form.setValue("from_warehouse", undefined);
            }
        }
    }, [direction, form, movementType]);

    useEffect(() => {
        if (selectedItemIdParam) {
            form.setValue("items.0.item_id", selectedItemIdParam);
        }
    }, [form, selectedItemIdParam]);

    const { result: itemsResult, query: itemsQuery } = useList<ItemOption>({
        resource: "items",
        pagination: { mode: "server", pageSize: 20 },
        sorters: [{ field: "item_code", order: "asc" }],
        filters: itemFilters,
    });

    const items = itemsResult?.data ?? [];
    const isItemsLoading = itemsQuery.isLoading;

    const itemIdMap = useMemo(() => {
        return new Map(items.map((item) => [String(item.id), item]));
    }, [items]);

    const itemsValue = form.watch("items");

    const handleRemoveItem = (index: number, fieldId: string) => {
        remove(index);
        setSelectedItemSnapshots((prev) => {
            const next = { ...prev };
            delete next[fieldId];
            return next;
        });
        if (activeItemRowId === fieldId) {
            setActiveItemRowId(null);
        }
    };

    const renderItemsSection = (showCreateItemLink: boolean) => (
        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
            {fields.map((field, index) => {
                const rowItemId = itemsValue?.[index]?.item_id ?? "";
                const item = rowItemId ? itemIdMap.get(rowItemId) : undefined;
                const snapshot = selectedItemSnapshots[field.id];
                const selectedItemCode =
                    item?.item_code ?? (snapshot?.id === rowItemId ? snapshot.code : null);
                const selectedItemLabel = item
                    ? `${item.item_code} - ${item.description ?? ""}`
                    : snapshot?.id === rowItemId
                      ? snapshot.label
                      : null;
                return (
                    <div key={field.id} className="rounded-md border border-border/70 bg-background/60 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Item {index + 1}</p>
                            {fields.length > 1 ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveItem(index, field.id)}
                                >
                                    Remove
                                </Button>
                            ) : null}
                        </div>

                        <FormField
                            control={form.control}
                            name={`items.${index}.item_id`}
                            render={({ field: itemField }) => (
                                <FormItem>
                                    <FormLabel>
                                        Item <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <Popover
                                        open={itemPickerOpen && activeItemRowId === field.id}
                                        onOpenChange={(open) => {
                                            setItemPickerOpen(open);
                                            setActiveItemRowId(open ? field.id : null);
                                        }}
                                    >
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    role="combobox"
                                                    className="w-full justify-between overflow-hidden"
                                                >
                                                    <span className="truncate">
                                                        {selectedItemCode ?? "Select item"}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className="w-[var(--radix-popover-trigger-width)] p-0"
                                            align="start"
                                        >
                                            <Command shouldFilter={false}>
                                                <CommandInput
                                                    placeholder="Search item code or description"
                                                    value={itemSearchQuery}
                                                    onValueChange={setItemSearchQuery}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        {isItemsLoading ? "Searching items..." : "No items found."}
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        {items.map((option) => {
                                                            const value = String(option.id);
                                                            const description = option.description ?? "";
                                                            return (
                                                                <CommandItem
                                                                    key={value}
                                                                    value={value}
                                                                    onSelect={() => {
                                                                        itemField.onChange(value);
                                                                        setSelectedItemSnapshots((prev) => ({
                                                                            ...prev,
                                                                            [field.id]: {
                                                                                id: value,
                                                                                code: option.item_code,
                                                                                label: `${option.item_code} - ${description}`,
                                                                            },
                                                                        }));
                                                                        setItemPickerOpen(false);
                                                                        setActiveItemRowId(null);
                                                                    }}
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "h-4 w-4",
                                                                            itemField.value === value ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <p className="truncate">{option.item_code}</p>
                                                                        <p className="text-xs text-muted-foreground truncate">
                                                                            {description}
                                                                        </p>
                                                                    </div>
                                                                </CommandItem>
                                                            );
                                                        })}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    {selectedItemLabel ? (
                                        <FormDescription className="truncate" title={selectedItemLabel}>
                                            {selectedItemLabel}
                                        </FormDescription>
                                    ) : null}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field: quantityField }) => (
                                <FormItem>
                                    <FormLabel>
                                        Quantity <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input type="number" min={1} step={1} {...quantityField} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                );
            })}

            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => append({ item_id: "", quantity: 1 })}>
                    Add line item
                </Button>
                {showCreateItemLink ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link to={`/items/create?returnTo=/item-movements/create&direction=${direction}`}>
                            Add new item
                        </Link>
                    </Button>
                ) : null}
            </div>
        </div>
    );

    const onSubmit = async (values: MovementFormValues) => {
        const isOutbound = values.direction === "outbound";
        const resolvedToWarehouse =
            values.movement_type === "transfer"
                ? isOutbound
                    ? values.to_warehouse ?? null
                    : SYSTEM_WAREHOUSE
                : SYSTEM_WAREHOUSE;
        const basePayload = {
            movement_type: values.movement_type,
            from_warehouse: values.movement_type === "transfer" ? values.from_warehouse ?? null : null,
            to_warehouse: resolvedToWarehouse,
            supplier: values.movement_type === "delivery" ? values.supplier?.trim() || null : null,
            return_reason: values.movement_type === "return" ? values.return_reason?.trim() || null : null,
            reference_number: values.reference_number.trim(),
            notes: values.notes?.trim() || null,
        };

        try {
            await Promise.all(
                values.items.map((item) =>
                    createMovement({
                        resource: "item_movements",
                        values: {
                            ...basePayload,
                            item_id: item.item_id,
                            quantity: item.quantity,
                        },
                    })
                )
            );

            open?.({
                type: "success",
                message: values.items.length > 1 ? "Movements recorded" : "Movement recorded",
                description:
                    values.items.length > 1
                        ? "Inventory movements have been saved."
                        : "Inventory movement has been saved.",
            });

            form.reset({
                direction: values.direction,
                movement_type: values.direction === "outbound" ? "transfer" : "delivery",
                items: [{ item_id: "", quantity: 1 }],
                from_warehouse: values.direction === "outbound" ? SYSTEM_WAREHOUSE : undefined,
                to_warehouse: values.direction === "outbound" ? undefined : SYSTEM_WAREHOUSE,
                supplier: "",
                return_reason: "",
                reference_number: "",
                notes: "",
            });
            setItemSearchQuery("");
            setDebouncedItemSearchQuery("");
            setSelectedItemSnapshots({});
        } catch (error) {
            const description = error instanceof Error ? error.message : "Unable to save movement.";
            open?.({
                type: "error",
                message: "Save failed",
                description,
            });
        }
    };

    return (
        <CreateView className="item-view">
            <CreateViewHeader title="Record Item Movement" />

            <div className="my-4 flex items-center">
                <Card className="item-form-card gap-0 overflow-hidden border-border/80 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle>Movement Entry</CardTitle>
                        <CardDescription>
                            Record inbound inventory and outbound transfers for Branch 2.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Separator className="mb-5" />
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" autoComplete="off">
                                <Tabs value={direction} onValueChange={(value) => setDirection(value as "inbound" | "outbound")}>
                                    <TabsList>
                                        <TabsTrigger value="inbound">Inbound</TabsTrigger>
                                        <TabsTrigger value="outbound">Outbound</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="inbound" className="space-y-4">
                                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="movement_type"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Movement Type <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={(value) => {
                                                                field.onChange(value);
                                                                form.setValue("to_warehouse", SYSTEM_WAREHOUSE);
                                                                if (value !== "transfer") {
                                                                    form.setValue("from_warehouse", undefined);
                                                                }
                                                                if (value !== "delivery") {
                                                                    form.setValue("supplier", "");
                                                                }
                                                                if (value !== "return") {
                                                                    form.setValue("return_reason", "");
                                                                }
                                                            }}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select type" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {MOVEMENT_TYPE_OPTIONS.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>

                                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                                            {movementType === "transfer" ? (
                                                <FormField
                                                    control={form.control}
                                                    name="from_warehouse"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                From Warehouse <span className="text-destructive">*</span>
                                                            </FormLabel>
                                                            <Select
                                                                onValueChange={(value) => field.onChange(value as WarehouseCode)}
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Select source" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {TRANSFER_SOURCE_WAREHOUSE_OPTIONS.map((option) => (
                                                                        <SelectItem key={option.value} value={option.value}>
                                                                            {option.label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            ) : null}

                                            {movementType === "delivery" ? (
                                                <FormField
                                                    control={form.control}
                                                    name="supplier"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                Supplier <span className="text-destructive">*</span>
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter supplier name" autoComplete="off" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            ) : null}

                                            {movementType === "return" ? (
                                                <FormField
                                                    control={form.control}
                                                    name="return_reason"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                Return Reason <span className="text-destructive">*</span>
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Enter return reason" autoComplete="off" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            ) : null}

                                            <FormItem>
                                                <FormLabel>To Warehouse</FormLabel>
                                                <FormControl>
                                                    <Input value="Branch 2" disabled />
                                                </FormControl>
                                            </FormItem>
                                        </div>

                                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="reference_number"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Reference Number <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Reference number" autoComplete="off" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="notes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Notes (Optional)</FormLabel>
                                                        <FormControl>
                                                            <Textarea rows={3} placeholder="Additional remarks" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        {renderItemsSection(movementType === "delivery")}

                                    </TabsContent>

                                    <TabsContent value="outbound" className="space-y-4">
                                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                                            <FormItem>
                                                <FormLabel>Movement Type</FormLabel>
                                                <FormControl>
                                                    <Input value="Inter-warehouse Transfer" disabled />
                                                </FormControl>
                                            </FormItem>

                                        </div>

                                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                                            <FormItem>
                                                <FormLabel>From Warehouse</FormLabel>
                                                <FormControl>
                                                    <Input value="Branch 2" disabled />
                                                </FormControl>
                                            </FormItem>

                                            <FormField
                                                control={form.control}
                                                name="to_warehouse"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            To Warehouse <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={(value) => field.onChange(value as WarehouseCode)}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select destination" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {TRANSFER_SOURCE_WAREHOUSE_OPTIONS.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>

                                        <div className="rounded-lg border bg-muted/10 p-3 space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="reference_number"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Reference Number <span className="text-destructive">*</span>
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Reference number" autoComplete="off" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="notes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Notes (Optional)</FormLabel>
                                                        <FormControl>
                                                            <Textarea rows={3} placeholder="Additional remarks" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        {renderItemsSection(false)}

                                    </TabsContent>
                                </Tabs>

                                <Separator className="mt-1" />
                                <CardFooter className="justify-between px-0 pt-5">
                                    <p className="text-xs text-muted-foreground">
                                        {mutation.isPending ? "Saving movement..." : "Required fields are marked with *."}
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() =>
                                                go({
                                                    to: "/item-movements",
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
                                                    Saving
                                                </span>
                                            ) : (
                                                "Record Movement"
                                            )}
                                        </Button>
                                    </div>
                                </CardFooter>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
        </CreateView>
    );
};

export default ItemMovementCreatePage;
