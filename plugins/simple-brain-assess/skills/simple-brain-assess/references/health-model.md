# Health model: four properties, each measurable

A brain is healthy when raw material does not pile up, the wiki stays connected, every claim can be
traced, and a human still reads it. Measure, then compare with these targets. Adjust targets to
the size of the knowledge base, not to taste.

## 1. Flowing — raw does not pile up
| Metric | Target |
|---|---|
| Eligible raw items not yet curated | ≤ one night's batch |
| Age of the oldest eligible raw item | ≤ 7 days |
| Items waiting for a human decision | trending down; none older than 14 days |
| Scheduled runs that completed last week | ≥ 6 of 7 |
| Nights that produced real output (not only preparation) | ≥ 5 of 7 |

## 2. Connected — a graph, not a pile
| Metric | Target |
|---|---|
| Wiki pages with no inbound link (indexes excluded) | 0 |
| Broken internal links | 0 real ones |
| Near-duplicate page pairs | each one reviewed (merged or cross-linked) |
| Malformed frontmatter | 0 |
| Index drift: files whose search-index rows differ from the file, older than the last index run | 0 |

## 3. Trustworthy — every claim is traceable
| Metric | Target |
|---|---|
| AI-written pages without a source link | 0 |
| Open uncertainty or conflict markers | none older than 14 days |
| Claims verified with a verbatim quote | rising share |
| Pages superseded by a newer source but not updated | 0 |

Page age alone is not staleness: a dated research note can stay correct for years. A page is stale
when a newer source on its subject exists and the page does not reflect it.

## 4. Owned — a human still reads it
| Metric | Target |
|---|---|
| Review held (run logs or owner queue read) | weekly |
| Core context pages (priorities, ownership map) updated | within 30 days |
| Notifications that are actually opened | most of them; if not, cut them |

## Measure nightly, not once
Run the measurement every night as a read-only script with no model, append one line per day to a
history file, and send one counts-only line with the weekly change to wherever the owner already
looks in the morning. Keep item lists (paths, link targets) on the server, because they can name
clients or people. A night without a measurement is itself a finding.

## Conflicts between sources
Classify before resolving: complementary (merge), freshness (newer wins, older marked
superseded), misinformation (verify; the refuted side is marked), opinion (keep both, label as
perspectives). "Newest wins" alone is wrong: newer can simply be incorrect.
