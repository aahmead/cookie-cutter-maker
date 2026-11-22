import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { OutlineThumb } from "@/client/components/OutlineThumb";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  deleteForever,
  getLibrary,
  restoreFromTrash,
} from "@/serverFunctions/designs";

export const Route = createFileRoute("/trash")({
  loader: () => getLibrary({ data: { trashed: true } }),
  head: () => ({ meta: [{ title: "Trash · Cookie Cutter Maker" }] }),
  component: Trash,
});

function Trash() {
  const designs = Route.useLoaderData();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const live = selected.filter((id) => designs.some((d) => d.id === id));

  async function change(work: () => Promise<unknown>, done: string) {
    setPending(true);
    try {
      await work();
      setSelected([]);
      await router.invalidate();
      toast.success(done);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setPending(false);
    }
  }

  const plural = (n: number) => `${n} ${n === 1 ? "design" : "designs"}`;
  const nameOf = (ids: string[]) =>
    ids.length === 1
      ? (designs.find((d) => d.id === ids[0])?.name ?? plural(1))
      : plural(ids.length);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Trash" />

      {designs.length === 0 ? (
        <div data-testid="trash-empty">
          <EmptyState icon={Trash2} title="Trash is empty" />
        </div>
      ) : (
        <div className="space-y-3">
          {live.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
              <span className="mr-auto">{live.length} selected</span>
              <Button
                size="sm"
                variant="outline"
                data-testid="bulk-restore"
                onClick={() =>
                  change(
                    () => restoreFromTrash({ data: { ids: live } }),
                    `Restored ${plural(live.length)}.`,
                  )
                }
              >
                <RotateCcw aria-hidden />
                Restore
              </Button>
              <Button
                size="sm"
                variant="destructive"
                data-testid="bulk-delete-forever"
                onClick={() => setConfirming(live)}
              >
                Delete forever
              </Button>
            </div>
          ) : null}
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {designs.map((design) => (
              <li
                key={design.id}
                data-testid="trash-card"
                className="flex items-center gap-3 px-3 py-2"
              >
                <Checkbox
                  aria-label={`Select ${design.name}`}
                  checked={live.includes(design.id)}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, design.id]
                        : current.filter((id) => id !== design.id),
                    )
                  }
                />
                <OutlineThumb
                  outline={design.outline}
                  className="size-10 shrink-0 rounded bg-muted p-1"
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {design.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="restore-design"
                  disabled={pending}
                  onClick={() =>
                    change(
                      () => restoreFromTrash({ data: { ids: [design.id] } }),
                      `Restored ${design.name}.`,
                    )
                  }
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="delete-forever"
                  disabled={pending}
                  onClick={() => setConfirming([design.id])}
                >
                  Delete forever
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirming ? (
        <ConfirmDialog
          title={`Delete ${nameOf(confirming)} forever?`}
          confirmLabel="Delete forever"
          destructive
          pending={pending}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await change(
              () => deleteForever({ data: { ids: confirming } }),
              `Deleted ${plural(confirming.length)}.`,
            );
            setConfirming(null);
          }}
        >
          This can't be undone.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
