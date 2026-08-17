## ExpressoTS — an opinionated TypeScript framework for Node.js

**Repo:** github.com/expressots/expressots · **Docs:** doc.expresso-ts.com · **npm:**
`@expressots/core` · **Talk:** *ExpressoTS: Unveiling the Architecture*, VanJS, April 2024

### The problem and its context

I have built backends in Laravel, CodeIgniter, Symfony, Spring Boot, .NET and Django. Each of those
ecosystems has a strong opinion about how an application should be laid out, and none of them ever
gave me the thing I actually wanted: a structure a new engineer could read on their first day and
immediately see *where their change belongs and what it will touch*. Node.js, where I spent a considerable amount of my time, didn't even attempt it, Express deliberately has no opinion above the request handler,
which is a virtue in a script and a liability in a product.

The cost landed on me personally, over and over, in a form I eventually recognised as the real
problem: **I was duplicating myself.** Every time I changed product or changed the problem I was
solving, I rebuilt the same capabilities, the same dependency wiring, the same use-case layout, the
same provider abstractions, the same error handling, slightly differently each time. Multiply that
across a team and it stops being a personal annoyance and becomes the thing that makes onboarding
slow and architectural drift invisible.

In March 2021, early in the pandemic, I did the obvious thing about it and published a boilerplate:
*"a clean and concise architecture boilerplate for those trying to navigate on node development."*
Four layers: entities, providers, repositories, use cases, a folder per use case, interface-first,
a thin layer over Express with dependency injection. A few thousand lines, and a `Player` entity for
the example. It is, recognisably, ExpressoTS.

**As a boilerplate it failed**, in the way boilerplates always fail. A template is a snapshot: correct the moment it is cloned, drifting from that second onward, with no way to ship you an improvement. My own history shows it, for nearly two years the repo accumulated contributors whose commit messages
say things like *"refactoring to maintain project standards."* The standard existed. It simply had to
be enforced by hand, by whoever remembered it, forever, which is an undocumented convention wearing a
nicer hat.

That is when the framework really started: the day I understood that documentation and a good example
cannot fully reinforce an architecture. Only processes and tools combined can.

### Complexity and constraints

I built it alone, in spare time, full days at weekends, against a full-time job and a university
teaching load during the week. Every architectural decision here was made by someone who would not
get another block of hours until Saturday, and that shows in the repo: long silences punctuated by
intense bursts over the weekend or specific days of the week. When your budget is weekends, **momentum is the scarce resource, not effort**, and
anything that costs momentum like an unclear migration, a decision you have to re-litigate, a manual
step in a release, is far more expensive than it looks.

The other constraints shaped every technical decision:

**A framework is a public API, and public APIs are close to permanent.** Every decorator name and
constructor signature becomes something thousands of codebases depend on. A change I would make
casually inside an application is, here, a migration I am asking strangers to perform. Four major
versions in three and a half years, each with a published upgrade guide, is most of what that
constraint cost.

**Distribution, not engineering, was the binding problem.** A framework nobody adopts is a hobby
project with good tests. The runtime was never more than half the work; the other half was the CLI,
the documentation site, examples, governance, upgrade paths and talks.

**Technically:** sitting *on top of* Express rather than replacing it, so users kept the ecosystem
they already had; making dependency injection work through TypeScript decorators and
`reflect-metadata`, which meant betting on a decorator design that ran ahead of the language
standard; and holding cold start to 8–25 ms so the framework stayed viable in serverless.

### My approach

The core decision follows directly from why the boilerplate failed: **make the architecture generated
rather than remembered.** In February 2023 I built the CLI and published `@expressots/core` v1.0.0
within a fortnight of each other, deliberately, because neither is worth much without the other. A
new engineer doesn't read a conventions document and try to comply; they run `expressots g usecase`
and land in the right shape by default. The CLI is not tooling around the framework, it *is* the
enforcement mechanism, and it is why the four layers I sketched by hand in 2021 are still the four
layers today.

Three other decisions I'd defend:

**Not adopting NestJS.** It's the obvious "why didn't you just use this", so let me be precise. NestJS's
architecture is Angular's architecture transplanted to the server, deliberately, because that is a
distribution strategy, it lets a large population of Angular developers write backend services in a
shape they already know. That's a smart go-to-market move. It is not an argument that a frontend
framework's structure is the right structure for a server, and what you pay for it is verbosity:
modules, decorators and ceremony out of proportion to the problem. I wanted the structure to fall out
of the *use case*, which is what a backend actually organises around, and to stay as thin as possible
over Express. Reasonable people take the other side of that; it is the bet the project is.

**A lean core, with an adapter and a provider ecosystem around it.** Auth, queues and database access
are plugins, so an ExpressoTS app needs more assembly than a NestJS one, that cost is real. In
exchange the framework stays small enough to understand, cheap enough to start, and the parts I
didn't build can't rot. For the same reason `@expressots/adapter-express` isolates the web server
behind an interface rather than replacing it: writing my own HTTP stack would have bought benchmark
headlines and cost me the entire Express middleware ecosystem on day one.

**Making the architecture visible, not just enforced.** Generation fixes day one; day four hundred is
a different job. v4 (GA July 2026) added interceptors, type-safe events with replay, lazy module
loading and guards and **Studio**, a local developer platform that draws the application's real
architecture, live request timeline, DI container and per-route latency, entirely on the developer's
own machine. The thing that usually drifts silently is now something you can look at.

The same reasoning is why v4 ships `AGENTS.md` in every template, an `llms.txt`, and an MCP server
that generates ExpressoTS-idiomatic code. A convention only humans can follow decays; a convention a
coding agent can follow holds. That's the 2021 lesson applied to a new kind of contributor.

### Impact

- **~2.1 million monthly downloads** of `@expressots/core` (August 2026), with `@expressots/shared`
  at ~2.5M and the CLI and Express adapter at ~1.9M each — up roughly fourfold across the v4 preview
  and GA cycle.
- **1,848 GitHub stars, 28 contributors**, MIT licensed, with a published governance model, and four
  majors in three and a half years each with a documented migration path.

Those show reach. The ones that test the original claim that a framework can hold an architecture
steady across projects, teams and people who have never spoken to me matter more:

- **Several companies and products publicly listed as running on it in our site**.
- **Production services at more than one employer, current and past**.
- **Five years of teaching it to undergraduates** on a games programming degree, cohorts of around
  thirty, several hundred students building their first backend service. That's the hardest
  onboarding case there is: people with no prior architecture to unlearn, shipping a working service
  inside a term.
- Invited to present the architecture at **VanJS** in April 2024, alongside recorded walkthroughs and
  written articles that people now learn the framework from rather than learning it from me.

### Reflection

After v3 shipped in December 2024 I froze the feature surface for a year. 2025 was a stability year,
no new capability, bugs and tests only and for users of a framework maintained out of weekends I
still think that was right. What I'd change is what I did with the year. I treated it as maintenance
when it was really the year I was working out what v4 had to be, and I should have made that explicit
much earlier: said publicly what the next version was for, and built it in the open.

The wider version of the same lesson: I had the architecture right in March 2021 and then spent two
years proving it the expensive way, by shipping the version that couldn't enforce itself. The
step-change in adoption never came from a single runtime feature, it came from the release where the
tooling, the documentation and the developer experience finally caught up with the architecture. If I
did this again I'd treat adoption as an engineering problem from day one, not as something that
follows a good runtime.

What it changed about how I work: I no longer separate building the thing from getting the thing
adopted. A generator, an upgrade guide and a set of agent instructions are not overhead that trails a
feature. For anything with users, they are most of what the feature *is*.
