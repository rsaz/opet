# Decisions

## What I built

**Verification.** Every claim this app makes about a document can now be checked in one click — and
any claim it cannot evidence is not shown at all.

Concretely, four things:

1. **Answers cite as they write.** The model emits a citation inline, next to the claim it supports:
   page, exact quote, and the label a lawyer would use (`§8.3.1(c) · p7`). A streaming parser strips
   the markers out of the token stream, so you never see the machinery.
2. **Every citation is checked before it is shown.** The quoted text is looked for on the page it
   claims to come from. If it isn't there, the citation is dropped and the count of dropped
   references is reported under the answer.
3. **Clicking a citation takes you to it.** The document pane scrolls to the page and highlights the
   passage. Hovering shows the passage without leaving the answer.
4. **The document is read on arrival.** Before any question is asked, the terms a reviewer looks for
   are on screen — each with the same verified citation — with the ones that would cost the client
   money flagged for escalation.

## Why — the problem I was actually solving

The baseline answered questions well. What it did badly was the thing that comes *after* the answer.

It rendered a **"3 sources cited"** badge produced by `count_sources_cited()` — a regex counting
occurrences of the string `clause \d+` in its own reply. Next to it sat a document pane that rendered
one page at a time and could not be pointed at a clause from anywhere. So the app **performed
verification without providing it**, in the one domain where that is dangerous. A lawyer cannot put
their name to a claim they have not seen in the document, and checking one meant reading the answer,
guessing which page clause 3.2 was on, and clicking through the pager until they found it.

That is not a missing feature. It is a **correctness bug in the product's central promise** — and it
is Orbital's own promise. The platform pages describe *"source-backed answers on what any provision
says today"* and *"source-linked answers across your lease portfolio."* Source-linking isn't a feature
of that product, it's the premise the rest stands on: lease abstraction, red-flag analysis and
critical-date extraction are all claims about a document that a lawyer must be able to check in one
click.

The second half follows from watching the app rather than reading it. Chat is **reactive** — it can
only answer what a lawyer already knows to ask. Someone opening an unfamiliar 200-page lease does not
know yet, and *working that out is the due diligence*. So the document is read once on arrival. On the
sample lease that surfaces the four things that cost money: the upward-only rent review, the break
premium buried in clause 8.3.1(c), the alienation restrictions, and the environmental indemnity. On
the title report it surfaces something else entirely — restrictive covenants, the registered charge,
the s106 obligations — because the fields are chosen for the document rather than filled into a form
designed for leases.

## Why this over the alternatives

**Multi-document deal rooms** match the brief's user most literally: dozens of documents per deal,
against one document per conversation enforced with a 409. I passed for two reasons. The supplied
corpus makes it undemonstrable — three *unrelated* properties in three cities, no amendments, no
cross-references, nothing to reconcile. And it is mostly schema and plumbing, which in this budget
lands as unpolished infrastructure rather than something a lawyer would feel.

**Retrieval and chunking** is a real ceiling: the whole document goes into every prompt today. It is
also completely invisible in a demo.

**Lease abstraction tables** were the most tempting alternative, and are the natural next build — but
they are worth far less before the values in them are checkable. Building them first would have
reproduced the same trust problem at greater scale. Instead they arrived *after* citations, as a
consumer of the same verified machinery.

There is an honest objection to the choice, so I'll state it plainly: **clickable citations are table
stakes.** Harvey ships verbatim *Exact Quote* citations; Prophia hyperlinks every abstracted term to
its source clause; CoCounsel grounds citations in Westlaw. I'd rather say that than dress the work up
as an invention. The brief asks for a high-value improvement, not something nobody has — and the app
did not merely *lack* citations, it *claimed* them. Shipping novelty on top of a broken premise would
have been the worse call.

## Where I tried to be better than the category

Not in having citations. In **what the product does when it isn't sure.** Most implementations treat a
citation as binary: here is a link, good luck. Three positions instead.

