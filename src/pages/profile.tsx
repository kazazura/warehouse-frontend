import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useLink, useNotification, useOne, useUpdate } from "@refinedev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, Home, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { UserRow } from "@/types";
import { cn } from "@/lib/utils";
import AvatarUploadWidget from "@/components/users/avatar-upload-widget";
import { supabaseClient } from "@/providers/supabase-client";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

const USER_AVATAR_BUCKET = "user-avatars";

const ProfilePage = () => {
	const Link = useLink();
	const { data: identity, isLoading: identityLoading } = useGetIdentity<{
		id?: string | number;
		email?: string;
		role?: string;
	}>();
	const { open } = useNotification();
	const { mutate: updateUser, mutation } = useUpdate<UserRow>();
	const isSaving = mutation.status === "pending";

	const userId = identity?.id ? String(identity.id) : "";
	const { result: userRecord, query } = useOne<UserRow>({
		resource: "users",
		id: userId,
		queryOptions: {
			enabled: Boolean(userId),
		},
	});

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [initialFirstName, setInitialFirstName] = useState("");
	const [initialLastName, setInitialLastName] = useState("");
	const [initialAvatarUrl, setInitialAvatarUrl] = useState<string | null>(null);
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const [previousPath, setPreviousPath] = useState<string | null>(null);
	const [isIdCopied, setIsIdCopied] = useState(false);

	useEffect(() => {
		if (!userRecord) return;
		const nextFirstName = userRecord.first_name ?? "";
		const nextLastName = userRecord.last_name ?? "";
		const nextAvatarUrl = userRecord.avatar_url ?? null;
		setFirstName(nextFirstName);
		setLastName(nextLastName);
		setAvatarUrl(nextAvatarUrl);
		setInitialFirstName(nextFirstName);
		setInitialLastName(nextLastName);
		setInitialAvatarUrl(nextAvatarUrl);
	}, [userRecord]);

	useEffect(() => {
		const storedPreviousPath = sessionStorage.getItem("previousPath");
		if (!storedPreviousPath || storedPreviousPath === "/profile") {
			setPreviousPath(null);
			return;
		}

		setPreviousPath(storedPreviousPath);
	}, []);

	const normalizedRole = (userRecord?.role ?? identity?.role ?? "user").toLowerCase();
	const roleBadge = useMemo(() => {
		if (normalizedRole === "admin") {
			return {
				icon: ShieldCheck,
				className: "role-badge-admin",
				label: "Admin",
			};
		}

		return {
			icon: UserIcon,
			className: "role-badge-user",
			label: normalizedRole || "User",
		};
	}, [normalizedRole]);

	const RoleIcon = roleBadge.icon;
	const displayEmail = userRecord?.email ?? identity?.email ?? "-";
	const isLoading = identityLoading || query.isLoading;
	const hasChanges = useMemo(() => {
		const currentFirstName = firstName.trim();
		const currentLastName = lastName.trim();
		const baselineFirstName = initialFirstName.trim();
		const baselineLastName = initialLastName.trim();
		const currentAvatar = avatarUrl ?? null;
		const baselineAvatar = initialAvatarUrl ?? null;

		return (
			currentFirstName !== baselineFirstName ||
			currentLastName !== baselineLastName ||
			currentAvatar !== baselineAvatar ||
			Boolean(avatarFile)
		);
	}, [avatarFile, avatarUrl, firstName, initialAvatarUrl, initialFirstName, initialLastName, lastName]);
	const canSave = Boolean(userId) && hasChanges && !isSaving && !isUploadingAvatar;
	const canCancel = hasChanges && !isSaving && !isUploadingAvatar;
	const toSidebarLabel = (path: string): string => {
		const cleanPath = path.split("?")[0].split("#")[0];
		const firstSegment = cleanPath.split("/").filter(Boolean)[0] ?? "";

		if (!firstSegment) return "Dashboard";

		const sidebarLabelMap: Record<string, string> = {
			dashboard: "Dashboard",
			items: "Inventory",
			users: "Users",
			reports: "Reports",
			profile: "Profile",
		};

		return sidebarLabelMap[firstSegment] ?? firstSegment.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
	};

	const previousPageLabel = useMemo(() => {
		if (!previousPath) return "";
		return toSidebarLabel(previousPath);
	}, [previousPath]);

	const handleSave = () => {
		if (!userId) return;

		const normalizedFirstName = firstName.trim();
		const normalizedLastName = lastName.trim();
		const displayName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ");
		const saveProfile = async () => {
			let nextAvatarUrl = avatarUrl;

			if (avatarFile) {
				const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
				const avatarPath = `avatars/${userId}/avatar.${extension}`;

				setIsUploadingAvatar(true);
				const { error: uploadError } = await supabaseClient.storage
					.from(USER_AVATAR_BUCKET)
					.upload(avatarPath, avatarFile, {
						upsert: true,
						cacheControl: "3600",
						contentType: avatarFile.type,
					});
				setIsUploadingAvatar(false);

				if (uploadError) {
					open?.({
						type: "error",
						message: "Avatar upload failed",
						description: uploadError.message,
					});
					return;
				}

				const { data: publicUrlData } = supabaseClient.storage
					.from(USER_AVATAR_BUCKET)
					.getPublicUrl(avatarPath);
				const basePublicUrl = publicUrlData.publicUrl;
				const version = Date.now();
				nextAvatarUrl = basePublicUrl.includes("?")
					? `${basePublicUrl}&v=${version}`
					: `${basePublicUrl}?v=${version}`;
			}

			updateUser(
				{
					resource: "users",
					id: userId,
					values: {
						first_name: normalizedFirstName || null,
						last_name: normalizedLastName || null,
						name: displayName || null,
						avatar_url: nextAvatarUrl,
					},
					successNotification: false,
				},
				{
					onSuccess: () => {
						const savedFirstName = normalizedFirstName;
						const savedLastName = normalizedLastName;
						const savedAvatar = nextAvatarUrl ?? null;
						setAvatarFile(null);
						setFirstName(savedFirstName);
						setLastName(savedLastName);
						setAvatarUrl(savedAvatar);
						setInitialFirstName(savedFirstName);
						setInitialLastName(savedLastName);
						setInitialAvatarUrl(savedAvatar);
						open?.({
							type: "success",
							message: "Profile updated",
							description: "Your profile information has been saved.",
						});
						query.refetch();
					},
					onError: (error) => {
						open?.({
							type: "error",
							message: "Update failed",
							description: error.message,
						});
					},
				}
			);
		};

		void saveProfile();
	};

	const handleCopyAccountId = async () => {
		if (!userId) return;

		try {
			await navigator.clipboard.writeText(userId);
			setIsIdCopied(true);
			setTimeout(() => setIsIdCopied(false), 1200);
		} catch {
			open?.({
				type: "error",
				message: "Copy failed",
				description: "Could not copy account ID.",
			});
		}
	};

	const handleCancel = () => {
		setFirstName(initialFirstName);
		setLastName(initialLastName);
		setAvatarUrl(initialAvatarUrl);
		setAvatarFile(null);
	};

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6">
			<div className="flex items-center relative gap-2">
				<div className="bg-background z-[2] pr-4">
					<Breadcrumb>
						<BreadcrumbList className="text-sm">
							<BreadcrumbItem>
								<Home className="h-4 w-4" />
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							{previousPath ? (
								<>
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link to={previousPath}>
												{previousPageLabel}
											</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
								</>
							) : null}
							<BreadcrumbItem>
								<BreadcrumbPage>Profile</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</div>
				<Separator className="absolute left-0 right-0 z-[1]" />
			</div>

			<div>
				<h1 className="text-2xl font-bold">Profile</h1>
				<p className="text-muted-foreground">Manage your personal account information.</p>
			</div>

			{isLoading ? (
				<div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
					<Card className="h-full overflow-hidden border-border/80 shadow-sm">
						<CardHeader className="border-b">
							<Skeleton className="h-6 w-28" />
							<Skeleton className="h-4 w-full" />
						</CardHeader>
						<CardContent className="space-y-4">
							<Skeleton className="mx-auto h-28 w-28 rounded-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-6 w-24" />
						</CardContent>
					</Card>
					<Card className="h-full overflow-hidden border-border/80 shadow-sm">
						<CardHeader className="border-b">
							<Skeleton className="h-6 w-48" />
							<Skeleton className="h-4 w-full" />
						</CardHeader>
						<CardContent className="space-y-4">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</CardContent>
						<CardFooter>
							<Skeleton className="ml-auto h-10 w-28" />
						</CardFooter>
					</Card>
				</div>
			) : (
				<div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
					<Card className="h-full overflow-hidden border-border/80 shadow-sm">
						<CardHeader className="border-b">
							<CardTitle>Profile Summary</CardTitle>
							<CardDescription>Your account identity and role in the system.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6 pt-6">
							<div className="grid gap-1.5">
								<p className="text-center text-sm font-medium">Profile Picture</p>
								<AvatarUploadWidget
									value={avatarFile}
									previewUrl={avatarUrl}
									onFileChange={setAvatarFile}
									onClearPreview={() => setAvatarUrl(null)}
									disabled={isSaving || isUploadingAvatar}
								/>
							</div>

							<div className="space-y-4 rounded-lg border bg-muted/10 p-3">
								<div className="grid gap-1.5">
									<div className="flex items-center justify-between gap-2">
										<p className="text-sm font-medium">Account ID</p>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs"
											onClick={() => void handleCopyAccountId()}
										>
											{isIdCopied ? (
												<>
													<Check className="h-3.5 w-3.5" />
													Copied
												</>
											) : (
												<>
													<Copy className="h-3.5 w-3.5" />
													Copy ID
												</>
											)}
										</Button>
									</div>
									<Input value={userId || "-"} readOnly disabled className="font-mono text-xs" />
								</div>

								<div className="grid gap-1.5">
									<p className="text-sm font-medium">Email</p>
									<Input value={displayEmail} readOnly disabled />
								</div>
							</div>

							<div className="grid gap-1.5 rounded-lg border bg-muted/10 p-3">
								<p className="text-sm font-medium">Role</p>
								<Badge variant="outline" className={cn("w-fit capitalize", roleBadge.className)}>
									<RoleIcon className="h-3.5 w-3.5" />
									{roleBadge.label}
								</Badge>
							</div>
						</CardContent>
					</Card>

					<Card className="h-full overflow-hidden border-border/80 shadow-sm">
						<CardHeader className="space-y-3 border-b">
							<div className="flex items-center justify-between gap-3">
								<CardTitle>Account Information</CardTitle>
								{hasChanges ? (
									<Badge variant="outline" className="status-badge-warning">
										Unsaved changes
									</Badge>
								) : (
									<Badge variant="outline" className="status-badge-success">
										Up to date
									</Badge>
								)}
							</div>
							<CardDescription>Update your name details. Changes apply to your profile immediately.</CardDescription>
						</CardHeader>
						<CardContent className="flex-1 space-y-5 pt-6">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<p className="text-sm font-medium">First Name</p>
									<Input
										value={firstName}
										onChange={(event) => setFirstName(event.target.value)}
										placeholder="First name"
										disabled={isSaving}
									/>
								</div>

								<div className="grid gap-1.5">
									<p className="text-sm font-medium">Last Name</p>
									<Input
										value={lastName}
										onChange={(event) => setLastName(event.target.value)}
										placeholder="Last name"
										disabled={isSaving}
									/>
								</div>
							</div>

							<div className="rounded-lg border bg-muted/10 p-3">
								<p className="text-xs text-muted-foreground">
									Profile updates affect your display name across the system.
								</p>
							</div>
						</CardContent>
						<CardFooter className="justify-between border-t">
							<p className="text-xs text-muted-foreground">
								{hasChanges ? "You have unsaved changes." : "All changes saved."}
							</p>
							<div className="flex items-center gap-2">
								<Button type="button" variant="outline" onClick={handleCancel} disabled={!canCancel}>
									Cancel
								</Button>
								<Button type="button" onClick={handleSave} disabled={!canSave}>
									{isUploadingAvatar || isSaving ? (
										<span className="inline-flex items-center gap-2">
											<Loader2 className="h-4 w-4 animate-spin" />
											{isUploadingAvatar ? "Uploading" : "Saving"}
										</span>
									) : (
										"Save Changes"
									)}
								</Button>
							</div>
						</CardFooter>
					</Card>
				</div>
			)}
		</div>
	);
};

export default ProfilePage;
