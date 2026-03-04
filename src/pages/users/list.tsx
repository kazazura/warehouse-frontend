import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { Loader2, Pencil, Plus, Search, ShieldCheck, Trash, User as UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { useTable } from "@refinedev/react-table";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { UserRow } from "@/types";
import { CrudFilters, useGetIdentity, useNotification, useUpdate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { supabaseClient } from "@/providers/supabase-client";
import AvatarUploadWidget from "@/components/users/avatar-upload-widget";

const USER_AVATAR_BUCKET = "user-avatars";

const toDisplayName = (row: UserRow): string => {
	const fullName =
		row.name ??
		[row.first_name, row.last_name].filter(Boolean).join(" ");

	return fullName?.trim() || "-";
};

const toDisplayDate = (value?: string | null): string => {
	if (!value) return "-";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "-";
	return parsed.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

const formatUserId = (id: string | number): string => {
	const value = String(id);
	if (value.length <= 12) return value;
	return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

const getRoleBadgeConfig = (roleValue?: string | null) => {
	const normalizedRole = (roleValue || "user").toLowerCase();

	if (normalizedRole === "admin") {
		return {
			label: "Admin",
			icon: ShieldCheck,
			className: "role-badge-admin",
		};
	}

	return {
		label: normalizedRole || "User",
		icon: UserIcon,
		className: "role-badge-user",
	};
};

const UserList = () => {

	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<UserRow | null>(null);
	const [editFirstName, setEditFirstName] = useState("");
	const [editLastName, setEditLastName] = useState("");
	const [editRole, setEditRole] = useState("");
	const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
	const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const [deletingUserId, setDeletingUserId] = useState<string | number | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
	const { mutate: updateUser, mutation } = useUpdate<UserRow>();
	const isUpdatingUser = mutation.status === "pending";
	const { open } = useNotification();
	const { data: currentUser } = useGetIdentity<{ id?: string | number }>();
	const currentUserId = String(currentUser?.id ?? "");
	const lastSearchErrorRef = useRef<string | null>(null);

	const openEditDialog = useCallback((user: UserRow) => {
		setEditingUser(user);
		setEditFirstName(user.first_name ?? "");
		setEditLastName(user.last_name ?? "");
		setEditRole((user.role ?? "user").toLowerCase() === "admin" ? "admin" : "user");
		setEditAvatarFile(null);
		setEditAvatarUrl(user.avatar_url ?? null);
		setEditDialogOpen(true);
	}, []);

	const handleSaveEdit = async () => {
		if (!editingUser?.id) return;

		const normalizedFirstName = editFirstName.trim();
		const normalizedLastName = editLastName.trim();
		const normalizedRole = editRole.trim().toLowerCase() || "user";
		const name = [normalizedFirstName, normalizedLastName]
			.filter(Boolean)
			.join(" ");
		const userId = String(editingUser.id);
		let nextAvatarUrl = editAvatarUrl;

		if (editAvatarFile) {
			const extension = editAvatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
			const avatarPath = `avatars/${userId}/avatar.${extension}`;

			setIsUploadingAvatar(true);
			const { error: uploadError } = await supabaseClient.storage
				.from(USER_AVATAR_BUCKET)
				.upload(avatarPath, editAvatarFile, {
					upsert: true,
					cacheControl: "3600",
					contentType: editAvatarFile.type,
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
				id: editingUser.id,
				values: {
					name: name || null,
					first_name: normalizedFirstName || null,
					last_name: normalizedLastName || null,
					role: normalizedRole,
					avatar_url: nextAvatarUrl,
				},
				successNotification: false,
			},
			{
				onSuccess: () => {
					setEditDialogOpen(false);
					setEditingUser(null);
					setEditAvatarFile(null);
					setEditAvatarUrl(null);
					open?.({
						type: "success",
						message: "User updated",
						description: "User information has been saved.",
					});
					userTable.refineCore.tableQuery.refetch();
				},
			}
		);
	};

	const requestDeleteUser = useCallback((user: UserRow) => {
		setUserToDelete(user);
		setDeleteDialogOpen(true);
	}, []);

	const handleCopyUserId = useCallback(
		async (fullId: string) => {
			try {
				await navigator.clipboard.writeText(fullId);
				open?.({
					type: "success",
					message: "User ID copied",
					description: fullId,
				});
			} catch {
				open?.({
					type: "error",
					message: "Copy failed",
					description: "Could not copy user ID to clipboard.",
				});
			}
		},
		[open]
	);

	const handleDeleteUser = async () => {
		const user = userToDelete;
		if (!user) return;

		const targetId = String(user.id ?? "");
		if (!targetId) return;
		if (targetId === currentUserId) {
			open?.({
				type: "error",
				message: "Action blocked",
				description: "You cannot delete your own account.",
			});
			setDeleteDialogOpen(false);
			setUserToDelete(null);
			return;
		}

		setDeletingUserId(targetId);
		const { error } = await supabaseClient.rpc("admin_delete_user", {
			target_user_id: targetId,
		});
		setDeletingUserId(null);

		if (error) {
			open?.({
				type: "error",
				message: "Delete failed",
				description: error.message,
			});
			return;
		}

		open?.({
			type: "success",
			message: "User deleted",
			description: "The account has been removed and can no longer sign in.",
		});
		setDeleteDialogOpen(false);
		setUserToDelete(null);
		userTable.refineCore.tableQuery.refetch();
	};

	const userTable = useTable<UserRow>({
		columns: useMemo<ColumnDef<UserRow>[]>(
			() => [
				{
					id: "id",
					accessorKey: "id",
					size: 150,
					header: () => <p className="column-title ml-2">User ID</p>,
					cell: ({ row }) => {
						const fullId = String(row.original.id ?? "-");
						return (
							<Badge
								title={`Click to copy: ${fullId}`}
								className="cursor-pointer select-none"
								onClick={() => void handleCopyUserId(fullId)}
							>
								{formatUserId(fullId)}
							</Badge>
						);
					},
				},
				{
					id: "name",
					accessorFn: (row) => toDisplayName(row),
					size: 250,
					header: () => <p className="column-title">Name</p>,
					cell: ({ row }) => (
						<span className="text-foreground">{toDisplayName(row.original)}</span>
					),
					filterFn: "includesString",
				},
				{
					id: "email",
					accessorFn: (row) => row.email ?? "",
					size: 280,
					header: () => <p className="column-title">Email</p>,
					cell: ({ row }) => (
						<span className="text-foreground">{row.original.email ?? "-"}</span>
					),
					filterFn: "includesString",
				},
				{
					id: "role",
					accessorFn: (row) => row.role ?? "",
					size: 140,
					header: () => <p className="column-title">Role</p>,
					cell: ({ row }) => {
						const role = row.original.role ?? "user";
						const { icon: Icon, label, className } = getRoleBadgeConfig(role);

						return (
							<Badge variant="outline" className={className}>
								<Icon className="h-3 w-3" />
								<span className="capitalize">{label}</span>
							</Badge>
						);
					},
					filterFn: "includesString",
				},
				{
					id: "created_at",
					accessorFn: (row) => row.created_at ?? "",
					size: 160,
					header: () => <p className="column-title">Created</p>,
					cell: ({ row }) => (
						<span className="text-foreground">{toDisplayDate(row.original.created_at)}</span>
					),
				},
				{
					id: "actions",
					size: 100,
					header: () => <p className="column-title">Actions</p>,
					enableSorting: false,
					enableColumnFilter: false,
					cell: ({ row }) => {
						const isDeleting = deletingUserId === String(row.original.id ?? "");
						const isCurrentUser = String(row.original.id ?? "") === currentUserId;
						return (
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => openEditDialog(row.original)}
									disabled={isDeleting}
									title="Edit user"
									className="h-8 w-8 p-0"
								>
									<Pencil className="h-4 w-4" />
									<span className="sr-only">Edit</span>
								</Button>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => requestDeleteUser(row.original)}
									disabled={isDeleting || isCurrentUser}
									title={isCurrentUser ? "You cannot delete your own account" : "Delete user"}
									className="h-8 w-8 p-0"
								>
									<Trash className="h-4 w-4" />
									<span className="sr-only">{isDeleting ? "Deleting user" : "Delete"}</span>
								</Button>
							</div>
						);
					},
				},
			],
			[currentUserId, deletingUserId, handleCopyUserId, openEditDialog]
		),
		refineCoreProps: {
			resource: "users",
			pagination: { pageSize: 10, mode: "server" },
			filters: {
				mode: "server",
				initial: [],
			},
		},
	});
	const searchableFields = useMemo(
		() => ["email", "name", "first_name", "last_name"] as const,
		[]
	);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setDebouncedSearchQuery(searchQuery.trim());
		}, 300);

		return () => clearTimeout(timeoutId);
	}, [searchQuery]);

	useEffect(() => {
		const filters: CrudFilters = [];

		if (debouncedSearchQuery) {
			const normalizedQuery = debouncedSearchQuery.trim().toLowerCase();
			const roleTerms = new Set(["admin", "user"]);
			const orConditions: CrudFilters[number]["value"] = searchableFields.map((field) => ({
				field,
				operator: "contains" as const,
				value: debouncedSearchQuery,
			}));

			// Include role search only for explicit role terms to avoid noisy matches like "er" -> "user".
			if (roleTerms.has(normalizedQuery)) {
				orConditions.push({
					field: "role",
					operator: "eq",
					value: normalizedQuery,
				});
			}

			filters.push({
				operator: "or",
				value: orConditions,
			});
		}

		userTable.refineCore.setFilters(filters, "replace");
	}, [
		debouncedSearchQuery,
		searchableFields,
		userTable.refineCore.setFilters,
	]);

	useEffect(() => {
		const queryError = userTable.refineCore.tableQuery.error as { message?: string } | null;
		const message = queryError?.message ?? null;
		if (!message || message === lastSearchErrorRef.current) return;

		lastSearchErrorRef.current = message;
		open?.({
			type: "error",
			message: "User search failed",
			description: message,
		});
	}, [open, userTable.refineCore.tableQuery.error]);

	return (
		<ListView>
			<ListViewHeader title="Users" />

			<div className="intro-row">
				<p className="text-muted-foreground">Manage and track users in the system</p>
				<div className="actions-row">
					<div className="search-field">
						<Search className="search-icon" />
						<Input
							type="text"
							placeholder="Search user..."
							className="pl-10 w-full"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					<div className="flex gap-2 w-full sm:w-auto">
						<CreateButton>
							<div className="flex items-center gap-2 font-semibold">
								<Plus className="w-4 h-4" />
								<span>Add User</span>
							</div>
						</CreateButton>
					</div>
				</div>
			</div>

			<DataTable table={userTable} />

			<Dialog
				open={editDialogOpen}
				onOpenChange={(openState) => {
					setEditDialogOpen(openState);
					if (!openState) {
						setEditingUser(null);
						setEditAvatarFile(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-xl overflow-hidden p-0 border-border/80 shadow-sm">
					<DialogHeader className="border-b px-6 py-5">
						<DialogTitle className="text-2xl">Edit User</DialogTitle>
						<DialogDescription>Update user details and role.</DialogDescription>
					</DialogHeader>

					<div className="grid gap-5 px-6 py-6">
						<div className="grid gap-2">
							<p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile Picture</p>
							<AvatarUploadWidget
								value={editAvatarFile}
								previewUrl={editAvatarUrl}
								onFileChange={setEditAvatarFile}
								onClearPreview={() => setEditAvatarUrl(null)}
								disabled={isUpdatingUser || isUploadingAvatar}
							/>
						</div>

						<div className="grid gap-4 rounded-xl border border-border/80 bg-muted/10 p-4">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">User Details</p>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<p className="text-sm font-medium">First Name</p>
									<Input
										value={editFirstName}
										onChange={(e) => setEditFirstName(e.target.value)}
										placeholder="First name"
										className="bg-background"
									/>
								</div>
								<div className="grid gap-1.5">
									<p className="text-sm font-medium">Last Name</p>
									<Input
										value={editLastName}
										onChange={(e) => setEditLastName(e.target.value)}
										placeholder="Last name"
										className="bg-background"
									/>
								</div>
							</div>

							<div className="grid gap-1.5">
								<p className="text-sm font-medium">Role</p>
								<Select value={editRole || "user"} onValueChange={setEditRole}>
									<SelectTrigger className="h-11 w-full rounded-lg border-border/80 bg-background">
										<SelectValue placeholder="Select role" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="admin">Admin</SelectItem>
										<SelectItem value="user">User</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>

					<DialogFooter className="items-center border-t px-6 py-4 sm:justify-end">
						<p className="mr-auto text-left text-xs text-muted-foreground">
							{isUploadingAvatar
								? "Uploading avatar..."
								: isUpdatingUser
									? "Saving changes..."
									: "Changes apply immediately."}
						</p>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setEditDialogOpen(false);
								setEditAvatarFile(null);
							}}
							disabled={isUpdatingUser || isUploadingAvatar}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleSaveEdit}
							disabled={isUpdatingUser || isUploadingAvatar || !editingUser}
						>
							{isUploadingAvatar || isUpdatingUser ? (
								<span className="inline-flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" />
									{isUploadingAvatar ? "Uploading" : "Saving"}
								</span>
							) : (
								"Save Changes"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={deleteDialogOpen}
				onOpenChange={(openState) => {
					setDeleteDialogOpen(openState);
					if (!openState) setUserToDelete(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete User</DialogTitle>
						<DialogDescription>
							This will permanently delete the account and remove login access.
						</DialogDescription>
					</DialogHeader>

					<div className="rounded-md border p-3 text-sm text-muted-foreground">
						<p>Email: <span className="text-foreground">{userToDelete?.email ?? "-"}</span></p>
						<p>ID: <span className="text-foreground">{formatUserId(String(userToDelete?.id ?? "-"))}</span></p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setDeleteDialogOpen(false);
								setUserToDelete(null);
							}}
							disabled={Boolean(deletingUserId)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void handleDeleteUser()}
							disabled={Boolean(deletingUserId) || !userToDelete}
						>
							{deletingUserId ? (
								<span className="inline-flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" />
									Deleting
								</span>
							) : (
								"Delete User"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ListView>
	);
};

export default UserList;
