# Lessons learned from running a self-curating brain

Observed in practice while moving a personal vault from a manual gate to AI curation with a veto.
Use them as checks; each one is a failure that already happened somewhere.

1. **A gate with a growing queue is a stopped pipeline.** Measure approvals per month, not intent.
2. **Write the bounds before the automation.** A decision record with write rules, a pause switch
   and one commit per run made the switch safe to approve.
3. **Catch up in batches with health checks between them.** Stop automatically if orphans or
   near-duplicates rise. Check the checker: a buggy metric reported false orphans once.
4. **A run limit can be eaten by preparation.** If scoring or fact-checking counts toward the
   nightly limit, curation can stall at zero. Pre-score earlier, or cap the preparation share.
5. **A guard that warns but still commits is not a guard.** Whitespace and scope checks must abort.
6. **Expected failures are not errors.** Log unreachable private services as "skipped", or the
   morning summary cries wolf.
7. **One context beats one sub-agent per item.** A fair A/B test showed a sub-agent per page cost
   about twice as much for the same quality; every new context pays a fixed start-up cost.
8. **Fetch summaries are not quotes.** Some fetch tools return a model summary of the page. Quotes
   must be string-matched against a verbatim fetch, or the verdict is "unverifiable".
9. **Don't strike a speaker's claim.** The page reports what the source said; append what the
   evidence says instead.
10. **The owner queue must stay short.** Routing every low-confidence page to a human recreated the
    gate (23 of 29 pages). Send only refuted key claims, ties, scope questions and a random sample.
11. **Unverified is not worthless.** Keep it as a labelled perspective: findable, never stated as fact.
    Refuted is different and stays out.
12. **Digests nobody reads are noise.** Three emails a day went unread; a short morning summary plus
    rare, capped alerts replaced them. Turning a digest off can silently turn off discovery too.
13. **Keep the source of truth.** A vector index on top of Markdown is good; deleting the Markdown
    for a vector store loses history, review, rollback and re-chunking. Inject retrieved context
    automatically only in the right contexts, never on every prompt everywhere.
14. **Keep client names out of outbound queries and notifications.** Web searches and chat messages
    leave the building; send counts, not titles, for client work.
15. **A cloud run sees only the repository.** Agents, skills and connectors that live outside the
    cloned repo are silently missing in scheduled cloud runs.
16. **A green run is not proof of work.** A routine marked successful only ended without an
    infrastructure error. One night ran cleanly, pushed a commit, and curated nothing because
    preparation used the whole limit. Check output per night, not status.
17. **Reading and writing are separate connectors.** Voice capture got its own endpoint with one
    append-only tool, its own secret and key. The read connector never gains a write tool, so a
    leaked read URL can't change anything.
18. **A decision file can be the live switch.** The capture server reads `status:` from its decision
    record on every call and refuses unless it says `active`. Turning a feature off is one committed
    line, with no redeploy.
19. **Bound the writable surface in the filesystem, not only in code.** The server's user can write one
    capture folder and nothing else; files are create-only, size-capped and capped per day.
20. **Connector header names are allow-listed.** claude.ai sends fixed API keys only under approved
    header names (presets such as `x-api-key`); a custom name is rejected, and `authorization` is
    unavailable while OAuth is selected. Accept a preset name on the server.
21. **Re-running secret setup breaks what's connected.** A second setup run rotated the path and key,
    and the connector added minutes earlier failed. Headers can't be edited, so the connector has to
    be re-added. Make setup idempotent or warn before rotating.
22. **Measure retrieval changes on your own questions.** Hybrid search (keyword plus vector, rank fusion)
    moved top-5 hits from 8 to 9 of 10, but the first version applied folder weights twice and buried
    the labelled perspectives. Apply each weight once and keep a small eval set.
