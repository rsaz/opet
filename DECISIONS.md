# Decisions

## What I built, and why

I built **verification**: every claim the app makes about a document can be checked in
one click, and any claim it cannot evidence is not shown at all.

The baseline answered questions well. What it did badly was the thing that comes after
the answer. It rendered a **"3 sources cited"** badge produced by counting regex matches
of the string `clause \d+` in its own reply — next to a document pane that rendered one
page at a time and could not be pointed at a clause. So the app performed verification
without providing it, in the one domain where that is dangerous. A lawyer cannot put
their name to a claim they have not seen in the document, and today checking one meant
reading the answer, guessing which page clause 3.2 was on, and clicking through the
pager until they found it.

That is not a missing feature; it is a correctness bug in the product's central promise
— and it is Orbital's own promise. The platform pages describe *"source-backed answers
on what any provision says today"* and *"source-linked answers across your lease
portfolio."* Source-linking is not a feature of that product, it is the premise the rest
sits on: lease abstraction, red-flag analysis and critical-date extraction are all
claims about a document that a lawyer must be able to check in one click.

So the model now cites inline as it writes, every quote is checked against the page it
claims before it reaches the answer, chips show the passage on hover and jump the reader
to the highlighted clause on click. And because chat can only answer what a lawyer
already knows to ask — which someone opening an unfamiliar lease does not — the document
is also read once on arrival, so the terms a reviewer looks for are on screen before a
question is typed, each carrying the same verified citation.

## Why this over the alternatives

**Multi-document deal rooms** match the brief's user most literally: dozens of documents
per deal, one document per conversation enforced with a 409. I passed because the
supplied corpus makes it undemonstrable — three *unrelated* properties in three cities,
no amendments, no cross-references — and because it is mostly schema and plumbing, which
in this budget lands as unpolished infrastructure. **Retrieval and chunking** is a real
ceiling (the whole document goes into every prompt) and completely invisible in a demo.
**Lease abstraction tables** were tempting, and are the natural next build, but they are
worth far less before the values in them are checkable — building them first would have
reproduced the same trust problem at greater scale.

There is an honest objection to the choice: **clickable citations are table stakes.**
Harvey ships verbatim *Exact Quote* citations; Prophia hyperlinks every abstracted term
to its source clause; CoCounsel grounds citations in Westlaw. I would rather say that
plainly than dress the work up as an invention. The brief asks for a high-value
improvement, not something nobody has — and the app did not merely *lack* citations, it
*claimed* them. Shipping novelty on top of a broken premise would have been the worse
call.

Where I did try to be better than the category is in **what the product does when it
isn't sure**. Most implementations treat a citation as binary: here is a link, good
luck. Three positions here instead. Quotes are verified server-side, so a hallucinated
citation becomes a *silently absent* chip rather than a false one — and the count of
dropped references is stated under the answer, because an answer that over-reached
should not look identical to one that didn't. Matching runs in three tiers, so a model
that transcribed a quote imperfectly does not lose a real source, and an approximate
match is labelled approximate rather than presented as a clean hit. And a chip never
dead-ends: if the passage cannot be located in the rendered page, the click still takes
you to the page. A link that does nothing teaches a lawyer to stop clicking, and then
the feature is decoration again.

I also fixed things the brief invited me to. The largest: a failed LLM call used to be
caught, replaced with an apology, and **saved to the database as the assistant's
answer** — so a failure and a real answer are indistinguishable to anyone reading that
transcript later. Nothing is persisted now.

## What I'd do next

1. **Red-flag review and critical dates across a document set** — renewal windows, break
   notice deadlines, consent requirements — now that every extracted value carries a
   citation. This is the step that turns a reader into a reviewer.
2. **Multi-document deal rooms**, with the as-amended view that makes lease abstraction
   real: a lease, its amendments and side letters reconciled into what the provision
   says *today*. Needs a corpus that actually relates.
3. **Retrieval for long documents.** Today the whole document goes into every prompt and
   the history is flattened into a single turn. Fine for nine pages, not for two hundred.
4. **Citations positioned at extraction time.** Bounding boxes stored alongside the page
   text would remove the second, browser-side search entirely and make highlighting exact
   rather than measured.

And two known gaps I chose not to paper over: one document per conversation is still
enforced, with no way to replace a wrongly-uploaded file except by deleting the
conversation — fixing that properly *is* the deal room — and the summary is generated
per document with no way to re-run it if a reviewer disagrees with what it pulled out.
