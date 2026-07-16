import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Card } from "@/components/ui/Card";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <Card className="flex w-full max-w-sm flex-col items-center gap-4">
        <h1 className="font-display text-xl font-bold text-foreground">Konfeti Admin</h1>
        <AdminLoginForm />
      </Card>
    </main>
  );
}
