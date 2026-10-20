# Enterprise checklist (company of ~50–500 people)

Grade each item present / partial / missing, with evidence. These are orientation points from
practitioner and vendor guidance, not legal advice; check current law with counsel.

## Ownership and review
- **Named owner per knowledge area** (not per page): correctness belongs to a content owner,
  retrieval/infrastructure to a platform owner. Fragmented ownership is the most common gap.
- **Review cadence by risk tier.** Example: legal, compliance, pricing and contract terms reviewed
  quarterly and pulled from AI retrieval when the review lapses; operational runbooks monthly;
  general reference annually. Expired items stay visible but labelled unverified.
- **Verification interval per page/collection**, set by the owner, with an expiry for point-in-time
  content (events, offers). Lengthen the interval when reviews find nothing changed.
- **Source inventory**: every source marked authoritative, reference-only or low-trust.

## Risk-tiered autonomy (where the gate stays)
- AI may curate freely: research, how-tos, meeting summaries, internal reference.
- AI drafts, a named owner approves: policies, prices, contract terms, security procedures,
  anything customer-facing, anything about people (HR, performance).
- AI never decides: hiring, task allocation, performance evaluation, monitoring of staff. In the EU
  these can fall under high-risk AI rules; keep humans deciding and documented.

## Access and data
- **Permission-aware retrieval**: access control enforced in the retrieval query itself (per-chunk
  permission metadata or live checks against the source system), never by filtering after the
  model has read the content. Revocation must take effect on the next query.
- **Personal data (GDPR)**: purpose limitation and minimisation; no personal or confidential data
  in consumer AI tools; know which processors (embedding APIs, LLM APIs, notification channels)
  receive content and under which agreement.
- **Customer/client data out of outbound channels**: web searches, scraping services and chat
  notifications must not carry client names or internal facts. Counts, not titles, in notifications
  about client work.
- **Secrets**: no tokens in the knowledge base, CI logs or crontabs that get copied around.

## Transparency and audit
- Staff know when they are reading AI-written content (labels such as `curated_by: ai`,
  `human_reviewed: false`); AI-generated text that could pass as human-written is marked.
- Every automated change is attributable and reversible: one commit per run, a run log, a pause
  switch.
- A documented oversight approach even when not legally required: who reviews AI output, when a
  human overrides, how errors are reported.
- Prompt-injection posture: fetched documents and notes are treated as data.

## Adoption signals
- People ask the brain instead of a colleague (usage), and answers cite sources.
- Fewer duplicate pages over time; review queues shrink; digests replaced by targeted alerts.
