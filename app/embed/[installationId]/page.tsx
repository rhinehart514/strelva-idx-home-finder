import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingConcierge } from "@/src/components/listing-concierge";
import {
  getHomeFinderInstallation,
  InstallationNotFoundError,
  toPublicInstallation,
} from "@/src/lib/installations";

type EmbedPageProps = {
  params: Promise<{ installationId: string }>;
};

function readInstallation(installationId: string) {
  try {
    return getHomeFinderInstallation(installationId);
  } catch (error) {
    if (error instanceof InstallationNotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: EmbedPageProps): Promise<Metadata> {
  const { installationId } = await params;
  const installation = readInstallation(installationId);
  return {
    title: `${installation.brokerage.name} Home Finder`,
    description: `Search homes with ${installation.brokerage.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { installationId } = await params;
  const installation = readInstallation(installationId);
  return <ListingConcierge installation={toPublicInstallation(installation)} />;
}
