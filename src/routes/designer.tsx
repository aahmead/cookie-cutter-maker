import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Download, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { ArtworkPanel } from "@/client/components/designer/ArtworkPanel";
import { Preview3D } from "@/client/components/designer/Preview3D";
import {
  DEFAULT_PROFILE,
  ProfileBar,
} from "@/client/components/designer/ProfileBar";
import { SettingsPanel } from "@/client/components/designer/SettingsPanel";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
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
import { Textarea } from "@/client/components/ui/textarea";
import {
  acceptedArtwork,
  ArtworkError,
  traceArtwork,
} from "@/client/geometry/artwork";
import {
  buildModel,
  footprint,
  overallSize,
  toStl,
} from "@/client/geometry/model";
import { getDesign, saveDesign } from "@/serverFunctions/designs";
import {
  deleteProfile,
  getProfiles,
  saveProfile,
} from "@/serverFunctions/profiles";
import {
  DEFAULT_SETTINGS,
  SIZE_KEYS,
  displayLength,
  sameProfileValues,
  validateSettings,
  type CutterSettings,
} from "@/shared/settings";
import type { Trace } from "@/shared/trace";

export const Route = createFileRoute("/designer")({
  // Tracing and the 3D preview need the browser.
  ssr: false,
  validateSearch: z.object({ design: z.string().uuid().optional() }),
  loaderDeps: ({ search }) => ({ design: search.design }),
  loader: async ({ deps }) => {
    const [profiles, design] = await Promise.all([
      getProfiles(),
      deps.design ? getDesign({ data: { id: deps.design } }) : null,
    ]);
    return { profiles, design, requested: deps.design ?? null };
  },
  head: () => ({ meta: [{ title: "Designer · Cookie Cutter Maker" }] }),
  component: DesignerPage,
});

