import { useEffect, useId, useState, type ReactNode } from "react";
import { Field, FieldError, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { Switch } from "@/client/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
import {
  displayLength,
  MM_PER_INCH,
  type CutterSettings,
} from "@/shared/settings";

/** A length field: shows mm or inches, reports millimetres. */
export function LengthField({
  label,
  value,
  units,
  error,
  onChange,
}: {
  label: string;
  value: number;
  units: CutterSettings["units"];
  error?: string;
  onChange: (mm: number) => void;
}) {
  const id = useId();
  const shown = displayLength(value, units);
  const [text, setText] = useState(shown);
  useEffect(() => {
    const typed = Number(text);
    const typedMm = units === "in" ? typed * MM_PER_INCH : typed;
    if (text.trim() === "" || !Number.isFinite(typed) || Math.abs(typedMm - value) > 1e-6)
      setText(shown);
    // Only an outside change (units, reset, a profile) rewrites the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, units]);
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            const n = Number(event.target.value);
            if (event.target.value.trim() !== "" && Number.isFinite(n))
              onChange(units === "in" ? n * MM_PER_INCH : n);
          }}
          className="w-28 bg-card"
        />
        <span className="text-sm text-muted-foreground">{units}</span>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex w-fit items-center gap-2">
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
      />
      <span
        aria-hidden
        className="cursor-pointer text-sm font-medium select-none"
        onClick={() => onChange(!checked)}
      >
        {label}
      </span>
    </div>
  );
}

/** One choice of a few, each a pressed-or-not toggle. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined;
        if (picked) onChange(picked);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          data-testid={`${testId}-${option.value}`}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
