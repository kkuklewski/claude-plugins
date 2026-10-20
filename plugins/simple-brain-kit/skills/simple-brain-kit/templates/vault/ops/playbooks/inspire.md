# Playbook: inspire (discovery, captured links first)

Decision: `decisions/0005-discovery.md`.
Write list: new files in `raw/`, frontmatter of processed link captures in `inbox/captures/`,
`ops/runs/<date>-inspire.md`.

First read `ops/playbooks/_run-rules.md` and follow it.

## Steps

1. **Captured links first.** Every capture with `kind: "link"` and no `status: curated`, oldest
   first. Fetch the URL verbatim. Save a source note `raw/<date>-<slug>.md` with frontmatter
   `type: source`, `source_url`, `captured_from: "inbox/captures/<file>"`, `written_by: ai`, a short
   neutral summary and 1–3 verbatim quotes. Then set `status: curated` and `curated_in:` on the
   capture. A link that cannot be fetched: note it in the run log, leave the capture as is.
2. **Discovery, if the cap allows.** Read `topics/index.md` and the most recently updated topics.
   Pick at most the discovery cap of subjects. For each, search for one recent, credible source
   that adds something the page does not have. Save it as a source note in `raw/` (same format,
   `kind: discovery`). Prefer primary sources. Skip anything you cannot fetch verbatim.
3. **Inspire (optional, one per night).** If two or more topics clearly connect and no page links
   them, write `raw/<date>-connections.md` (`kind: idea`, `written_by: ai`): which pages, why they
   connect, one question worth exploring. It is a raw item like any other: curation decides.
4. **Finish** as in `_run-rules.md`.

Discovery never writes to `topics/` directly. Everything it finds goes through curation.

## Query hygiene

This is the playbook that talks to the outside world, so the rule is strict: no client names,
people's names, internal project names, deal details or any private context in web, Apify,
scraping or search queries. Generalise the subject ("onboarding checklists for field technicians",
not "<client> onboarding"). Never paste vault text into a query. Captured URLs are fetched as
they are; do not add context to them.
