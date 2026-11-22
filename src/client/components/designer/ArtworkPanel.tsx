import { ImageUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { OutlineThumb } from "@/client/components/OutlineThumb";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { SAMPLES, SHAPES, svgFile } from "@/client/geometry/artwork";
import type { Trace } from "@/shared/trace";

function summary(trace: Trace) {
  const n = trace.interior.length;
  if (n === 0) return "Outline only";
  return `Outline and ${n} interior ${n === 1 ? "path" : "paths"}`;
}

export function ArtworkPanel({
  trace,
  artworkUrl,
  tracing,
  error,
  onArtwork,
}: {
  trace: Trace | null;
  artworkUrl: string | null;
  tracing: boolean;
  error: string | null;
  onArtwork: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // A pasted image anywhere on the page becomes the artwork.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files[0];
      if (file) {
        event.preventDefault();
        onArtwork(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onArtwork]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          data-testid="artwork-drop"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) onArtwork(file);
          }}
          className={cn(
            "flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-center",
            dragging && "border-primary bg-muted",
          )}
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt="Artwork"
              className="max-h-28 max-w-full object-contain"
            />
          ) : (
            <ImageUp className="size-8 text-muted-foreground" aria-hidden />
          )}
          <p className="text-sm text-muted-foreground">
            Drop or paste a PNG, JPG, WebP or SVG
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
          >
            Choose image
          </Button>
          <input
            ref={input}
            type="file"
            data-testid="artwork-input"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onArtwork(file);
            }}
          />
        </div>
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-4">
          {tracing ? (
            <Spinner />
          ) : trace ? (
            <>
              <OutlineThumb
                data-testid="trace-preview"
                outline={trace.outline}
                interior={trace.interior}
                className="h-36 w-full"
              />
              <p
                data-testid="trace-summary"
                className="text-sm text-muted-foreground"
              >
                {summary(trace)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The traced outline shows here.
            </p>
          )}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive" data-testid="artwork-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2" data-testid="shape-picker">
        <span className="mr-1 text-sm text-muted-foreground">Shapes</span>
        {SHAPES.map((shape) => (
          <Button
            key={shape.name}
            variant="secondary"
            size="sm"
            onClick={() => onArtwork(svgFile(shape.name, shape.svg))}
          >
            {shape.name}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="sample-picker">
        <span className="mr-1 text-sm text-muted-foreground">Samples</span>
        {SAMPLES.map((sample) => (
          <Button
            key={sample.name}
            variant="secondary"
            size="sm"
            onClick={() => onArtwork(svgFile(sample.name, sample.svg))}
          >
            {sample.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