**Quotes are verified server-side, so a hallucination becomes an absence rather than a lie.** If the
model quotes something that is not in the document, the citation never reaches the answer — and the
count of dropped references is stated underneath, because an answer that over-reached should not look
identical to one that didn't. Ask this app what Schedule 3 says about the service charge and it tells
you Schedule 3 is referenced but not part of the document, and cites the reference itself. The lease
mentions four schedules and contains none of them.

**Matching degrades honestly rather than failing.** Exact-only matching does not survive real PDFs —
extraction breaks lines mid-clause and disagrees with the model about ligatures, curly quotes and
dashes. On the sample lease *most* true citations match only after normalisation. So matching runs in
three tiers — exact, normalised, then the longest agreeing run — and an approximate match is labelled
approximate rather than presented as a clean hit. A model that transcribed a quote imperfectly does
not cost the lawyer a real source. And a model that quotes accurately but misnumbers the page has
still told the truth about the document, so the page is corrected rather than the citation discarded.

**A citation never dead-ends.** If the passage cannot be located in the rendered page, the click still
takes you to the page and marks it. A link that does nothing teaches a lawyer to stop clicking, and
once they stop, the whole feature is decoration again.

The 19 tests are on this logic specifically, because it is the code that decides whether a claim gets
a source or gets nothing. I mutation-checked them: relaxing the thresholds fails six, including one
where an invented quote matched the three-character fragment `'er '` and would have been shown to a
lawyer as a source.

## What I changed in the existing app, and what I left

The FAQ invited this, so I took it — but I want to be precise about it, because "did you break
anything?" is a fair question. **Nothing a user relied on was removed.** Four things were *replaced*:

- The **`‹ Page 1 of 9 ›` stepper** became continuous scroll, because a citation has to be able to
  drive the pane.
- The **"3 sources cited" footnote** became inline chips, because a count at the end doesn't tell you
  which sentence each source supports.
- **`count_sources_cited()`** is deleted.
- **A failed request no longer persists.** The baseline caught the exception, replaced it with an
  apology, and *saved that as the assistant's answer* — so a failure and a real answer are
  indistinguishable to anyone reading the transcript later. In a legal matter that is worse than the
  failure. Now nothing is written, the user's turn is removed too, and the UI offers *Ask again*.

Also fixed: the sidebar names conversations after their document rather than the first question asked
(these users work in documents, dozens per deal — a list of questions is a list nobody can navigate);
uploading with nothing selected creates the conversation for you; the upload spinner that was already
written and never connected is connected; the delete control is no longer a `<button>` nested inside
another `<button>`; and `just check` is green, which it wasn't before — `backend/tests` was never
mounted into the container and `pyright` couldn't run at all for want of `libatomic1`.

**Left deliberately**, and named so it reads as a choice rather than an oversight: one document per
conversation is still enforced, with no way to replace a wrongly-uploaded file except by deleting the
conversation; the whole document still goes into every prompt; there is no cross-document analysis and
no way to re-run a summary; and there is no auth or multi-tenancy.

## What I'd do next

1. **Red-flag review and critical dates across a document set** — renewal windows, break notice
   deadlines, consent requirements. This is the step that turns a reader into a reviewer, and it is
   cheap now that every extracted value already carries a citation.
2. **Multi-document deal rooms, with the as-amended view** that makes lease abstraction real: a lease,
   its amendments and side letters reconciled into what the provision says *today*. Needs a corpus
   that actually relates.
3. **Retrieval for long documents.** Today the whole document goes into every prompt and the history
   is flattened into a single turn. Fine for nine pages, not for two hundred.
4. **Citations positioned at extraction time.** Storing bounding boxes alongside the page text would
   remove the second, browser-side search entirely and make the highlight exact rather than measured.

And the honest one: **fixing "one document per conversation" properly *is* item 2**, which is why it
is still there rather than half-solved.
