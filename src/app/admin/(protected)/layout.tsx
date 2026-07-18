import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-auth";
import { adminLogout } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

const NAV_ITEMS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/blocked", label: "Bloqués" },
  { href: "/admin/flags", label: "Feature flags" },
  { href: "/admin/finances", label: "Finances" },
  { href: "/admin/health", label: "Santé" },
];

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <nav className="flex flex-wrap gap-4">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-semibold text-foreground hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={adminLogout}>
          <Button type="submit" variant="ghost" size="sm">
            Déconnexion
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
