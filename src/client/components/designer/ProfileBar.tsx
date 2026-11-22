import { Trash2 } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

export const DEFAULT_PROFILE = "default";

export function ProfileBar({
  profiles,
  selected,
  modified,
  onSelect,
  onSave,
  onDelete,
}: {
  profiles: { id: string; name: string }[];
  selected: string;
  modified: boolean;
  onSelect: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const items = [
    { value: DEFAULT_PROFILE, label: "Default" },
    ...profiles.map((p) => ({ value: p.id, label: p.name })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={items}
        value={selected}
        onValueChange={(value) => {
          if (value) onSelect(value);
        }}
      >
        <SelectTrigger
          className="w-48 bg-card"
          data-testid="profile-select"
          aria-label="Settings profile"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {modified ? (
        <Badge variant="secondary" data-testid="profile-modified">
          Modified
        </Badge>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        data-testid="save-profile"
        onClick={onSave}
      >
        Save profile
      </Button>
      {selected !== DEFAULT_PROFILE ? (
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="delete-profile"
          aria-label="Delete profile"
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
