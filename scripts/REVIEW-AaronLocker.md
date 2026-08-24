# Invoke-TunoAppLockerScan.ps1 vs AaronLocker — a full re-review

Written at beta 10354. AaronLocker read at `main`, MIT licensed
(<https://github.com/microsoft/AaronLocker>). This compares the two designs
area by area and states, for each, which one is right — including where that
is not us.

Nothing here has been run on Windows. Every claim about AaronLocker is from
its source, cited; every claim about our script is from ours. Where a question
can only be settled by running something, it says so instead of guessing.

---

## 1. Writable-directory discovery — the heart of both tools

|  | AaronLocker | TUNO |
|---|---|---|
| Mechanism | `accesschk.exe /accepteula -nobanner -w -d -s -f <filter> <root>`, stdout parsed by column position | `DirectorySecurity` per directory, ACEs evaluated in-process |
| Roots | `%windir%`, `%ProgramFiles%`, `%ProgramFiles(x86)%` — **three** | `-Scope`, defaulting to System + ProgramFiles, and able to include ProgramData and user profiles |
| Deny ACEs | **Not honoured** in the ADS check (see §3) | Honoured — allow and deny masks accumulated per SID, then subtracted |
| Effective access | Yes — AccessChk resolves group nesting and ACE ordering | **No** — per-SID ACE arithmetic against a trusted-SID set |
| Orphaned SIDs | Lost — identity compared as a resolved name string | Preserved — `GetAccessRules(..., [SecurityIdentifier])`, never translated |
| Null DACL | Not handled | Reported as Everyone-writable, which is what a null DACL means |
| Writable **files** | **Never** — `-d` restricts AccessChk to directories, and the script header says so | Also no. Same gap. |

### Where we are better, and it is not close

**Deny ACEs.** `HasWritableADS` in `Create-Policies-AppLocker.ps1` ORs
`FileSystemRights` across every matching ACE without looking at
`AccessControlType`, so an explicit Deny contributes rights. Confirmed in
source. Two further defects in the same eight lines: `$totalRights` is
initialised outside the per-grantee loop, so rights are unioned across
*different* principals — two accounts each holding half the mask jointly
satisfy it — and identity matching is a raw string comparison between
AccessChk's stdout and `Get-Acl`'s output, which silently fails when one side
yields an unresolved SID. That is common on Entra-joined machines.

In fairness, and this matters for how alarmed to be: that bug's failure
direction is *more* exceptions, so a more restrictive policy. It breaks apps
rather than admitting attackers.

**Orphaned SIDs.** AaronLocker compares `$ace.IdentityReference.Value` to a
name scraped from stdout. A SID for a deleted account cannot be translated to a
name, so the ACE is dropped. An orphaned SID with write access to a directory
inside Program Files is precisely the finding worth having, and it disappears.
We ask for identities as `SecurityIdentifier` and never translate, for exactly
this reason.

**Enumerating admins.** AaronLocker's own source carries a `#TODO` admitting
`Get-LocalGroupMember` fails when disconnected from the domain and on
Entra-joined machines with `S-1-12-1-…` SIDs, and ships
`CustomizationInputs/KnownAdmins.ps1` as the workaround — i.e. it asks the
operator to hand-maintain a list of administrators. We take the same risk but
fail in the opposite direction: an admin group we cannot resolve produces a
*finding* rather than a silent omission.

### Where AaronLocker is better, and we should not pretend otherwise

**Effective access.** This is the real one. AccessChk computes what an account
can actually do, resolving group nesting, ACE order and inheritance. We compare
ACE SIDs against a set of trusted SIDs. The consequence:

- A directory granting write to `CONTOSO\App-Deployers`, a group containing only
  administrators, is a **false positive** for us and correctly filtered by
  AaronLocker.
- A directory granting write to a nested group that ultimately contains ordinary
  users is caught by both — us because the group SID is not in the trusted set,
  AaronLocker because effective access says so.

So our error direction is over-reporting: extra exceptions, a tighter policy,
more noise. That is the safer direction, and it is still an error. On a domain
with heavy nested-group use we will produce exceptions nobody needs.

**Three roots versus ours.** Not better, but worth stating plainly: AaronLocker
deliberately does *not* ACL-scan ProgramData or user profiles during policy
generation — it treats them as unsafe wholesale. That is a defensible choice and
much faster. We walk them when asked, which is more thorough and much slower.

---

## 2. What we both miss

**User-writable FILES.** A writable file inside a non-writable directory can be
overwritten with arbitrary content and executed. AaronLocker's own header says
this outright and does nothing about it. Neither do we. This is the largest
shared blind spot and neither tool's design currently addresses it.

**Share permissions.** AccessChk can read them with `-h`; AaronLocker never
passes it. We do not read them either. Our report says so; AaronLocker's does
not.

**Backup privilege.** Neither tool enables `SeBackupPrivilege` to read past a
DACL that denies the administrator. Both simply advise running elevated.
AccessChk's documentation makes no claim here either — this is unverified for
both, not a differentiator.

---

## 3. The directory-reading failures in OUR walk — found in this review

The user report that started this ("issues reading all directories") is real,
and it was not the DACL evaluation. It was the walk around it. Fixed in 10354:

**MAX_PATH took whole subtrees.** `[System.IO.Directory]::GetDirectories($dir)`
on Windows PowerShell 5.1 runs on .NET Framework, where a path over 260
characters throws `PathTooLongException` unless given in `\\?\` form. We caught
that exception and counted it as one unreadable directory — but the throw
happens on the *parent's* listing, so **everything beneath it was skipped**.
Deep trees under ProgramData and AppData are exactly where droppable
directories live. Paths are now converted to `\\?\` form for the walk and
converted back for display and for the rules, where a `\\?\` prefix would be
wrong.

**Two silent skips.** A subdirectory whose attributes could not be read was
`continue`d without being counted — so a directory whose reparse status was
*unknown* was treated as if it had been examined. And reparse points, skipped
deliberately, were never reported at all. Both are now counted and named.

**One number for three failures.** Access-denied, listing-failed and
path-too-long all incremented the same counter and produced one warning telling
you to run elevated — advice that does nothing for a long path. They are now
counted and reported separately, because the remedies differ.

AaronLocker has no long-path handling anywhere either, and its parser discards
AccessChk's error lines without counting them. It is not better here; it is
quieter about being worse.

---

## 4. Artifact inventory and rule generation

Closer than expected, with one clear win each way.

**AaronLocker's win: PE sniffing is on by default.** It inventories via
`Get-AppLockerFileInformation`, then enumerates every remaining file whose
extension is not in a ~70-entry never-executable denylist and runs a real
PE-header check on it — MZ, `e_lfanew`, PE signature, subsystem GUI/CUI — so a
PE with no extension or a disguised one is caught. It then appends a marker and
a fake extension so `New-AppLockerPolicy` files it into the right collection.

We have the same check (`Test-PortableExecutable`) but it is **opt-in behind
`-SniffUnknownExtensions`**, and it is gated on `$f.Length -ge 512`. Default-off
is the wrong default for the thing an attacker actually does. Recommend
flipping it, with the denylist as the performance guard rather than the switch.

**Our win: we refuse to write a rule we cannot make correct.** AppLocker
matches unsigned binaries on the *Authenticode* hash, which only
`Get-AppLockerFileInformation` produces. Where that is unavailable, we write no
rule and say so; a rule built from a flat SHA-256 would look right and match
nothing. AaronLocker has no equivalent guard because it always has the cmdlet —
which is also why it hard-fails on anything but PowerShell 5.1.

**Granularity.** AaronLocker defaults to publisher+product+binary, clamps
Microsoft-signed files to at least publisher+product, and always sets
`HighSection = $null` so newer versions are allowed. It also warns that trusting
all Microsoft-signed files is over-broad. Ours is `-PublisherRuleGranularity`.
Worth checking ours applies the same Microsoft floor — **not verified in this
review**.

**Exceptions.** AaronLocker substitutes writable directories into placeholder
elements in a template XML, normalising `System32` and `SysWOW64` to one
`%SYSTEM32%` macro. We build the exceptions in code. Same outcome. Their
in-source comment notes a blind spot we should check for ourselves: because
their normalisation anchors on a trailing backslash, *the top-level directories
themselves* never appear in the exception list.

---

## 5. Things AaronLocker does that we do not, and should consider

- **A deny-list of LOLBins in the Windows rule's exceptions**
  (`PLACEHOLDER_WINDIR_EXEDENYLIST`, from `GetExeFilesToDenyList.ps1`) — the
  mshta/cipher class, inserted as publisher conditions. We have
  `$script:LolBinPatterns`, applied as path exceptions on the Exe rule only.
  Publisher conditions survive a file being moved; path exceptions do not.
- **Rescan caching.** Their scan results are files, and a policy can be
  maintained on another machine without rescanning. Ours is one shot.
- **`-Rescan` separation** — policy generation and scanning are separable.

## 6. Things we do that AaronLocker does not

- Runs on PowerShell 7 as well as 5.1 (AaronLocker hard-refuses anything but
  5.1, in code, though its own description claims "5.1 or higher").
- No Excel/COM dependency. AaronLocker's `-Excel` path calls
  `New-Object -ComObject excel.application` and sets `Visible = $true` — a
  visible Excel window, unusable unattended.
- Reads the AppLocker event log and reports what has already been blocked.
- Emits one JSON bundle designed to be read by something else, rather than a
  tree of files plus a spreadsheet.
- States what it could not see, in the bundle, in numbers.

---

## 7. AccessChk — should we use it?

**Not as a dependency, and not fetched at scan time.** Reasons, in order:

1. **It does not fix the reported problem.** The directories we were missing
   were missed by our *walk*, to MAX_PATH and silent skips — fixed in §3 without
   any external tool. AccessChk's own long-path behaviour is undocumented, and
   AaronLocker's parser discards its errors without counting them, so adopting it
   would trade a measured gap for an unmeasured one.
2. **It would not close the biggest gap either.** `-d` means AccessChk never
   looks at files, and user-writable *files* are the blind spot both tools share.
3. **What it genuinely adds is effective access** (§1), which is worth having —
   as a **cross-check**, not as the primary source. The interesting output is
   where the two disagree.
4. **Fetching and executing it at scan time is a security decision, not a
   convenience.** AaronLocker does exactly this — `DownloadAccesschk.ps1` pulls
   `https://live.sysinternals.com/accesschk.exe` with `Invoke-WebRequest` — and
   its own source carries the TODO *"Verify that Invoke-Request succeeded"*. It
   performs **no hash or signature check** on the binary before running it. That
   is precedent for the mechanism and an argument against copying it as written.
5. **The irony is not cosmetic.** Our target is an AppLocker-hardened estate.
   Executing a binary fetched over the network at scan time is precisely what a
   correct AppLocker policy should block — so the tool that builds the policy
   would depend on the policy not existing yet.

**If it is wanted anyway**, the shape that is defensible:

- Opt-in switch, off by default: `-CrossCheckWithAccessChk`.
- `-AccessChkPath` pointing at a copy the operator already trusts. No download.
- If a download is genuinely wanted, then over HTTPS from
  `live.sysinternals.com`, to a temp path, and **the Authenticode signature must
  be verified as Microsoft's with `Get-AuthenticodeSignature` before it is
  executed** — the check AaronLocker's TODO admits it never wrote.
- Output used to produce a **disagreement report**, not to replace our result.
  "AccessChk says these 4 directories are writable and we do not" is worth an
  admin's attention. Silently preferring either answer is not.

---

## 8. Recommendations, in the order I would do them

1. **Done in 10354** — long paths, and count the three failure kinds apart.
2. **Flip PE sniffing on by default.** Their default is right and ours is not.
3. **Check the Microsoft-publisher floor.** Verify we clamp Microsoft-signed
   files the way AaronLocker does; if not, add it.
4. **Check the top-level-directory blind spot** their comment admits to, in our
   own normalisation.
5. **Consider LOLBin exceptions as publisher conditions** rather than paths.
6. **Only then**, if still wanted, the opt-in AccessChk cross-check in §7.
7. **Address writable files** — the gap neither tool covers. This is the one
   that would make ours meaningfully better rather than incrementally tidier.
