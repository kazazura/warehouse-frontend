import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { useState } from "react";

const ItemMovementListPage = () => {
    const [searchQuery, setSearchQuery] = useState("");

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
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                                            No material charge tickets yet.
                                        </TableCell>
                                    </TableRow>
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
