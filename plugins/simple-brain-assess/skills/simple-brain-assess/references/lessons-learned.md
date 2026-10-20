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
