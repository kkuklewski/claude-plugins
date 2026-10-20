#!/usr/bin/env python3
"""Read-only health numbers for a Markdown knowledge base.

Usage: measure.py <root> [--raw DIR ...] [--wiki DIR ...] [--days-stale N]
Defaults guess common layouts: raw = raw, inbox, Inbox, scrapers/Inbox; wiki = wiki, Topics,
scrapers/Topics, docs. Prints flow, structure and trust numbers. Never writes anything.
"""
import argparse, collections, datetime, os, re, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument("root")
ap.add_argument("--raw", nargs="*", default=None)
ap.add_argument("--wiki", nargs="*", default=None)
ap.add_argument("--days-stale", type=int, default=90)
a = ap.parse_args()
root = os.path.abspath(a.root)
if not os.path.isdir(root):
    sys.exit(f"not a directory: {root}")

def guess(cands):
    return [c for c in cands if os.path.isdir(os.path.join(root, c))]

raw_dirs = a.raw if a.raw is not None else guess(["raw", "inbox", "Inbox", "scrapers/Inbox"])
wiki_dirs = a.wiki if a.wiki is not None else guess(["wiki", "Topics", "scrapers/Topics", "docs"])

md = []
for d, ds, fs in os.walk(root):
    ds[:] = [x for x in ds if not x.startswith(".") and x not in ("node_modules",)]
    md += [os.path.relpath(os.path.join(d, f), root) for f in fs if f.endswith(".md")]

def read(p):
    try:
        return open(os.path.join(root, p), encoding="utf-8", errors="replace").read()
    except OSError:
        return ""

def fm(text):
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    return ({k: v.strip().strip("'\"") for k, v in re.findall(r"^([A-Za-z_]+):\s*(.*)$", m.group(1), re.M)}, True) if m else ({}, text.startswith("---"))

def under(p, dirs):
    return any(p == d or p.startswith(d.rstrip("/") + "/") for d in dirs)

base = collections.defaultdict(list)
for p in md:
    base[os.path.splitext(os.path.basename(p))[0].lower()].append(os.path.splitext(p)[0].lower())
inbound = collections.Counter(); broken = collections.Counter()
for p in md:
    t = re.sub(r"```.*?```", "", read(p), flags=re.S)
    me = os.path.splitext(p)[0].lower()
    for link in re.findall(r"\[\[([^\]|#]+)", t):
        k = link.strip().lower().removesuffix(".md")
        targets = [k] if k in {os.path.splitext(x)[0].lower() for x in md} else base.get(k.split("/")[-1], [])
        if not targets:
            broken[k] += 1
        for tg in targets:
            if tg != me:
                inbound[tg] += 1

today = datetime.date.today()
def git_last(p):
    out = subprocess.run(["git", "-C", root, "log", "-1", "--format=%cs", "--", p], capture_output=True, text=True).stdout.strip()
    return datetime.date.fromisoformat(out) if out else None

raw = [p for p in md if under(p, raw_dirs)]
wiki = [p for p in md if under(p, wiki_dirs)]
raw_fm = {p: fm(read(p))[0] for p in raw}
promoted_keys = ("promoted_to", "curated", "processed", "archived")
pending = [p for p, f in raw_fm.items() if not any(f.get(k) for k in promoted_keys)]
approval_keys = ("human_verdict", "approved", "verdict", "reviewed_by", "approval")
waiting_human = [p for p, f in raw_fm.items() if not any(f.get(k) for k in approval_keys)]
ages = sorted((today - d).days for d in (git_last(p) for p in pending[:400]) if d)
orphans = [p for p in wiki if inbound[os.path.splitext(p)[0].lower()] == 0 and not re.search(r"(index|readme|home|moc)", p, re.I)]
malformed = [p for p in md if fm(read(p))[1] and not fm(read(p))[0]]
wiki_text = {p: read(p) for p in wiki}
ai_pages = [p for p, t in wiki_text.items() if re.search(r"^(curated_by:\s*ai|ai_generated:\s*true)", t, re.M)]
no_source = [p for p, t in wiki_text.items() if not re.search(r"(^sources?:|https?://|\[\[)", t, re.M)]
callouts = sum(len(re.findall(r"^> \[!(question|warning)\]", t, re.M)) for t in wiki_text.values())
stale = [p for p in wiki if (lambda d: d and (today - d).days > a.days_stale)(git_last(p))]

print(f"ROOT {root}")
print(f"LANES raw={raw_dirs or 'none found'} wiki={wiki_dirs or 'none found'}")
print("FLOW")
print(f"  raw items {len(raw)} | not yet curated {len(pending)} | without a human decision field {len(waiting_human)}")
print(f"  age of uncurated items (days, by last commit): oldest {ages[-1] if ages else '-'} median {ages[len(ages)//2] if ages else '-'}")
print("STRUCTURE")
print(f"  markdown files {len(md)} | wiki pages {len(wiki)} | orphan wiki pages {len(orphans)} | broken link targets {len(broken)} | malformed frontmatter {len(malformed)}")
print("TRUST")
print(f"  AI-written wiki pages {len(ai_pages)} | wiki pages without any source/link {len(no_source)} | open question/warning callouts {callouts} | untouched > {a.days_stale} d {len(stale)}")
if orphans:
    print("  orphans (first 10):", ", ".join(os.path.basename(x) for x in orphans[:10]))
if broken:
    print("  top broken:", ", ".join(f"{k}({v})" for k, v in broken.most_common(8)))
