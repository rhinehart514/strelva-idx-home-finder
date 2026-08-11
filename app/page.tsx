import type { Metadata } from "next";
import { ListingConcierge } from "@/src/components/listing-concierge";

export const metadata: Metadata = {
  title: "Agency listing preview · Strelva Labs",
  description:
    "An agency-owned home search prepared for an approved MLS data connection.",
};

export default function Home() {
  return (
    <ListingConcierge
      agency={{
        id: process.env.NEXT_PUBLIC_AGENCY_ID ?? "agency-preview",
        name: process.env.NEXT_PUBLIC_AGENCY_NAME ?? "Agency preview",
      }}
    />
  );
}
