import { staticIds } from "@/lib/static-ids";

import PlayerView from "./PlayerView";

export function generateStaticParams() {
  return staticIds("players").map((id) => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerView id={id} />;
}
