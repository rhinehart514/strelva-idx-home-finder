import type {
  HomeFinderInstallation,
  PublicHomeFinderInstallation,
} from "./types";

const DEFAULT_INSTALLATION: HomeFinderInstallation = {
  id: "agency-preview",
  mode: "demo",
  allowedOrigins: ["http://127.0.0.1:3100", "http://localhost:3100"],
  brokerage: {
    name: "Agency preview",
    logoUrl: null,
    primaryColor: "#d65a31",
  },
  agencyPartner: {
    name: "Agency preview",
    receiptEmail: null,
  },
  inquiryDestination: null,
  defaultSearch: { location: "" },
  mls: {
    sourceName: null,
    refreshIntervalMinutes: null,
    featuredOfficeName: null,
  },
};

export class InstallationNotFoundError extends Error {
  constructor(readonly installationId: string) {
    super(`Home Finder Installation ${installationId} was not found.`);
    this.name = "InstallationNotFoundError";
  }
}

function readConfiguredInstallations(
  env: Record<string, string | undefined>,
): HomeFinderInstallation[] {
  const raw = env.HOME_FINDER_INSTALLATIONS_JSON?.trim();
  if (!raw) return [DEFAULT_INSTALLATION];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("HOME_FINDER_INSTALLATIONS_JSON must be a JSON array.");
  }
  const installations = parsed.map(parseInstallation);
  if (new Set(installations.map(({ id }) => id)).size !== installations.length) {
    throw new Error("HOME_FINDER_INSTALLATIONS_JSON IDs must be unique.");
  }
  return installations;
}

function configurationError(message: string): never {
  throw new Error(`HOME_FINDER_INSTALLATIONS_JSON ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return configurationError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string;
function string(value: unknown, path: string, nullable: true): string | null;
function string(value: unknown, path: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    return configurationError(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

function email(value: unknown, path: string): string;
function email(value: unknown, path: string, nullable: true): string | null;
function email(value: unknown, path: string, nullable = false): string | null {
  const parsed = nullable ? string(value, path, true) : string(value, path);
  if (parsed === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed)) {
    return configurationError(`${path} must be an email address.`);
  }
  return parsed;
}

function optionalHttpsUrl(value: unknown, path: string) {
  if (value === null) return null;
  const parsed = string(value, path);
  try {
    const url = new URL(parsed);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    return configurationError(`${path} must be an HTTPS URL or null.`);
  }
}

function allowedOrigin(value: unknown, path: string) {
  const parsed = string(value, path);
  try {
    const url = new URL(parsed);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if ((url.protocol !== "https:" && !localHttp) || url.origin !== parsed) {
      throw new Error();
    }
    return parsed;
  } catch {
    return configurationError(`${path} must be an HTTPS origin.`);
  }
}

function parseInstallation(value: unknown, index: number): HomeFinderInstallation {
  const path = `[${index}]`;
  const input = record(value, path);
  const mode = input.mode;
  if (mode !== "demo" && mode !== "live") {
    return configurationError(`${path}.mode must be demo or live.`);
  }
  if (!Array.isArray(input.allowedOrigins) || input.allowedOrigins.length === 0) {
    return configurationError(`${path}.allowedOrigins must not be empty.`);
  }
  const brokerage = record(input.brokerage, `${path}.brokerage`);
  const agencyPartner = record(input.agencyPartner, `${path}.agencyPartner`);
  const defaultSearch = record(input.defaultSearch, `${path}.defaultSearch`);
  const mls = record(input.mls, `${path}.mls`);
  const primaryColor = string(
    brokerage.primaryColor,
    `${path}.brokerage.primaryColor`,
  );
  if (!/^#[0-9a-f]{6}$/i.test(primaryColor)) {
    return configurationError(`${path}.brokerage.primaryColor must be a hex color.`);
  }
  const refreshInterval = mls.refreshIntervalMinutes;
  if (
    refreshInterval !== null &&
    (!Number.isInteger(refreshInterval) || (refreshInterval as number) <= 0)
  ) {
    return configurationError(
      `${path}.mls.refreshIntervalMinutes must be a positive integer or null.`,
    );
  }
  if (mode === "live" && typeof refreshInterval === "number" && refreshInterval > 720) {
    return configurationError(`${path}.mls.refreshIntervalMinutes cannot exceed NYSAMLSs' 12-hour maximum (720 minutes).`);
  }
  const installation: HomeFinderInstallation = {
    id: string(input.id, `${path}.id`),
    mode,
    allowedOrigins: input.allowedOrigins.map((origin, originIndex) =>
      allowedOrigin(origin, `${path}.allowedOrigins[${originIndex}]`),
    ),
    brokerage: {
      name: string(brokerage.name, `${path}.brokerage.name`),
      logoUrl: optionalHttpsUrl(
        brokerage.logoUrl,
        `${path}.brokerage.logoUrl`,
      ),
      primaryColor,
    },
    agencyPartner: {
      name: string(agencyPartner.name, `${path}.agencyPartner.name`),
      receiptEmail: email(
        agencyPartner.receiptEmail,
        `${path}.agencyPartner.receiptEmail`,
        true,
      ),
    },
    inquiryDestination: email(
      input.inquiryDestination,
      `${path}.inquiryDestination`,
      true,
    ),
    defaultSearch: {
      location:
        typeof defaultSearch.location === "string"
          ? defaultSearch.location.trim()
          : configurationError(`${path}.defaultSearch.location must be a string.`),
    },
    mls: {
      sourceName: string(mls.sourceName, `${path}.mls.sourceName`, true),
      refreshIntervalMinutes: refreshInterval as number | null,
      featuredOfficeName: string(
        mls.featuredOfficeName,
        `${path}.mls.featuredOfficeName`,
        true,
      ),
    },
  };
  if (
    mode === "live" &&
    (!installation.inquiryDestination ||
      !installation.agencyPartner.receiptEmail ||
      !installation.mls.sourceName ||
      !installation.mls.refreshIntervalMinutes)
  ) {
    return configurationError(
      `${path} live mode requires inquiry and agency emails plus MLS source and freshness rule.`,
    );
  }
  return installation;
}

export function getHomeFinderInstallation(
  installationId: string,
  env: Record<string, string | undefined> = process.env,
): HomeFinderInstallation {
  const installation = readConfiguredInstallations(env).find(
    ({ id }) => id === installationId,
  );
  if (!installation) throw new InstallationNotFoundError(installationId);
  return installation;
}

export function getHomeFinderInstallations(
  env: Record<string, string | undefined> = process.env,
) {
  return readConfiguredInstallations(env);
}

export function toPublicInstallation(
  installation: HomeFinderInstallation,
): PublicHomeFinderInstallation {
  return {
    id: installation.id,
    mode: installation.mode,
    brokerage: installation.brokerage,
    defaultSearch: installation.defaultSearch,
  };
}
