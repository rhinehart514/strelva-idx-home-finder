import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListingAttribution, IdxDisclosure } from "./idx-attribution";

const props = { live: true, brokerage: "Synthetic Listing Firm", coBrokerage: "Synthetic Co-listing Firm", contact: "listing@example.invalid, 716-555-0100", mlsNumber: "B-SYNTHETIC" };

describe("NYSAMLSs listing displays", () => {
  it("renders the permitted firm prefix, co-listing firm, supplied contact, MLS number and actual IDX mark", () => {
    const html = renderToStaticMarkup(<ListingAttribution {...props} />);
    for (const required of ["Listing Courtesy of", "Synthetic Listing Firm", "Synthetic Co-listing Firm", "listing@example.invalid, 716-555-0100", "MLS", "B-SYNTHETIC", "/idx/nysamls-idx.png", 'alt="NYSAMLSs IDX"']) expect(html).toContain(required);
    expect(html).not.toContain("mailto:");
  });
  it("renders provider-check time, IDX source, consumer restriction, omitted inventory, reliability and copyright", () => {
    const html = renderToStaticMarkup(<IdxDisclosure live sourceName="NYSAMLSs via WNYREIS" sourceCheckedAt="2026-10-07T15:00:00.000Z" />);
    for (const required of ["NYSAMLSs Internet Data Exchange", "IDX logo", "personal, non-commercial", "does not display every listing", 'dateTime="2026-10-07T15:00:00.000Z"', "accuracy is not guaranteed", "CNYIS, UNYREIS, WNYREIS"]) expect(html).toContain(required);
  });
  it("keeps demo attribution visibly synthetic without an IDX affiliation claim", () => {
    const html = renderToStaticMarkup(<><ListingAttribution {...props} live={false} /><IdxDisclosure live={false} /></>);
    expect(html).toContain("(synthetic)");
    expect(html).toContain("no MLS affiliation");
    expect(html).not.toContain("/idx/nysamls-idx.png");
    expect(html).not.toContain("©");
  });
  it("escapes provider-supplied contact as text", () => {
    const html = renderToStaticMarkup(<ListingAttribution {...props} contact={'<script>alert("fixture")</script>'} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
