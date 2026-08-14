import { redirect } from "next/navigation";
import { getHomeFinderInstallations } from "@/src/lib/installations";

export default function Home() {
  const [installation] = getHomeFinderInstallations();
  if (!installation) redirect("/ops");
  redirect(`/embed/${installation.id}`);
}
