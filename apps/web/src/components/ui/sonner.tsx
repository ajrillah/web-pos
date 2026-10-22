import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** App-wide toasts, styled with theme tokens. Mounted once in main.tsx. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'rounded-[18px]! border-border! bg-popover! text-popover-foreground! shadow-card! font-sans! text-[15px]!',
          description: 'text-muted-foreground!',
          // Green is reserved for paid/change, so confirmations stay neutral.
          success: '[&_[data-icon]]:text-foreground!',
          error: 'text-destructive!',
        },
      }}
      {...props}
    />
  );
}
