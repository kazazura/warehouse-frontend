export type ItemInventoryRow = {
    id: number;
    item_code: string;
    description: string;
    type: string;
    month: number | null;
    year: number | null;
    starting_qty: number | null;
    buffer_stock: number | null;
    ending_qty: number | null;
};