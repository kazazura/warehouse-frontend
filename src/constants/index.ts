export const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

export const MONTHS_OPTIONS = MONTHS.map((month) => ({
    value: month,
    label: month
}));

export const WAREHOUSE_OPTIONS = [
    { value: "branch_1", label: "Branch 1" },
    { value: "branch_2", label: "Branch 2" },
    { value: "branch_3", label: "Branch 3" },
] as const;

export const SYSTEM_WAREHOUSE = "branch_2" as const;

export const TRANSFER_SOURCE_WAREHOUSE_OPTIONS = WAREHOUSE_OPTIONS.filter(
    (option) => option.value !== SYSTEM_WAREHOUSE
);

export const MOVEMENT_TYPE_OPTIONS = [
    { value: "delivery", label: "Delivery" },
    { value: "return", label: "Return" },
    { value: "transfer", label: "Inter-warehouse Transfer" },
] as const;
