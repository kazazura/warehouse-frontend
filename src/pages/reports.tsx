import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Lock } from "lucide-react";

const ReportsPage = () => {
	return (
		<ListView>
			<ListViewHeader title="Reports" />
			<div className="mx-auto max-w-3xl space-y-6">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Reports</h1>
					<p className="text-muted-foreground">Data insights, but make it exclusive.</p>
				</div>

				<Card className="border-dashed">
					<CardHeader className="space-y-3">
						<div className="flex items-center gap-2">
							<Badge className="gap-1.5">
								<Crown className="h-3.5 w-3.5" />
								Premium Access Only
							</Badge>
						</div>
						<CardTitle className="flex items-center gap-2 text-xl">
							<Lock className="h-5 w-5" />
							Reports are locked behind the VIP paywall
						</CardTitle>
						<CardDescription>
							You currently have the free plan, which includes imagination and optimism.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button type="button" disabled>
							Upgrade to Premium
						</Button>
					</CardContent>
					<CardContent>
						<CardDescription>
							(Joke)
						</CardDescription>
					</CardContent>
				</Card>
			</div>
		</ListView>
	);
};

export default ReportsPage;
