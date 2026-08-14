import { createListingInquiryToken } from "./inquiries/listing-token";
import { readInquiryRuntimeConfig } from "./inquiries/runtime";
import { getHomeFinderInstallations } from "./installations";
import { getMlsProviderForInstallation } from "./mls";

export function validateHomeFinderStartup(
  env: Record<string, string | undefined> = process.env,
) {
  const liveInstallations = getHomeFinderInstallations(env).filter(
    ({ mode }) => mode === "live",
  );
  if (liveInstallations.length === 0) return;

  for (const installation of liveInstallations) {
    getMlsProviderForInstallation(installation, env);
    createListingInquiryToken(
      {
        installationId: installation.id,
        listingId: "startup-validation",
        address: "startup-validation",
      },
      env,
    );
  }
  readInquiryRuntimeConfig(env);
  if (!env.INQUIRY_WORKER_SECRET?.trim()) {
    throw new Error("Live inquiry delivery requires INQUIRY_WORKER_SECRET.");
  }
}
