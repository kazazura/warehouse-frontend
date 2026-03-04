"use client";

import { cloneElement, isValidElement, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

import { useForgotPassword, useRefineOptions, useLink } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title: string;
    description: string;
  } | null>(null);

  const Link = useLink();

  const { title } = useRefineOptions();
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

  const { mutate: forgotPassword, isPending } = useForgotPassword();

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    forgotPassword({
      email,
    }, {
      onSuccess: () => {
        setFeedback({
          type: "success",
          title: "Reset link sent",
          description:
            "If an account exists for this email, a password reset link has been sent.",
        });
      },
      onError: (error) => {
        setFeedback({
          type: "error",
          title: "Failed to send reset link",
          description:
            error?.message || "Please check the email and try again.",
        });
      },
    });
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
            Forgot password
          </CardTitle>
          <CardDescription
            className={cn("text-muted-foreground", "font-medium")}
          >
            Enter your email to change your password.
          </CardDescription>
        </CardHeader>

        <CardContent className={cn("px-0")}>
          <form onSubmit={handleForgotPassword}>
            <div className={cn("flex", "flex-col", "gap-2")}>
              <Label htmlFor="email">Email</Label>
              <div className={cn("flex", "gap-2")}>
                <Input
                  id="email"
                  type="email"
                  placeholder=""
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn("flex-1")}
                  disabled={isPending}
                />
                <Button
                  type="submit"
                  disabled={isPending}
                  className={cn(
                    "bg-blue-600",
                    "hover:bg-blue-700",
                    "text-white",
                    "px-6",
                  )}
                >
                  {isPending ? (
                    <span className={cn("inline-flex", "items-center", "gap-2")}>
                      <Loader2 className={cn("h-4", "w-4", "animate-spin")} />
                      Sending
                    </span>
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
            </div>
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
              <span>Back</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

ForgotPasswordForm.displayName = "ForgotPasswordForm";
