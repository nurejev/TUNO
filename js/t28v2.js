// Same page, same sign-in, two independent T28 workspaces.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  MdeRolloutV2Tool.init();
  let version = 1;
  const originalHook = window.TunoScreenHooks["screen-mderollout"];
  window.TunoScreenHooks["screen-mderollout"] = () => version === 2 ? MdeRolloutV2Tool.onShow() : originalHook();
  const blocked = (s) => s.busy || s.running || s.mem.loading || s.ex.loading || s.ex.searching || s.ex.cardLoading || s.reps.busy || s.enriching;
  function choose(next) {
    if (version === next) return;
    if (blocked(MdeRolloutTool._state()) || blocked(MdeRolloutV2Tool._state())) {
      $("t28VersionStatus").textContent = "Wait until the current read or write finishes.";
      return;
    }
    // Never keep a pending plan across a workspace switch.
    for (const id of ["mrDiscard", "mvDiscard"]) if ($(id)) $(id).click();
    version = next;
    $("t28Workspace1").hidden = next !== 1;
    $("t28Workspace2").hidden = next !== 2;
    for (const v of [1, 2]) {
      $("t28Version" + v).classList.toggle("active", v === next);
      $("t28Version" + v).setAttribute("aria-pressed", String(v === next));
    }
    $("t28VersionStatus").textContent = "Re-read the tenant before planning changes. Both versions manage the same tenant.";
    window.TunoScreenHooks["screen-mderollout"]();
  }
  $("t28Version1").addEventListener("click", () => choose(1));
  $("t28Version2").addEventListener("click", () => choose(2));
  window.addEventListener("tuno:signout", () => {
    version = 1; $("t28Workspace1").hidden = false; $("t28Workspace2").hidden = true;
    $("t28Version1").classList.add("active"); $("t28Version2").classList.remove("active");
    $("t28Version1").setAttribute("aria-pressed", "true"); $("t28Version2").setAttribute("aria-pressed", "false");
    $("t28VersionStatus").textContent = "";
  });
})();
