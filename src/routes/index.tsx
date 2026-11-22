import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { OutlineThumb } from "@/client/components/OutlineThumb";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Field, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Toggle } from "@/client/components/ui/toggle";
import {
  editTags,
  getLibrary,
  moveToTrash,
  setFavorite,
} from "@/serverFunctions/designs";

export const Route = createFileRoute("/")({
  loader: () => getLibrary({ data: { trashed: false } }),
  head: () => ({ meta: [{ title: "Designs · Cookie Cutter Maker" }] }),
  component: Library,
});

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

function Library() {
  const designs = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState(false);

  const allTags = useMemo(
    () => [...new Set(designs.flatMap((d) => d.tags))].sort(),
    [designs],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = designs.filter(
      (d) =>
        (!q ||
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q)) &&
        (!favoritesOnly || d.favorite) &&
        tagFilter.every((t) => d.tags.includes(t)),
    );
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      const order = a.createdAt.localeCompare(b.createdAt);
      return sort === "oldest" ? order : -order;
    });
  }, [designs, query, sort, favoritesOnly, tagFilter]);
  const filtering = query.trim() !== "" || favoritesOnly || tagFilter.length > 0;
  const live = selected.filter((id) => designs.some((d) => d.id === id));

  async function change(work: () => Promise<unknown>, done?: string) {
    try {
      await work();
      await router.invalidate();
      if (done) toast.success(done);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work.");
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Designs"
        actions={
          <Button render={<Link to="/designer" />}>
            <Plus aria-hidden />
            New design
          </Button>
        }
      />

      {designs.length === 0 ? (
        <div data-testid="library-empty">
          <EmptyState
            title="No designs yet"
            description="Designs you save appear here."
            action={
              <Button render={<Link to="/designer" />} variant="outline">
                New design
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                data-testid="design-search"
                aria-label="Search designs"
                placeholder="Search designs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="bg-card pl-9"
              />
            </div>
            <Select
              items={[...SORTS]}
              value={sort}
              onValueChange={(value) => value && setSort(value)}
            >
              <SelectTrigger
                className="w-40 bg-card"
                data-testid="design-sort"
                aria-label="Sort"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Toggle
              variant="outline"
              data-testid="favorites-only"
              pressed={favoritesOnly}
              onPressedChange={setFavoritesOnly}
            >
              <Star aria-hidden />
              Favourites
            </Toggle>
          </div>
          {allTags.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Tags</span>
              {allTags.map((tag) => (
                <Toggle
                  key={tag}
                  size="sm"
                  variant="outline"
                  data-testid={`tag-filter-${tag}`}
                  pressed={tagFilter.includes(tag)}
                  onPressedChange={(on) =>
                    setTagFilter((current) =>
                      on ? [...current, tag] : current.filter((t) => t !== tag),
                    )
                  }
                >
                  {tag}
                </Toggle>
              ))}
            </div>
          ) : null}

          {live.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
              <span className="mr-auto">{live.length} selected</span>
              <Button
                size="sm"
                variant="outline"
                data-testid="bulk-tags"
                onClick={() => setEditingTags(true)}
              >
                Edit tags
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="bulk-trash"
                onClick={() =>
                  change(async () => {
                    await moveToTrash({ data: { ids: live } });
                    setSelected([]);
                  }, `Moved ${live.length} to trash.`)
                }
              >
                <Trash2 aria-hidden />
                Move to trash
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          ) : null}

          {shown.length === 0 ? (
            <div data-testid="library-no-results">
              <EmptyState
                kind="filtered"
                title="No designs match"
                action={
                  filtering ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setFavoritesOnly(false);
                        setTagFilter([]);
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {shown.map((design) => {
                const isSelected = live.includes(design.id);
                return (
                  <li
                    key={design.id}
                    data-testid="design-card"
                    className={cn(
                      "flex gap-3 rounded-lg border border-border bg-card p-3",
                      isSelected && "border-primary",
                    )}
                  >
                    <Link
                      to="/designer"
                      search={{ design: design.id }}
                      className="flex size-20 shrink-0 items-center justify-center rounded-md bg-muted p-2"
                      aria-label={`Open ${design.name}`}
                    >
                      <OutlineThumb outline={design.outline} className="size-full" />
                    </Link>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start gap-2">
                        <Link
                          to="/designer"
                          search={{ design: design.id }}
                          className="min-w-0 flex-1 truncate font-medium hover:underline"
                        >
                          {design.name}
                        </Link>
                        <Checkbox
                          aria-label={`Select ${design.name}`}
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...current, design.id]
                                : current.filter((id) => id !== design.id),
                            )
                          }
                        />
                      </div>
                      {design.description ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {design.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1">
                        {design.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                        <span className="ml-auto flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            data-testid="favorite-toggle"
                            aria-label={`Favourite ${design.name}`}
                            aria-pressed={design.favorite}
                            onClick={() =>
                              change(() =>
                                setFavorite({
                                  data: { id: design.id, favorite: !design.favorite },
                                }),
                              )
                            }
                          >
                            <Star
                              aria-hidden
                              className={cn(
                                design.favorite && "fill-primary text-primary",
                              )}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            data-testid="trash-design"
                            aria-label={`Move ${design.name} to trash`}
                            onClick={() =>
                              change(
                                () => moveToTrash({ data: { ids: [design.id] } }),
                                `Moved ${design.name} to trash.`,
                              )
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {editingTags ? (
        <TagsDialog
          count={live.length}
          onClose={() => setEditingTags(false)}
          onSave={async (add, remove) => {
            await editTags({ data: { ids: live, add, remove } });
            await router.invalidate();
            setSelected([]);
            setEditingTags(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}

const splitTags = (text: string) =>
  [
    ...new Set(
      text
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

function TagsDialog({
  count,
  onClose,
  onSave,
}: {
  count: number;
  onClose: () => void;
  onSave: (add: string[], remove: string[]) => Promise<void>;
}) {
  const [add, setAdd] = useState("");
  const [remove, setRemove] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await onSave(splitTags(add), splitTags(remove));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "That didn't work.");
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Edit tags of {count} {count === 1 ? "design" : "designs"}
            </DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="tags-add">Add tags</FieldLabel>
            <Input
              id="tags-add"
              placeholder="holiday, gifts"
              value={add}
              onChange={(event) => setAdd(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="tags-remove">Remove tags</FieldLabel>
            <Input
              id="tags-remove"
              value={remove}
              onChange={(event) => setRemove(event.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="bulk-tags-submit"
              pending={pending}
              disabled={!splitTags(add).length && !splitTags(remove).length}
            >
              Save tags
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
