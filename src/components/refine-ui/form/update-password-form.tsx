"use client";

import { cloneElement, isValidElement, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  useLink,
  useRefineOptions,
  useUpdatePassword,
  useNotification,
} from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InputPassword } from "@/components/refine-ui/form/input-password";
import { cn } from "@/lib/utils";

export const UpdatePasswordForm = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { open } = useNotification();

  const Link = useLink();
  const { title } = useRefineOptions();
  const { mutate: updatePassword, isPending } = useUpdatePassword({
    successNotification: false,
    errorNotification: false,
  });
  const brandIcon = useMemo(() => {
    if (!isValidElement<{ style?: React.CSSProperties; className?: string }>(title.icon)) {
      return title.icon;
    }

    return cloneElement(title.icon, {
      style: {
        ...(title.icon.props.style || {}),
        width: "52px",
        height: "52px",
      },
      className: cn(title.icon.props.className, "h-13 w-13"),
    });
  }, [title.icon]);

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      open?.({
        type: "error",
        message: "Password mismatch",
        description: "Password and confirm password do not match.",
      });
      return;
    }

    updatePassword(
      { password },
      {
        onSuccess: (result) => {
          if (result?.success) {
            open?.({
              type: "success",
              message: "Password updated",
              description: "Your password was updated successfully.",
            });
            return;
          }

          open?.({
            type: "error",
            message: "Update failed",
            description:
              result?.error?.message || "Could not update password. Please try again.",
          });
        },
        onError: (error) => {
          open?.({
            type: "error",
            message: "Update failed",
            description: error?.message || "Could not update password. Please try again.",
          });
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "flex",
        "flex-col",
        "items-center",
        "justify-center",
        "px-6",
        "py-8",
        "min-h-svh",
      )}
    >
      <div className={cn("flex", "items-center", "justify-center", "gap-3")}>
        {brandIcon && (
          <div className={cn("text-foreground", "shrink-0")}>{brandIcon}</div>
        )}
        <div className={cn("text-left")}>
          <p className={cn("text-xs", "uppercase", "tracking-[0.18em]", "text-muted-foreground")}>
            Aleco
          </p>
          <p className={cn("text-xl", "font-semibold", "leading-none", "text-foreground")}>
            Warehouse
          </p>
        </div>
      </div>

      <Card className={cn("sm:w-[456px]", "p-12", "mt-6")}>
        <CardHeader className={cn("px-0")}>
          <CardTitle
            className={cn(
              "text-blue-600",
              "dark:text-blue-400",
              "text-3xl",
              "font-semibold",
            )}
          >
            Update password
          </CardTitle>
          <CardDescription className={cn("text-muted-foreground", "font-medium")}>
            Enter your new password.
          </CardDescription>
        </CardHeader>

        <Separator />

        <CardContent className={cn("px-0")}>
          <form onSubmit={handleUpdatePassword}>
            <div className={cn("flex", "flex-col", "gap-2")}>
              <Label htmlFor="new-password">New Password</Label>
              <InputPassword
                id="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isPending}
              />
            </div>
            <div className={cn("flex", "flex-col", "gap-2", "mt-6")}>
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <InputPassword
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                disabled={isPending}
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className={cn("w-full", "mt-6")}
              disabled={isPending}
            >
              {isPending ? (
                <span className={cn("inline-flex", "items-center", "gap-2")}>
                  <Loader2 className={cn("h-4", "w-4", "animate-spin")} />
                  Updating
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </form>

        </CardContent>
        <Separator />

        <CardFooter>
          <div className={cn("w-full", "text-center text-sm")}>
            <span className={cn("text-sm", "text-muted-foreground")}>
              Remember your password?{" "}
            </span>
            <Link
              to="/login"
              className={cn(
                "text-blue-600",
                "dark:text-blue-400",
                "font-semibold",
                "underline",
                "inline-flex",
                "items-center",
                "gap-2",
              )}
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

UpdatePasswordForm.displayName = "UpdatePasswordForm";
