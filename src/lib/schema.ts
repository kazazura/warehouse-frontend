import * as z from "zod";

export const itemCreateSchema = z.object({
    item_code: z
        .string()
        .trim()
        .min(1, "Item code is required")
        .max(50, "Item code is too long"),

    description: z
        .string()
        .trim()
        .min(1, "Description is required")
        .max(255, "Description is too long"),

    type: z
        .string()
        .trim()
        .min(1, "Type is required")
        .max(100, "Type is too long"),

    buffer_stock: z
        .coerce
        .number()
        .int("Buffer stock must be a whole number")
        .min(0, "Buffer stock must be at least 0"),

    starting_qty: z
        .coerce
        .number()
        .int("Starting quantity must be a whole number")
        .min(0, "Starting quantity must be at least 0")
        .optional(),

    month: z
        .coerce
        .number()
        .int("Month is required")
        .min(1, "Month must be between 1 and 12")
        .max(12, "Month must be between 1 and 12"),

    year: z
        .coerce
        .number()
        .int("Year is required")
        .min(2000, "Year must be 2000 or later")
        .max(2100, "Year is out of range"),
});

export type ItemCreateValues = z.infer<typeof itemCreateSchema>;
