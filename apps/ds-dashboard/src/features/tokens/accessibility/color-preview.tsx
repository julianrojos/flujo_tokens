import type { ElementType } from "./types";

interface ColorPreviewProps {
  backgroundColor: string;
  foregroundColor: string;
  elementType: ElementType;
}

function IconSample({ color }: { color: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="3" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="2.5" fill={color} />
    </svg>
  );
}

export function ColorPreview({
  backgroundColor,
  foregroundColor,
  elementType,
}: ColorPreviewProps) {
  return (
    <div className="rounded-lg border border-border/70 p-4">
      <p className="text-sm font-semibold">Preview</p>
      <div
        className="mt-2 flex min-h-[72px] items-center justify-center rounded-md border border-border/60 p-4"
        style={{
          backgroundColor,
          color: foregroundColor,
        }}
      >
        {elementType === "icon" ? (
          <IconSample color={foregroundColor} />
        ) : (
          <p className="text-sm font-medium">Sample text</p>
        )}
      </div>
    </div>
  );
}
