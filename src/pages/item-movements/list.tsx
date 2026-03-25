import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { useList } from "@refinedev/core";
import { useMemo, useState } from "react";

type MctRow = {
    id: string;
    district: string | null;
    department: string | null;
    request_number: string | null;
    request_date: string | null;
    requisitioner: string | null;
    release_date: string | null;
    mct_rel_number: string | null;
    purpose: string | null;
    created_at: string;
};

const ItemMovementListPage = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const { result: mctResult, query: mctQuery } = useList<MctRow>({
        resource: "mcts",
        sorters: [{ field: "created_at", order: "desc" }],
        pagination: { mode: "off" },
    });

    const mcts = mctResult?.data ?? [];
    const filteredMcts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return mcts;
        return mcts.filter((mct) => {
            const haystack = [
                mct.mct_rel_number,
                mct.request_number,
                mct.district,
                mct.department,
                mct.requisitioner,
                mct.purpose,
                mct.request_date,
                mct.release_date,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [mcts, searchQuery]);

    const isLoading = mctQuery.isLoading;
    const listError = mctQuery.error instanceof Error ? mctQuery.error.message : null;

    return (
        <ListView>
            <ListViewHeader title="Issue/Return" />

            <div className="grid gap-6">
                <div className="intro-row">
                    <p className="text-muted-foreground">
                        Manage and track material charge ticket entries
                    </p>
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
                        <CreateButton resource="issue_return">
                            <div className="flex items-center gap-2 font-semibold">
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

                <Card className="border-border/80 shadow-sm">
                    <CardHeader className="border-b">
                        <CardTitle>Material Charge Tickets</CardTitle>
                        <CardDescription>Uploaded material charge ticket entries.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>MCT/Rel #</TableHead>
                                        <TableHead>Request #</TableHead>
                                        <TableHead>District</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Req. Date</TableHead>
                                        <TableHead>Requisitioner</TableHead>
                                        <TableHead>Purpose</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                                                Loading material charge tickets...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredMcts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                                                No material charge tickets yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredMcts.map((mct) => (
                                            <TableRow key={mct.id}>
                                                <TableCell className="font-medium">{mct.mct_rel_number || "-"}</TableCell>
                                                <TableCell>{mct.request_number || "-"}</TableCell>
                                                <TableCell>{mct.district || "-"}</TableCell>
                                                <TableCell>{mct.department || "-"}</TableCell>
                                                <TableCell>{mct.request_date || "-"}</TableCell>
                                                <TableCell>{mct.requisitioner || "-"}</TableCell>
                                                <TableCell className="min-w-[180px] whitespace-normal">
                                                    {mct.purpose || "-"}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ListView>
    );
};

export default ItemMovementListPage;
