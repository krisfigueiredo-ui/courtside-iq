import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <div className="label text-volt-300">404</div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-mist">Page not found</h1>
      <p className="mt-2 text-sm text-mist-400">
        This page does not exist, or it is not included in the static preview (which covers games from the days around the snapshot date).
      </p>
      <Link href="/" className="mt-6 inline-block rounded-lg border border-line px-4 py-2 text-sm text-mist-300 hover:border-volt/50 hover:text-mist">
        Back to the Command Center
      </Link>
    </div>
  );
}
