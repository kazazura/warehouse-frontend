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

export type UserRow = {
    id: string | number;
    email?: string | null;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
    full_name?: string | null;
    app_role?: string | null;
    role?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    user_metadata?: {
        name?: string;
        first_name?: string;
        last_name?: string;
    } | null;
};
