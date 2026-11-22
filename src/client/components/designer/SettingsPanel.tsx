import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  LABELS,
  type CutterSettings,
  type NumericKey,
  type SettingsProblems,
} from "@/shared/settings";
import { Choice, LengthField, SwitchRow } from "./fields";

const HANDLE_SHAPES = [
  { value: "rectangle", label: "Rectangle" },
  { value: "round", label: "Round" },
  { value: "chamfer", label: "Chamfer" },
] as const;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
);

export function SettingsPanel({
  settings: s,
  problems,
  aspect,
  onChange,
  onReset,
}: {
  settings: CutterSettings;
  problems: SettingsProblems;
  /** The artwork's width over its height. */
  aspect: number;
  onChange: (next: CutterSettings) => void;
  onReset: () => void;
}) {
  const set = (patch: Partial<CutterSettings>) => onChange({ ...s, ...patch });
  const length = (key: NumericKey, patch?: (mm: number) => Partial<CutterSettings>) => (
    <LengthField
      label={LABELS[key]}
      value={s[key]}
      units={s.units}
      error={problems[key]}
      onChange={(mm) => set(patch ? patch(mm) : { [key]: mm })}
    />
  );

  return (
    <div className="space-y-5">
      <Group title="Type">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Choice
            label="Type"
            testId="type"
            value={s.type}
            options={[
              { value: "cutter", label: "Cutter" },
              { value: "imprint", label: "Imprint cutter" },
            ]}
            onChange={(type) => set({ type })}
          />
          <Choice
            label="Units"
            testId="units"
            value={s.units}
            options={[
              { value: "mm", label: "mm" },
              { value: "in", label: "in" },
            ]}
            onChange={(units) => set({ units })}
          />
        </div>
      </Group>

      <Group title="Size">
        <Choice
          label="Size by"
          testId="size-mode"
          value={s.sizeMode}
          options={[
            { value: "longest", label: "Longest side" },
            { value: "dimensions", label: "Width and height" },
          ]}
          onChange={(sizeMode) => {
            if (sizeMode === "dimensions") {
              const width = aspect >= 1 ? s.size : s.size * aspect;
              const height = aspect >= 1 ? s.size / aspect : s.size;
              set({ sizeMode, width: round(width), height: round(height) });
            } else set({ sizeMode, size: round(Math.max(s.width, s.height)) });
          }}
        />
        {s.sizeMode === "longest" ? (
          <Grid>{length("size")}</Grid>
        ) : (
          <>
            <Grid>
              {length("width", (width) =>
                s.keepProportions
                  ? { width, height: round(width / aspect) }
                  : { width },
              )}
              {length("height", (height) =>
                s.keepProportions
                  ? { height, width: round(height * aspect) }
                  : { height },
              )}
            </Grid>
            <SwitchRow
              label="Keep proportions"
              checked={s.keepProportions}
              onChange={(keepProportions) =>
                set(
                  keepProportions
                    ? { keepProportions, height: round(s.width / aspect) }
                    : { keepProportions },
                )
              }
            />
          </>
        )}
      </Group>

      <Group title="Blade">
        <Grid>
          {length("bladeDepth")}
          {length("bladeThickness")}
        </Grid>
        <SwitchRow
          label="Thicker blade base"
          checked={s.thicken}
          onChange={(thicken) => set({ thicken })}
        />
        {s.thicken ? (
          <Grid>
            {length("thickenDepth")}
            {length("thickenThickness")}
          </Grid>
        ) : null}
        <SwitchRow
          label="Sharp tip"
          checked={s.sharpTip}
          onChange={(sharpTip) => set({ sharpTip })}
        />
        {s.sharpTip ? (
          <Grid>
            {length("tipWidth")}
            {length("tipHeight")}
          </Grid>
        ) : null}
      </Group>

      <Group title="Handle">
        <Grid>
          {length("handleHeight")}
          {length("handleWidth")}
        </Grid>
        <div className="space-y-2">
          <p className="text-sm font-medium">Shape</p>
          <Select
            items={[...HANDLE_SHAPES]}
            value={s.handleShape}
            onValueChange={(value) => {
              if (value) set({ handleShape: value });
            }}
          >
            <SelectTrigger
              className="w-40 bg-card"
              data-testid="handle-shape"
              aria-label="Handle shape"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HANDLE_SHAPES.map((shape) => (
                <SelectItem key={shape.value} value={shape.value}>
                  {shape.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Group>

      {s.type === "imprint" ? (
        <Group title="Imprint">
          <Grid>
            {length("imprintDepth")}
            {length("imprintBaseWidth")}
          </Grid>
        </Group>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        data-testid="reset-settings"
        onClick={onReset}
      >
        <RotateCcw aria-hidden />
        Reset to defaults
      </Button>
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
