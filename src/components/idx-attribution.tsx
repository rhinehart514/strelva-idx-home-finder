type AttributionProps = {
  live: boolean;
  brokerage: string | null;
  coBrokerage?: string | null;
  contact: string | null;
  mlsNumber: string | null;
};

/** The same attribution accompanies every card, detail and map listing. */
export function ListingAttribution({ live, brokerage, coBrokerage, contact, mlsNumber }: AttributionProps) {
  const firms = [brokerage, coBrokerage && coBrokerage !== brokerage ? coBrokerage : null].filter(Boolean).join(" and ");
  return (
    <div className="idx-attribution" aria-label="Listing attribution">
      {live ? (
        // The unmodified NYSAMLSs mark is served locally; no provider request.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/idx/nysamls-idx.png" alt="NYSAMLSs IDX" width={88} height={53} />
      ) : null}
      <p>{live ? "Listing Courtesy of" : "Fictional listing firm:"} {firms}</p>
      <p>{live ? "MLS" : "Sample ID"} {mlsNumber}</p>
      {contact ? <p>Listing firm contact: {contact}{!live ? " (synthetic)" : ""}</p> : null}
    </div>
  );
}

export function IdxDisclosure({ live, sourceName, sourceCheckedAt, disclaimer }: {
  live: boolean;
  sourceName?: string | null;
  sourceCheckedAt?: string | null;
  disclaimer?: string | null;
}) {
  if (!live) return <div className="idx-disclosure"><p>Showcase only. All homes and listing contacts are synthetic; no MLS affiliation or availability is claimed. Preview inquiries send and save nothing.</p></div>;
  const year = sourceCheckedAt && Number.isFinite(Date.parse(sourceCheckedAt)) ? new Date(sourceCheckedAt).getUTCFullYear() : null;
  return (
    <div className="idx-disclosure" aria-label="IDX disclosures">
      <p>Data includes listings from the NYSAMLSs Internet Data Exchange (IDX) program. Connected source: {sourceName}. The IDX logo identifies participating brokers’ listings. Each listing names its listing firm, which may differ from the brokerage hosting this search.</p>
      <p>For consumers’ personal, non-commercial use only, to identify properties they may want to purchase. This search does not display every listing available through IDX.</p>
      <p>Listing data last updated from MLS: <time dateTime={sourceCheckedAt ?? undefined}>{sourceCheckedAt ?? "Unavailable — live inventory is withheld"}</time>.</p>
      <p>Information is considered reliable, but accuracy is not guaranteed. Verify it independently. Properties may sell, change, or be withdrawn.</p>
      {disclaimer ? <p>{disclaimer}</p> : null}
      <p>© {year} CNYIS, UNYREIS, WNYREIS. All rights reserved.</p>
    </div>
  );
}
