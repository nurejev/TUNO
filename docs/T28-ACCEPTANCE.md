# T28 — Phase 4 acceptance (the 15 Oct rebuild plan)

The plan ends with one test: **a PVM engineer moves NL-Breda through all five
stages without help**, on the devcf lab first, then at PVM. This is the list
that run is checked against, build 10728. Each line names the stage on the
🌊 Wave screen and what the engineer must see there, with no console, no
rules pasted, no one explaining.

Builds covered: Phase 0 (10709–10713), Phase 1 (10714–10717, 10719),
Phase 2 (10721–10725), Phase 3 (10726–10727). Lab: devcf, prefix P2719.

## Before the run

- [ ] The instance serves `/t28-project.json` (PVM: the self-hosted dev
      instance; lab: the file with `lab: true`) and ⚙️ Project setup says
      **loaded**, read-only. No rules live in the browser.
- [ ] ⚙️ says the project state is **in the tenant** (the anchor group
      exists from ⚡ ⓪) — or says in this browser only, with the way out.
- [ ] 📜 Changes lists this browser's earlier runs after a reload.

## Stage 1 · Set up (🌊 Wave groups & test members)

- [ ] The spine shows the Euro wave with Set up as the current stage and
      names what is missing ("device wave, hold-back pair to create").
- [ ] Open stage → the groups are ticked, **Dry run — create n selected
      groups** → a plan listing every group, the confirm line naming them,
      ③ backup, ④ Apply → "done · verified" per group, the run in 📜.
- [ ] ⚡ ⓪ offers the project's groups (hold-back pair, pinned, skip, the
      state anchor, the test members' groups nested in their wave) → the
      same plan path → ⚙️ then says the state is in the tenant.
- [ ] The spine's Set up turns ✓ without a refresh.

## Stage 2 · Members (👥 Country groups)

- [ ] Members is the current stage; its lines list the wave's countries
      with users and devices and why each is open ("not nested").
- [ ] Open stage → NL-Breda is a pilot in batches: batch 1 dry run →
      backup → Apply → the batch's users and their devices in the country
      groups, nested, verified.
- [ ] A user put in the hold-back after the dry run is **left out and named**
      at Apply ("⏸ 1 member held back since the read — left out").
- [ ] A country whose source group did not read says **not read** and plans
      nothing; nothing is removed anywhere.
- [ ] A country group that still holds a held-back member is **not nested**;
      the dry run says why.
- [ ] After the last batch, **Finish** nests the user group; the spine's
      Members turns ✓.

## Stage 3 · Assign (⚡ Rollout actions)

- [ ] Assign is current; its lines say "① include … n policies to plan",
      "③ exclude … in place", "④ filter … n assignments to plan".
- [ ] ⚡ ① Include the waves → a plan over the new policies, the device
      waves to the - D - policies and the user waves to the - U - ones →
      backup → Apply → written · verified.
- [ ] ⚡ ③ Exclude the waves from the colliding old policies → the same path.
- [ ] ⚡ ④ The W365/AVD filter, Exclude, on every wave include.
- [ ] The spine's Assign turns ✓; Verify becomes current.

## Stage 4 · Verify (📡 Verify)

- [ ] Open stage → the wave's devices and what they report; a device with
      an error or a conflict is listed with the policy; the spine's Verify
      says "n devices with errors or conflicts of m".
- [ ] A device the policies never reached is said as such, not as clean.

## Stage 5 · Exceptions (⏸ Hold-back)

- [ ] Search a user or a device → every route into the wave is listed →
      Hold back → the plan takes them out of each route and into the
      hold-back pair → backup → Apply → verified; 📜 offers ↶ Undo.
- [ ] Resume (the way back) is the inverse plan from 📜.
- [ ] The spine's Exceptions line counts them.

## Safety, as the engineer meets it

- [ ] A throttle during a run (lab: the 🧪 fault switch, "write 503 ×6"):
      the step says "throttled — stopped at step n of N", the rest unsent,
      📜 offers **↷ Resume**, the resume finishes the job, and the stopped
      run stops offering a resume once that read back clean.
- [ ] A failed group read (lab: "next read of a chosen group fails"): the
      row says not read, the dry run plans nothing for it.
- [ ] Every Apply is behind the same gates: the confirm line, "I have read
      the plan", the group backup, and REMOVE typed when a plan removes.
- [ ] Nothing was written to any tenant outside a plan — the Entra audit log
      shows only the runs in 📜.

## Known follow-ups (not blocking the run)

- Per-group member reads still differ in URL per pane (direct vs
  transitive, different $select), so a refresh shares fewer lists than it
  could — the single reader (10722) covers the lists that already match.
- A stage's lines use the counts at the last read; the spine says so.
- The assignment engine (⚡ ①–④) runs AssignEdit's own verified writer
  behind the same gates; moving it onto T28Plan.runItems is a Phase 5
  candidate, not a safety gap.
