import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme-provider";

/** App-wide toast surface. Themed off the in-app theme (not next-themes) and
 *  wired to the shadcn tokens so toasts match popovers everywhere. */
export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:shadow-2xl",
          description: "group-[.toast]:text-muted-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.75rem",
          "--font-family": "var(--font-sans)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
