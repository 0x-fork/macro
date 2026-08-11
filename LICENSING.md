# Licensing

Macro is dual licensed. This document explains what that means for you, why we
ask contributors to sign a CLA, what we commit to in return, and how we
reinvest commercial revenue into the community.

- [The short version](#the-short-version)
- [The AGPLv3 license](#the-agplv3-license)
- [Commercial licenses](#commercial-licenses)
- [Why we ask for a CLA](#why-we-ask-for-a-cla)
- [What we commit to](#what-we-commit-to)
- [Reinvesting commercial revenue in the community](#reinvesting-commercial-revenue-in-the-community)
- [Contact](#contact)

## The short version

| If you want to…                                                        | You need…                                    |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| Run Macro for yourself, your team, or your company                      | Nothing. The AGPLv3 covers you.              |
| Self-host Macro, modify it, and keep your changes internal              | Nothing. The AGPLv3 covers you.              |
| Fork Macro and distribute or offer it as a service, sources included    | Nothing. The AGPLv3 covers you.              |
| Build a product on Macro without releasing your source under the AGPLv3 | A commercial license.                        |
| Embed or resell Macro under your own terms                              | A commercial license.                        |
| Contribute code, docs, or other work to Macro                           | To sign the [CLA](CLA.md).                   |

## The AGPLv3 license

Macro is released under the [GNU Affero General Public License v3.0](LICENSE.txt).
The whole product is open source — not open core. There is no separate
proprietary edition with the good parts held back, and no feature-gated
"enterprise" build living in a private repository. The code that runs
[macro.com](https://macro.com) is the code in this repository.

The AGPLv3 gives you the freedom to run, study, modify, and share Macro. Its one
substantial condition is reciprocity: if you distribute Macro or offer a modified
version to others over a network, the corresponding source — including your
modifications — has to be available to those users under the AGPLv3.

For most people that condition costs nothing. Running Macro internally, however
heavily modified, triggers nothing. The [FAQ](https://docs.macro.com/faq) covers
self-hosting in practice.

## Commercial licenses

Some companies cannot accept the AGPLv3's reciprocity condition — usually
because they want to build a proprietary product on top of Macro, embed it in
something they ship, or resell it under their own terms. For those cases we sell
a commercial license that replaces the AGPLv3's obligations with negotiated
terms.

This is the same code under different terms. It is not a different, better
version of Macro.

Commercial licensing, including OEM and embedding:
[licensing@macro.com](mailto:licensing@macro.com). Managed hosting and support:
[self-host@macro.com](mailto:self-host@macro.com).

## Why we ask for a CLA

Selling a commercial license means licensing the whole codebase under terms
other than the AGPLv3. We can only do that for code we hold the necessary rights
to. Contributions arrive owned by their authors, so without an explicit
agreement we would hold only what the inbound license gives us — the AGPLv3 —
and could not include contributed code in a commercially licensed build.

So we ask every contributor to sign a **Contributor License Agreement**:

- [CLA.md](CLA.md) — for individuals
- [CLA-ENTITY.md](CLA-ENTITY.md) — for companies and other organizations

Two things worth being precise about, because CLAs have a bad reputation and
some of it is earned:

**It is a license, not an assignment.** You keep the copyright in everything you
write. You can reuse your own contribution in your own projects, under any
license, forever, without asking us. We deliberately did not use a copyright
assignment agreement: assignment is unnecessary for dual licensing, it is
difficult or impossible to execute in jurisdictions whose law does not permit
authors to transfer copyright outright (Germany and France among them), and it
takes something from contributors that we do not need.

**The grant is genuinely broad.** The CLA lets us license your contribution
under any terms we choose, including proprietary terms. That is the part that
makes commercial licensing possible, and we would rather state it plainly than
bury it in a sublicensing clause. The commitments in the next section are what
we offer in return.

If you would rather not sign, that is a legitimate choice. Bug reports,
reproductions, design feedback, documentation issues, and discussion are all
valuable and none of them require a CLA — only contributions of copyrightable
work do.

## What we commit to

These are commitments from Macro to the people who contribute to and depend on
this project. They are statements of our policy and intent rather than terms of
the CLA, and we hold ourselves to them publicly.

1. **Macro stays open source.** Every release of Macro will continue to be
   published under the AGPLv3 or a later version of it. We will not relicense
   the project to a source-available, "business source", or otherwise
   non-open-source license.

2. **Nothing gets held back.** We will not move features out of this repository
   into a proprietary edition. If we ship it, it is here.

3. **No rug pull.** If Macro, Inc. ever stops developing and distributing Macro
   as open source — through acquisition, wind-down, or a change of strategy — we
   will release the then-current codebase under the Apache License 2.0 so the
   community can carry it forward without us. We will require any successor to
   the copyrights in this project to honor commitments 1 and 3.

4. **Your work stays yours.** You keep your copyright. We maintain contributor
   attribution in the git history and credit substantive contributions in
   release notes.

5. **We say what changed.** Any future version of the CLA, and any material
   change to this document, ships as a pull request in this repository with the
   reasoning in the description — not as a quiet edit.

## Reinvesting commercial revenue in the community

Dual licensing only works as a bargain if the commercial side funds the open
side. Concretely, revenue from commercial licenses and hosted Macro pays for:

- **Paid work on community-reported issues.** We fund bounties on issues labeled
  `bounty`, sized by scope and impact, alongside the security bounties we
  already pay for reports to
  [security@macro.com](mailto:security@macro.com).
- **Grants for sustained contributors.** Direct grants and sponsorships for
  people doing ongoing work on Macro — maintaining a subsystem, a client, a
  packaging target — so that the work does not have to be a hobby.
- **Paid maintainer time on the community.** Macro engineers are allocated time
  for code review, issue triage, and self-hosting support as part of their job,
  not as an after-hours favor. Review latency on outside pull requests is
  something we measure.
- **Self-hosting as a first-class target.** Documentation, container images,
  migrations, and release engineering for self-hosters get funded even though
  self-hosters are, by design, not paying us.
- **Upstream dependencies.** We sponsor the open source projects Macro is built
  on. We are a Rust and SolidJS product standing on a lot of volunteer work, and
  we intend to pay into that ecosystem rather than only draw from it.
- **Free access for the people who build it.** Contributors get hosted Macro at
  no charge, and we keep free and discounted plans for open source projects,
  nonprofits, and students.

We publish what this added up to once a year: what we spent on bounties, grants,
and upstream sponsorship, and where it went. If the commercial side of Macro
grows, the community side grows with it — that is the point of the arrangement,
and an annual number is how you hold us to it.

## Contact

| Topic                                       | Where                                                      |
| ------------------------------------------- | ---------------------------------------------------------- |
| Commercial licensing, OEM, embedding        | [licensing@macro.com](mailto:licensing@macro.com)          |
| Managed hosting, support contracts          | [self-host@macro.com](mailto:self-host@macro.com)          |
| CLA questions, signing offline, entity CLAs | [legal@macro.com](mailto:legal@macro.com)                  |
| Security reports                            | [security@macro.com](mailto:security@macro.com)            |
| Everything else                             | [contact@macro.com](mailto:contact@macro.com)              |