function DesignerPage() {
  const { design, requested } = Route.useLoaderData();
  if (requested && !design)
    return (
      <AppShell nav={<AppNav />}>
        <PageHeader title="Designer" />
        <div data-testid="design-not-found">
          <EmptyState
            kind="error"
            title="Design not found"
            action={
              <Button render={<Link to="/" />} variant="outline">
                Back to designs
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  return <Designer key={design?.id ?? "new"} />;
}

type Profile = Awaited<ReturnType<typeof getProfiles>>[number];

function Designer() {
  const { design, profiles } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  const [name, setName] = useState(design?.name ?? "");
  const [description, setDescription] = useState(design?.description ?? "");
  const [trace, setTrace] = useState<Trace | null>(design?.trace ?? null);
  const [artwork, setArtwork] = useState<File | null>(null);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(
    design ? `/api/designs/${design.id}/artwork` : null,
  );
  const [tracing, setTracing] = useState(false);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [settings, setSettings] = useState<CutterSettings>(
    design?.settings ?? DEFAULT_SETTINGS,
  );
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE);
  const [dialog, setDialog] = useState<null | "save" | "profile" | "delete">(
    null,
  );

  useEffect(
    () => () => {
      if (artworkUrl?.startsWith("blob:")) URL.revokeObjectURL(artworkUrl);
    },
    [artworkUrl],
  );

  const onArtwork = useCallback(async (picked: File) => {
    setArtworkError(null);
    setTracing(true);
    try {
      const file = acceptedArtwork(picked);
      const next = await traceArtwork(file);
      setTrace(next);
      setArtwork(file);
      setArtworkUrl(URL.createObjectURL(file));
    } catch (error) {
      setArtworkError(
        error instanceof ArtworkError
          ? error.message
          : "That image couldn't be traced. Try another one.",
      );
    } finally {
      setTracing(false);
    }
  }, []);

  const problems = useMemo(() => validateSettings(settings), [settings]);
  const problemList = Object.values(problems);
  const geometry = useMemo(
    () =>
      trace && problemList.length === 0 ? buildModel(trace, settings) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trace, settings, problemList.length],
  );
  const aspect = useMemo(() => {
    if (!trace) return 1;
    const f = footprint(trace, { ...settings, sizeMode: "longest", size: 1 });
    return f.width / f.height;
  }, [trace, settings]);

  const selectedProfile: Profile | null =
    profiles.find((p) => p.id === profileId) ?? null;
  const modified = selectedProfile
    ? !sameProfileValues(
        settings,
        selectedProfile.settings,
        selectedProfile.includesSize,
      )
    : !sameProfileValues(settings, DEFAULT_SETTINGS, false);

  function applyProfile(id: string) {
    setProfileId(id);
    const profile = profiles.find((p) => p.id === id);
    const values = profile?.settings ?? DEFAULT_SETTINGS;
    const next = { ...values };
    if (!profile?.includesSize)
      for (const key of SIZE_KEYS)
        (next as Record<string, unknown>)[key] = settings[key];
    setSettings(next);
  }

  function download() {
    if (!geometry) return;
    const blob = new Blob([toStl(geometry)], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName(design?.name ?? "Cookie cutter")}.stl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const overall = trace && problemList.length === 0 ? overallSize(trace, settings) : null;
  const triangles = geometry
    ? geometry.getAttribute("position").count / 3
    : 0;

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={design?.name ?? "New design"}
        description={design?.description || undefined}
        actions={
          <>
            <Button
              variant="outline"
              data-testid="save-design"
              disabled={!trace || tracing}
              onClick={() => setDialog("save")}
            >
              <Save aria-hidden />
              {design ? "Save changes" : "Save"}
            </Button>
            <Button
              data-testid="download-stl"
              disabled={!geometry}
              onClick={download}
            >
              <Download aria-hidden />
              Download STL
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Artwork</CardTitle>
        </CardHeader>
        <CardContent>
          <ArtworkPanel
            trace={trace}
            artworkUrl={artworkUrl}
            tracing={tracing}
            error={artworkError}
            onArtwork={onArtwork}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Preview3D geometry={geometry} />
          <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
            <span data-testid="overall-size">
              {overall
                ? `Overall ${displayLength(overall.width, settings.units)} × ${displayLength(overall.height, settings.units)} ${settings.units}`
                : trace
                  ? "Fix the settings below to see the model."
                  : "Add artwork to see the model."}
            </span>
            {geometry ? (
              <span data-testid="model-stats">
                {triangles.toLocaleString("en")} triangles
              </span>
            ) : null}
          </div>
          {problemList.length ? (
            <Alert variant="destructive" data-testid="settings-error">
              <AlertDescription>
                <ul>
                  {problemList.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Settings</CardTitle>
          <ProfileBar
            profiles={profiles}
            selected={profileId}
            modified={modified}
            onSelect={applyProfile}
            onSave={() => setDialog("profile")}
            onDelete={() => setDialog("delete")}
          />
        </CardHeader>
        <CardContent>
          <SettingsPanel
            settings={settings}
            problems={problems}
            aspect={aspect}
            onChange={setSettings}
            onReset={() => {
              setSettings(DEFAULT_SETTINGS);
              setProfileId(DEFAULT_PROFILE);
            }}
          />
        </CardContent>
      </Card>

      {dialog === "save" && trace ? (
        <SaveDesignDialog
          initialName={name}
          initialDescription={description}
          onClose={() => setDialog(null)}
          onSave={async (nextName, nextDescription) => {
            const form = new FormData();
            form.set(
              "design",
              JSON.stringify({
                ...(design ? { id: design.id } : {}),
                name: nextName,
                description: nextDescription,
                trace,
                settings,
              }),
            );
            if (artwork) form.set("artwork", artwork);
            const saved = await saveDesign({ data: form });
            setName(nextName);
            setDescription(nextDescription);
            setArtwork(null);
            setDialog(null);
            toast.success(`Saved ${nextName}.`);
            if (design) await router.invalidate();
            else
              await navigate({
                to: "/designer",
                search: { design: saved.id },
              });
          }}
        />
      ) : null}

      {dialog === "profile" ? (
        <SaveProfileDialog
          initialName={selectedProfile?.name ?? ""}
          onClose={() => setDialog(null)}
          onSave={async (profileName, includesSize) => {
            const saved = await saveProfile({
              data: { name: profileName, settings, includesSize },
            });
            await router.invalidate();
            setProfileId(saved.id);
            setDialog(null);
            toast.success(`Saved profile ${profileName}.`);
          }}
        />
      ) : null}

      {dialog === "delete" && selectedProfile ? (
        <DeleteProfileDialog
          name={selectedProfile.name}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteProfile({ data: { id: selectedProfile.id } });
            setProfileId(DEFAULT_PROFILE);
            await router.invalidate();
            setDialog(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function fileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Cookie cutter";
}

function useSubmit(work: () => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    pending,
    error,
    run: async () => {
      setPending(true);
      setError(null);
      try {
        await work();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That didn't work.");
      } finally {
        setPending(false);
      }
    },
  };
}

function SaveDesignDialog({
  initialName,
  initialDescription,
  onClose,
  onSave,
}: {
  initialName: string;
  initialDescription: string;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const submit = useSubmit(() => onSave(name.trim(), description.trim()));
  return (
    <Dialog open onOpenChange={(open) => !open && !submit.pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void submit.run();
          }}
        >
          <DialogHeader>
            <DialogTitle>Save design</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="design-name">Name</FieldLabel>
            <Input
              id="design-name"
              value={name}
              maxLength={120}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="design-description">Description</FieldLabel>
            <Textarea
              id="design-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {submit.error ? (
            <Alert variant="destructive">
              <AlertDescription>{submit.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="save-design-submit"
              pending={submit.pending}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveProfileDialog({
  initialName,
  onClose,
  onSave,
}: {
  initialName: string;
  onClose: () => void;
  onSave: (name: string, includesSize: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [includesSize, setIncludesSize] = useState(false);
  const submit = useSubmit(() => onSave(name.trim(), includesSize));
  return (
    <Dialog open onOpenChange={(open) => !open && !submit.pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void submit.run();
          }}
        >
          <DialogHeader>
            <DialogTitle>Save settings profile</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="profile-name">Profile name</FieldLabel>
            <Input
              id="profile-name"
              value={name}
              maxLength={60}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              aria-label="Include size"
              checked={includesSize}
              onCheckedChange={(checked) => setIncludesSize(checked)}
            />
            <span
              aria-hidden
              className="cursor-pointer text-sm select-none"
              onClick={() => setIncludesSize(!includesSize)}
            >
              Include size
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Saving under an existing name replaces that profile.
          </p>
          {submit.error ? (
            <Alert variant="destructive">
              <AlertDescription>{submit.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="save-profile-submit"
              pending={submit.pending}
              disabled={!name.trim()}
            >
              Save profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProfileDialog({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const submit = useSubmit(onConfirm);
  return (
    <ConfirmDialog
      title={`Delete ${name}?`}
      confirmLabel="Delete profile"
      destructive
      pending={submit.pending}
      onClose={onClose}
      onConfirm={() => void submit.run()}
    >
      {submit.error}
    </ConfirmDialog>
  );
}
