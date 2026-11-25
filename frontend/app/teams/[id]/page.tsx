import { staticIds } from "@/lib/static-ids";

import TeamView from "./TeamView";

export function generateStaticParams() {
  return staticIds("teams").map((id) => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamView id={id} />;
}
