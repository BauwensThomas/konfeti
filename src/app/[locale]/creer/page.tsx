import { CreateEventWizard } from "@/components/CreateEventWizard";

export default function CreateEventPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-12 sm:py-16">
      <CreateEventWizard />
    </main>
  );
}
