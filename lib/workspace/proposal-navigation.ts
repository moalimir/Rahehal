import { isNetworkWebRuntime } from "@/lib/runtime/mode";

/**
 * Connected builds address a proposal record through one pre-generated path
 * plus an `id` query parameter, exactly as `CONNECTED_RECORD_PATH` does for
 * challenges.
 *
 * The demo build's proposal ids are a fixed fixture set and so can be static
 * paths; a server-generated `prp_…` never can, because `dynamicParams` takes a
 * literal and the static export has to pre-generate every route. Keeping the
 * id in the query lets both builds share one route table while the URL stays a
 * real, shareable deep link.
 */
export const CONNECTED_PROPOSAL_RECORD_PATH = "/app/solver/proposals/record";

/** The organization's grant-scoped sibling of the solver record path. */
export const CONNECTED_ORG_PROPOSAL_RECORD_PATH = "/app/org/proposals/record";

const serverProposalId = "prp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}";
const solverRecordPattern = new RegExp(
  `^/app/solver/proposals/(${serverProposalId})(?:/(edit|preview|versions|status))?$`,
);
const organizationRecordPattern = new RegExp(`^/app/org/proposals/(${serverProposalId})$`);

/** Both builds pre-generate these; they are inert in the demo export. */
export const connectedProposalRecordPaths = [
  CONNECTED_PROPOSAL_RECORD_PATH,
  `${CONNECTED_PROPOSAL_RECORD_PATH}/edit`,
  `${CONNECTED_PROPOSAL_RECORD_PATH}/preview`,
  `${CONNECTED_PROPOSAL_RECORD_PATH}/versions`,
  CONNECTED_ORG_PROPOSAL_RECORD_PATH,
];

function rewrite(base: string, view: string | undefined, id: string, rawQuery: string): string {
  const query = new URLSearchParams(rawQuery);
  query.delete("id");
  const trailing = query.toString();
  return `${base}${view ? `/${view}` : ""}/?id=${encodeURIComponent(id)}${
    trailing ? `&${trailing}` : ""
  }`;
}

/**
 * Rewrites a canonical proposal path to its connected record path.
 *
 * Anything that is not a server id — a fixture id, a list path, `new` — passes
 * through untouched, so demo links keep working and only real records take the
 * query form.
 */
export function connectedProposalHref(href: string): string {
  const [rawPath, rawQuery = ""] = href.split("?");
  const path = rawPath.length > 1 ? rawPath.replace(/\/$/, "") : rawPath;

  const solver = path.match(solverRecordPattern);
  if (solver) {
    const [, id, view] = solver;
    // `status` and the bare record both resolve to the same read; only the
    // three views that exist as pre-generated paths are kept in the path.
    return rewrite(
      CONNECTED_PROPOSAL_RECORD_PATH,
      view === "status" ? undefined : view,
      id!,
      rawQuery,
    );
  }

  const organization = path.match(organizationRecordPattern);
  if (organization)
    return rewrite(CONNECTED_ORG_PROPOSAL_RECORD_PATH, undefined, organization[1]!, rawQuery);

  return href;
}

/** The href a rendered `<Link>` must carry for a canonical proposal path. */
export function proposalHref(path: string): string {
  return isNetworkWebRuntime ? connectedProposalHref(path) : path;
}

/**
 * The record id the connected record pages resolve on mount.
 *
 * Returns `null` when the query carries none, which the page must render as an
 * explicit unavailable state rather than falling back to a known fixture.
 */
export function readProposalRecordId(search: string): string | null {
  const id = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("id");
  return id && new RegExp(`^${serverProposalId}$`).test(id) ? id : null;
}
