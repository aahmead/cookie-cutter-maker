import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Designs" },
  { to: "/designer", label: "Designer" },
  { to: "/trash", label: "Trash" },
] as const;

/** The app's pages, in the AppShell bar. */
export function AppNav() {
  return (
    <nav className="flex items-center gap-3 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: true, includeSearch: false }}
          className="text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "font-medium text-foreground" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
