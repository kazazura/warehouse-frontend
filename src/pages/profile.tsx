import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useLink, useNotification, useOne, useUpdate } from "@refinedev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, User as UserIcon } from "lucide-react";
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
import { Home } from "lucide-react";

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
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const [previousPath, setPreviousPath] = useState<string | null>(null);

	useEffect(() => {
		if (!userRecord) return;
		setFirstName(userRecord.first_name ?? "");
		setLastName(userRecord.last_name ?? "");
		setAvatarUrl(userRecord.avatar_url ?? null);
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
				className: "border-green-200 bg-green-50 text-green-700",
				label: "Admin",
			};
		}

		return {
			icon: UserIcon,
			className: "border-blue-200 bg-blue-50 text-blue-700",
			label: normalizedRole || "User",
		};
	}, [normalizedRole]);

	const RoleIcon = roleBadge.icon;
	const displayEmail = userRecord?.email ?? identity?.email ?? "-";
	const isLoading = identityLoading || query.isLoading;
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
				},
				{
					onSuccess: () => {
						setAvatarFile(null);
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

	return (
		<div className="space-y-6">
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
        <p className="text-muted-foreground">View and edit your account details</p>
      </div>

			<Card className="mx-auto w-full max-w-2xl">
				<CardHeader>
					<CardTitle>Profile Information</CardTitle>
					<CardDescription>Edit your own account information.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : (
						<>
							<div className="grid gap-1.5">
								<p className="text-center text-sm font-medium">Avatar</p>
								<AvatarUploadWidget
									value={avatarFile}
									previewUrl={avatarUrl}
									onFileChange={setAvatarFile}
									onClearPreview={() => setAvatarUrl(null)}
									disabled={isSaving || isUploadingAvatar}
								/>
							</div>

							<div className="grid gap-1.5">
								<p className="text-sm font-medium">Email</p>
								<Input value={displayEmail} readOnly disabled />
							</div>

							<div className="grid gap-1.5">
								<p className="text-sm font-medium">Role</p>
								<Badge variant="outline" className={cn("w-fit capitalize", roleBadge.className)}>
									<RoleIcon className="h-3.5 w-3.5" />
									{roleBadge.label}
								</Badge>
							</div>

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

							<div className="pt-2 flex justify-end">
								<Button type="button" onClick={handleSave} disabled={isSaving || isUploadingAvatar || !userId}>
									{isUploadingAvatar ? "Uploading..." : isSaving ? "Saving..." : "Save Changes"}
								</Button>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

export default ProfilePage;
