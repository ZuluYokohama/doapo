import { createFileRoute, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { DoapoApp } from "@/components/doapo-app";
import { getSnapshot, refreshSnapshot } from "@/lib/ndic.functions";

export const Route = createFileRoute("/")({
  loader: () => getSnapshot(),
  pendingComponent: Pending,
  errorComponent: LoadError,
  component: Home,
});

function Home() {
  const snapshot = Route.useLoaderData();
  const router = useRouter();
  return (
    <DoapoApp
      initial={snapshot}
      onReload={async () => {
        await refreshSnapshot();
        await router.invalidate();
      }}
    />
  );
}

function Pending() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <p className="text-xs tracking-widest text-accent uppercase">NDIC Oil & Gas Division</p>
      <h1 className="mt-1 text-3xl font-medium tracking-wide">DOAPO</h1>
      <p className="mt-3 text-sm text-muted">Pulling the North Dakota well index…</p>
    </main>
  );
}

function LoadError({ error }: ErrorComponentProps) {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <p className="text-xs tracking-widest text-accent uppercase">NDIC Oil & Gas Division</p>
      <h1 className="mt-1 text-3xl font-medium tracking-wide">DOAPO</h1>
      <p className="mt-3 max-w-lg text-sm text-fg">
        The public well service did not answer.{" "}
        {error instanceof Error ? error.message : "Try refresh."}
      </p>
    </main>
  );
}
