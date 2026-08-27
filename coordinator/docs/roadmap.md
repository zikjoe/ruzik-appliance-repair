# Roadmap — What's Left

The coordinator backend itself is built and merged (PR #1): lead intake,
guardrails, scheduling assist, messaging, closeout, reporting, audit
logging, and owner alerts, all covered by the acceptance test suite. What's
tracked below is everything between "the code works" and "a real customer
can talk to it" — plus a couple of independent quality-of-life items.

GitHub Issues (#2–#12 in this repo) are the live source of truth — check
them off there, not here. This diagram is a snapshot of how they block each
other; it won't update itself when an issue closes or a new one gets filed.

```mermaid
flowchart LR
    classDef business fill:#f4d9c6,stroke:#b94e2c,color:#3a1f10
    classDef golive fill:#cfe0d6,stroke:#3e7a57,color:#173321
    classDef feature fill:#dbe3ef,stroke:#5e7391,color:#1c2b3e
    classDef launch fill:#f0d3d8,stroke:#ac3448,color:#3a0f16

    subgraph P1["Phase 1 — Foundation (no blockers, start anytime)"]
        I2["#2 Business & ownership decisions 🔒"]:::business
        I4["#4 First-response-time metric"]:::feature
        I5["#5 Twilio SMS adapter (code)"]:::golive
        I6["#6 Admin dashboard UI"]:::feature
    end

    subgraph P2["Phase 2 — Infrastructure & wiring — gate: Phase 1 closed"]
        I3["#3 Human QA checklist"]:::golive
        I7["#7 Provision hosting 🔒"]:::golive
        I8["#8 Netlify webhook config 🔒"]:::golive
        I9["#9 Production credentials 🔒"]:::golive
        I10["#10 SMTP for owner alerts 🔒"]:::golive
        I11["#11 Twilio account + wiring 🔒"]:::golive
    end

    subgraph P3["Phase 3 — Launch — gate: Phase 2 closed"]
        I12["#12 Go-live cutover 🔒"]:::launch
    end

    I2 --> I7
    I7 --> I8
    I2 --> I9
    I7 --> I9
    I2 --> I10
    I7 --> I10
    I2 --> I11
    I5 --> I11
    I7 --> I11
    I3 --> I12
    I8 --> I12
    I9 --> I12
    I10 --> I12
    I11 --> I12

    click I2 "https://github.com/zikjoe/ruzik-appliance-repair/issues/2" _blank
    click I3 "https://github.com/zikjoe/ruzik-appliance-repair/issues/3" _blank
    click I4 "https://github.com/zikjoe/ruzik-appliance-repair/issues/4" _blank
    click I5 "https://github.com/zikjoe/ruzik-appliance-repair/issues/5" _blank
    click I6 "https://github.com/zikjoe/ruzik-appliance-repair/issues/6" _blank
    click I7 "https://github.com/zikjoe/ruzik-appliance-repair/issues/7" _blank
    click I8 "https://github.com/zikjoe/ruzik-appliance-repair/issues/8" _blank
    click I9 "https://github.com/zikjoe/ruzik-appliance-repair/issues/9" _blank
    click I10 "https://github.com/zikjoe/ruzik-appliance-repair/issues/10" _blank
    click I11 "https://github.com/zikjoe/ruzik-appliance-repair/issues/11" _blank
    click I12 "https://github.com/zikjoe/ruzik-appliance-repair/issues/12" _blank
```

**Reading it:** an arrow means "the tail blocks the head" — #2 has to close
before #7 can reasonably start, not just before it finishes. Tan = business
decision. Green = go-live infrastructure. Blue = independent improvements
that don't block launch. Red = the actual cutover. **🔒 = needs you
specifically** — an account, a payment decision, or a real-world action
I can't take on your behalf, as distinct from code/doc work that can just
get picked up. Everything unlocked (#3, #4, #5, #6) is engineering work,
available to hand to a session anytime, no waiting on you.

**The three phases are gates, not just labels** — also applied as GitHub
labels (`phase-1-foundation`, `phase-2-infrastructure`, `phase-3-launch`)
so they're filterable on the issues list too. Phase 2 shouldn't meaningfully
start until Phase 1 is closed (it's blocked on #2 and, for #11, on #5) —
same for Phase 3 against Phase 2. GitHub Milestones would give the same
grouping with a built-in progress bar; I don't have a tool that can create
one, so labels are standing in unless you'd rather set up the three
milestones yourself (Issues → Milestones → New milestone) and hand me the
numbers to assign issues to them.

**Two nodes have no arrows on purpose** — #4 (first-response-time metric)
and #6 (admin dashboard) don't block anything and aren't blocked by
anything. They're real, tracked work, just not on the critical path to
going live.

**What's deliberately not here:** voice calls, autonomous pricing,
payments, contractor payouts, parts purchasing. Those aren't backlog items
— they're out of scope for this pilot by design (see the job description's
Phase-One Channels section and `pilot-plan.md`), so they don't get tickets.
