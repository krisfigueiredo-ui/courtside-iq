import { staticIds } from "@/lib/static-ids";

import GameView from "./GameView";

export function generateStaticParams() {
  return staticIds("games").map((id) => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GameView id={id} />;
}
