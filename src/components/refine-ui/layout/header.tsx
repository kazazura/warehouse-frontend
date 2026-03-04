import { UserAvatar } from "@/components/refine-ui/layout/user-avatar";
import { ThemeToggle } from "@/components/refine-ui/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  useActiveAuthProvider,
  useGetIdentity,
  useLink,
  useOne,
  useLogout,
  useRefineOptions,
} from "@refinedev/core";
import { Loader2, LogOutIcon, Mail, ShieldCheck, User as UserIcon } from "lucide-react";

export const Header = () => {
  const { isMobile } = useSidebar();

  return <>{isMobile ? <MobileHeader /> : <DesktopHeader />}</>;
};

function DesktopHeader() {
  return (
    <header
      className={cn(
        "sticky",
        "top-0",
        "flex",
        "h-16",
        "shrink-0",
        "items-center",
        "gap-4",
        "border-b",
        "border-border",
        "bg-sidebar",
        "pr-3",
        "justify-end",
        "z-40"
      )}
    >
      <ThemeToggle />
      <UserDropdown />
    </header>
  );
}

function MobileHeader() {
  const { open, isMobile } = useSidebar();

  const { title } = useRefineOptions();

  return (
    <header
      className={cn(
        "sticky",
        "top-0",
        "flex",
        "h-12",
        "shrink-0",
        "items-center",
        "gap-2",
        "border-b",
        "border-border",
        "bg-sidebar",
        "pr-3",
        "justify-between",
        "z-40"
      )}
    >
      <SidebarTrigger
        className={cn("text-muted-foreground", "rotate-180", "ml-1", {
          "opacity-0": open,
          "opacity-100": !open || isMobile,
          "pointer-events-auto": !open || isMobile,
          "pointer-events-none": open && !isMobile,
        })}
      />

      <div
        className={cn(
          "pointer-events-none",
          "absolute",
          "left-1/2",
          "-translate-x-1/2",
          "flex",
          "items-center",
          "gap-2",
          "whitespace-nowrap"
        )}
      >
        <div className={cn("shrink-0")}>{title.icon}</div>
        <h2 className={cn("text-sm", "font-bold")}>{title.text}</h2>
      </div>

      <ThemeToggle className={cn("h-8", "w-8")} />
    </header>
  );
}

const UserDropdown = () => {
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const Link = useLink();
  const { data: identity } = useGetIdentity<{
    id?: string | number;
    email?: string;
    name?: string;
    user_metadata?: { role?: string };
    app_metadata?: { role?: string };
    role?: string;
  }>();
  const currentUserId = identity?.id;
  const { result: userRecord } = useOne<{
    role?: string | null;
  }>({
    resource: "users",
    id: currentUserId ?? "",
    queryOptions: {
      enabled: Boolean(currentUserId),
    },
  });

  const authProvider = useActiveAuthProvider();

  if (!authProvider?.getIdentity) {
    return null;
  }

  const displayName = identity?.name || identity?.email || "Unknown user";
  const displayEmail = identity?.email || "No email";
  const displayRole =
    userRecord?.role ||
    identity?.user_metadata?.role ||
    identity?.app_metadata?.role ||
    "user";
  const normalizedRole = displayRole.toLowerCase();
  const roleBadge = normalizedRole === "admin"
    ? {
        icon: ShieldCheck,
        className: "role-badge-admin",
        label: "Admin",
      }
    : {
        icon: UserIcon,
        className: "role-badge-user",
        label: normalizedRole || "User",
      };
  const RoleIcon = roleBadge.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-10", "w-10", "rounded-full", "p-0")}
        >
          <UserAvatar />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-72", "p-2")}>
        <DropdownMenuLabel className={cn("font-normal", "p-0")}>
          <div
            className={cn(
              "rounded-md",
              "border",
              "bg-muted/40",
              "px-3",
              "py-2.5",
              "space-y-1.5"
            )}
          >
            <span className={cn("text-sm", "font-semibold", "text-foreground")}>
              {displayName}
            </span>
            <span className={cn("text-xs", "text-muted-foreground", "flex", "items-center", "gap-1.5")}>
              <Mail className={cn("h-3.5", "w-3.5")} />
              {displayEmail}
            </span>
            <div className={cn("pt-1")}>
              <Badge variant="outline" className={cn("text-[11px]", "capitalize", roleBadge.className)}>
                <RoleIcon className={cn("h-3.5", "w-3.5")} />
                {roleBadge.label}
              </Badge>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className={cn("flex", "w-full", "items-center", "gap-2")}>
            <UserIcon />
            <span>View Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            logout();
          }}
          className={cn("mt-1")}
        >
          {isLoggingOut ? (
            <>
              <Loader2 className={cn("h-4", "w-4", "animate-spin")} />
              <span>Logging out</span>
            </>
          ) : (
            <>
              <LogOutIcon />
              <span>Logout</span>
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

Header.displayName = "Header";
MobileHeader.displayName = "MobileHeader";
DesktopHeader.displayName = "DesktopHeader";
