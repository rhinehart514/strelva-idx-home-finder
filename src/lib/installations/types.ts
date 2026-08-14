export type InstallationMode = "demo" | "live";

export type HomeFinderInstallation = {
  id: string;
  mode: InstallationMode;
  allowedOrigins: string[];
  brokerage: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
  };
  agencyPartner: {
    name: string;
    receiptEmail: string | null;
  };
  inquiryDestination: string | null;
  defaultSearch: {
    location: string;
  };
  mls: {
    sourceName: string | null;
    refreshIntervalMinutes: number | null;
    featuredOfficeName: string | null;
  };
};

export type PublicHomeFinderInstallation = Pick<
  HomeFinderInstallation,
  "id" | "mode" | "brokerage" | "defaultSearch"
>;
