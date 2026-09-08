/**
 * Shared app shell helpers for wired SCL M3 pages.
 */
(function (global) {
  "use strict";

  function qs(name, url) {
    const u = url ? new URL(url, location.href) : new URL(location.href);
    return u.searchParams.get(name);
  }

  function navHtml(active) {
    const session = global.SCLStore ? global.SCLStore.getSession() : { role: "capper" };
    const items = [
      { id: "home", href: "index.html", label: "Home" },
      { id: "profile", href: "profile.html", label: "Profiles" },
      { id: "monetization", href: "monetization.html", label: "Monetization" },
      { id: "admin", href: "admin.html", label: "Admin" },
    ];
    return `
      <nav class="scl-mock-nav" aria-label="SCL app">
        ${items
          .map(
            (it) =>
              `<a href="${it.href}" class="${it.id === active ? "is-active" : ""}">${it.label}</a>`
          )
          .join("")}
        <span style="margin-left:auto;color:#94a3b8;font-size:12px;padding:6px 10px;">
          Role: ${session.role || "capper"}
        </span>
      </nav>`;
  }

  function mountNav(active) {
    const host = document.getElementById("scl-app-nav");
    if (host) host.innerHTML = navHtml(active);
  }

  function roleSwitcherHtml() {
    const session = global.SCLStore.getSession();
    const cappers = global.SCLStore.listCappers();
    return `
      <div class="scl-btn-row" style="margin-bottom:16px;">
        <label class="scl-field" style="min-width:160px;">
          <span class="scl-label">View as</span>
          <select class="scl-select" id="scl-role">
            <option value="capper" ${session.role === "capper" ? "selected" : ""}>Capper</option>
            <option value="admin" ${session.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="public" ${session.role === "public" ? "selected" : ""}>Public</option>
          </select>
        </label>
        <label class="scl-field" style="min-width:220px;">
          <span class="scl-label">Active capper</span>
          <select class="scl-select" id="scl-capper">
            ${cappers
              .map(
                (c) =>
                  `<option value="${c.id}" ${session.capperId === c.id ? "selected" : ""}>${c.name}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="scl-field" style="justify-content:flex-end;">
          <span class="scl-label">&nbsp;</span>
          <button type="button" class="scl-btn scl-btn--ghost scl-btn--sm" id="scl-reset">Reset demo data</button>
        </div>
      </div>`;
  }

  function mountRoleSwitcher(hostId) {
    const host = document.getElementById(hostId || "scl-role-bar");
    if (!host) return;
    host.innerHTML = roleSwitcherHtml();
    const role = document.getElementById("scl-role");
    const capper = document.getElementById("scl-capper");
    const reset = document.getElementById("scl-reset");
    if (role) {
      role.addEventListener("change", () => {
        global.SCLStore.setSession({ role: role.value });
        location.reload();
      });
    }
    if (capper) {
      capper.addEventListener("change", () => {
        global.SCLStore.setSession({ capperId: capper.value });
        location.reload();
      });
    }
    if (reset) {
      reset.addEventListener("click", () => {
        if (confirm("Reset all Milestone 3 demo data?")) {
          global.SCLStore.resetDemo();
          location.reload();
        }
      });
    }
  }

  global.SCLApp = {
    qs,
    navHtml,
    mountNav,
    mountRoleSwitcher,
  };
})(typeof window !== "undefined" ? window : globalThis);
