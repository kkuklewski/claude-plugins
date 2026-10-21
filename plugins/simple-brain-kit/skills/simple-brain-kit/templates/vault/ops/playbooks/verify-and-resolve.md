# Playbook: verify and resolve

Decision: `decisions/0003-ai-verification.md`.
Write list: verification sections, callouts and the `verification:` field in `topics/**`,
`ops/runs/<date>-verify.md`, `ops/owner-queue.md`.

First read `ops/playbooks/_run-rules.md` and follow it.

## Steps

1. **Pick pages.** Topic pages with `verification: none` first, then `partial`, then pages with an
   open `> [!question]`, oldest `updated` first. Skip `veto:` and `status: withdrawn`. Up to the verification cap.
2. **Pick claims.** Per page, the 3–5 key claims a reader would act on. Not every sentence.
3. **Fetch the source verbatim.** Use a fetch that returns the page text, not a model summary. If
   the only tool available summarises, every verdict from it is `unverifiable: summary-only`.
4. **Match the quote.** A quote counts only if it string-matches the fetched text (ignoring
   whitespace and typographic quotes). No match → `unverifiable`.
5. **Write the verdicts** as an appended section, never by rewriting the claim:

   ```markdown
   ## Verification (2026-01-01)
   | Claim | Verdict | Evidence (verbatim) | Source |
   |---|---|---|---|
   | … | supported | "…" | <url> |
   ```

   - `refuted`: add a `> [!warning]` under the claim with the quote and source. If the claim stood
     as fact, move it into the warning, quoting its original wording. Never delete or strike it.
   - A perspective that is now supported loses its **[Perspective, unverified]** label and gets the
     source; one that is refuted moves out of the text into the warning (0002).
6. **Resolve open questions** you found evidence for: append `Answer (date): … "<quote>" — <source>`
   under the question. Leave the question text in place.
7. **Owner queue** only: refuted key claims, ties between credible sources, scope questions, and
   one random sample per week. Max per night from AGENTS.md. Everything else is resolved here or
   stays `unverifiable`.
8. Set `verification: done | partial` on each page. **Finish** as in `_run-rules.md`.

## Query hygiene

No client names, people's names, internal project names or private context in search, fetch or
Apify queries. Search for the claim in general terms ("median time to X in Y industry"), never
with the page's private context. If a claim cannot be checked without private context, it is
`unverifiable: private`.
