"use client";

import { cloneElement, isValidElement, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react";

import { useLink, useRefineOptions, useUpdatePassword } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputPassword } from "@/components/refine-ui/form/input-password";
import { cn } from "@/lib/utils";

export const UpdatePasswordForm = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title: string;
    description: string;
  } | null>(null);

  const Link = useLink();
  const { title } = useRefineOptions();
  const { mutate: updatePassword, isPending } = useUpdatePassword();
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
    setFeedback(null);

    if (password !== confirmPassword) {
      setFeedback({
        type: "error",
        title: "Password mismatch",
        description: "Password and confirm password do not match.",
      });
      return;
    }

    updatePassword(
      { password },
      {
        onSuccess: (result) => {
          if (result?.success) {
            setFeedback({
              type: "success",
              title: "Password updated",
              description: "Your password was updated successfully.",
            });
            return;
          }

          setFeedback({
            type: "error",
            title: "Update failed",
            description:
              result?.error?.message || "Could not update password. Please try again.",
          });
        },
        onError: (error) => {
          setFeedback({
            type: "error",
            title: "Update failed",
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

        <CardContent className={cn("px-0")}>
          <form onSubmit={handleUpdatePassword} className={cn("space-y-4")}>
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
            <div className={cn("flex", "flex-col", "gap-2")}>
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

            <Button type="submit" className={cn("w-full")} disabled={isPending}>
              {isPending ? "Updating..." : "Update Password"}
            </Button>
          </form>

          {feedback ? (
            <Alert
              className={cn("mt-4")}
              variant={feedback.type === "error" ? "destructive" : "default"}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className={cn("text-green-600")} />
              ) : (
                <CircleAlert />
              )}
              <AlertTitle>{feedback.title}</AlertTitle>
              <AlertDescription>{feedback.description}</AlertDescription>
            </Alert>
          ) : null}

          <div className={cn("mt-8")}>
            <Link
              to="/login"
              className={cn(
                "inline-flex",
                "items-center",
                "gap-2",
                "text-sm",
                "text-muted-foreground",
                "hover:text-foreground",
                "transition-colors",
              )}
            >
              <ArrowLeft className={cn("w-4", "h-4")} />
              <span>Back to sign in</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

UpdatePasswordForm.displayName = "UpdatePasswordForm";
