import { Redirect } from "@/components/nav/Redirect";

export default function Page() {
  return <Redirect to="/markets?tab=totals" label="Market Intelligence, totals" />;
}
