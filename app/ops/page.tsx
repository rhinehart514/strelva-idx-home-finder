import type { Metadata } from "next";
import { OperationsWorkspace } from "@/src/components/operations-workspace";

export const metadata: Metadata = {
  title: "IDX page check · Strelva Labs",
  description: "A timestamped public-page evidence check for real-estate web teams.",
};

export default function OperationsPage() {
  return <OperationsWorkspace />;
}
