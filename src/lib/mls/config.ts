import { DemoMlsProvider } from "./demo-provider";
import { MlsError } from "./errors";
import { TrestleMlsProvider } from "./trestle-provider";
import type { MlsProvider } from "./types";

export type MlsConfig =
  | { provider: "demo" }
  | {
      provider: "trestle";
      clientId: string;
      clientSecret: string;
      sourceName: string;
    };

export function readMlsConfig(
  env: Record<string, string | undefined> = process.env,
): MlsConfig {
  const provider = env.MLS_PROVIDER?.trim().toLocaleLowerCase("en-US") || "demo";
  if (provider === "demo") return { provider: "demo" };
  if (provider !== "trestle") {
    throw new MlsError(
      "configuration",
      "MLS_PROVIDER must be either demo or trestle.",
      503,
      false,
    );
  }

  const clientId = env.TRESTLE_CLIENT_ID?.trim();
  const clientSecret = env.TRESTLE_CLIENT_SECRET?.trim();
  const sourceName = env.IDX_SOURCE_NAME?.trim();
  if (!clientId || !clientSecret || !sourceName) {
    throw new MlsError(
      "configuration",
      "Trestle mode requires TRESTLE_CLIENT_ID, TRESTLE_CLIENT_SECRET, and the MLS-approved IDX_SOURCE_NAME.",
      503,
      false,
    );
  }

  return { provider: "trestle", clientId, clientSecret, sourceName };
}

let cachedProvider: MlsProvider | null = null;
let cachedConfigKey: string | null = null;

export function createMlsProvider(config: MlsConfig): MlsProvider {
  return config.provider === "demo"
    ? new DemoMlsProvider()
    : new TrestleMlsProvider({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        sourceName: config.sourceName,
      });
}

export function getMlsProvider(
  env: Record<string, string | undefined> = process.env,
) {
  const config = readMlsConfig(env);
  const configKey =
    config.provider === "demo"
      ? "demo"
      : `trestle:${config.clientId}:${config.clientSecret}:${config.sourceName}`;

  if (!cachedProvider || cachedConfigKey !== configKey) {
    cachedProvider = createMlsProvider(config);
    cachedConfigKey = configKey;
  }

  return cachedProvider;
}
