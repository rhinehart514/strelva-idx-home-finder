import { DemoMlsProvider } from "./demo-provider";
import { MlsError } from "./errors";
import { TrestleMlsProvider } from "./trestle-provider";
import type { HomeFinderInstallation } from "../installations";
import type { MlsProvider } from "./types";

type MlsConfig =
  | { provider: "demo" }
  | {
      provider: "trestle";
      clientId: string;
      clientSecret: string;
      sourceName: string;
      freshnessWindowMinutes: number;
    };

function createMlsProvider(config: MlsConfig): MlsProvider {
  return config.provider === "demo"
    ? new DemoMlsProvider()
    : new TrestleMlsProvider({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        sourceName: config.sourceName,
        freshnessWindowMinutes: config.freshnessWindowMinutes,
      });
}

const liveProviders = new Map<
  string,
  {
    clientId: string;
    clientSecret: string;
    sourceName: string;
    freshnessWindowMinutes: number;
    provider: MlsProvider;
  }
>();

export function getMlsProviderForInstallation(
  installation: HomeFinderInstallation,
  env: Record<string, string | undefined> = process.env,
) {
  if (installation.mode === "demo") {
    return createMlsProvider({ provider: "demo" });
  }

  const sourceName = installation.mls.sourceName?.trim();
  const freshnessWindowMinutes = installation.mls.refreshIntervalMinutes;
  const clientId = env.TRESTLE_CLIENT_ID?.trim();
  const clientSecret = env.TRESTLE_CLIENT_SECRET?.trim();
  if (
    !sourceName ||
    !clientId ||
    !clientSecret ||
    freshnessWindowMinutes === null ||
    !Number.isFinite(freshnessWindowMinutes) ||
    freshnessWindowMinutes <= 0
  ) {
    throw new MlsError(
      "configuration",
      "This Home Finder Installation is missing approved live-listing configuration.",
      503,
      false,
    );
  }

  const cached = liveProviders.get(installation.id);
  if (
    cached &&
    cached.clientId === clientId &&
    cached.clientSecret === clientSecret &&
    cached.sourceName === sourceName &&
    cached.freshnessWindowMinutes === freshnessWindowMinutes
  ) {
    return cached.provider;
  }
  const provider = createMlsProvider({
    provider: "trestle",
    clientId,
    clientSecret,
    sourceName,
    freshnessWindowMinutes,
  });
  liveProviders.set(installation.id, {
    clientId,
    clientSecret,
    sourceName,
    freshnessWindowMinutes,
    provider,
  });
  return provider;
}
