/**
 * SCL Marketplace UI helpers (Milestone 3)
 * Provider-agnostic status + package rendering for mockups and future app shell.
 */
(function (global) {
  "use strict";

  const STATUS_META = {
    not_started: { label: "Not Started", tone: "neutral" },
    instructions_viewed: { label: "Instructions Viewed", tone: "neutral" },
    pending_scl_acceptance: { label: "Pending SCL Acceptance", tone: "pending" },
    pending_scl_link_import: { label: "Pending SCL Link Import", tone: "pending" },
    links_received: { label: "Links Received", tone: "info" },
    packages_imported: { label: "Packages Imported", tone: "info" },
    live: { label: "Live", tone: "live" },
    needs_action: { label: "Needs Action", tone: "danger" },
    disabled: { label: "Disabled", tone: "disabled" },
    draft: { label: "Draft", tone: "neutral" },
  };

  const PROVIDER_LABEL = {
    winible: "Winible",
    whop: "Whop",
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusMeta(status) {
    return STATUS_META[status] || { label: status || "Unknown", tone: "neutral" };
  }

  function statusChipHtml(status, opts) {
    const meta = statusMeta(status);
    const label = (opts && opts.label) || meta.label;
    return `<span class="scl-status scl-status--${esc(meta.tone)}">${esc(label)}</span>`;
  }

  function providerBadgeHtml(provider) {
    const key = String(provider || "").toLowerCase();
    const label = PROVIDER_LABEL[key] || provider || "Provider";
    return `<span class="scl-provider scl-provider--${esc(key)}">${esc(label)}</span>`;
  }

  /**
   * Public / capper read-only package card.
   * CTA always uses SCL tracking URL — never the provider destination.
   */
  function packageCardHtml(pkg, opts) {
    const o = opts || {};
    const mode = o.mode || "public"; // public | capper | admin
    const name = pkg.name || "Untitled package";
    const desc = pkg.description || "";
    const price = pkg.priceLabel || "";
    const provider = pkg.provider || "";
    const status = pkg.status || "draft";
    const trackingUrl = pkg.sclTrackingUrl || pkg.trackingUrl || "#";
    const clicks = pkg.clicks;
    const adminClass = mode === "admin" ? " scl-package-card--admin" : "";

    const metaBits = [providerBadgeHtml(provider)];
    if (mode !== "public") metaBits.push(statusChipHtml(status));

    let footer = "";
    if (mode === "admin") {
      footer = `
        <div class="scl-package-card__footer">
          <div>
            <div class="scl-package-card__url">${esc(trackingUrl)}</div>
            ${typeof clicks === "number" ? `<div class="scl-clicks">${esc(clicks)} clicks</div>` : ""}
          </div>
          <div class="scl-btn-row">
            <button type="button" class="scl-btn scl-btn--secondary scl-btn--sm" data-action="edit-package" data-id="${esc(pkg.id || "")}">Edit</button>
            <button type="button" class="scl-btn scl-btn--ghost scl-btn--sm" data-action="copy-tracking" data-url="${esc(trackingUrl)}">Copy tracking</button>
          </div>
        </div>`;
    } else if (status === "live" || mode === "public") {
      footer = `
        <div class="scl-package-card__footer">
          ${price ? `<p class="scl-package-card__price">${esc(price)}</p>` : "<span></span>"}
          <a class="scl-btn scl-btn--primary scl-btn--sm" href="${esc(trackingUrl)}" rel="noopener noreferrer">
            View package
          </a>
        </div>`;
    } else {
      footer = `
        <div class="scl-package-card__footer">
          ${price ? `<p class="scl-package-card__price">${esc(price)}</p>` : "<span></span>"}
          <span class="scl-hint">Not live on profile yet</span>
        </div>`;
    }

    return `
      <article class="scl-package-card${adminClass}" data-package-id="${esc(pkg.id || "")}">
        <div class="scl-package-card__meta">${metaBits.join("")}</div>
        <h3 class="scl-package-card__name">${esc(name)}</h3>
        ${desc ? `<p class="scl-package-card__desc">${esc(desc)}</p>` : ""}
        ${footer}
      </article>`;
  }

  function emptyStateHtml({ title, body, actionHtml }) {
    return `
      <div class="scl-empty">
        <h3 class="scl-empty__title">${esc(title || "Nothing here yet")}</h3>
        ${body ? `<p class="scl-empty__body">${esc(body)}</p>` : ""}
        ${actionHtml || ""}
      </div>`;
  }

  /** Capper lifecycle panel — pending never uses live/green styling. */
  function statusPanelHtml(connection) {
    const c = connection || {};
    const status = c.status || "not_started";
    const provider = c.provider || "winible";
    const meta = statusMeta(status);
    const isPending =
      status === "pending_scl_acceptance" || status === "pending_scl_link_import";
    const isLive = status === "live";
    const isDanger = status === "needs_action" || status === "disabled";

    let panelMod = "";
    if (isPending) panelMod = " scl-status-panel--pending";
    else if (isLive) panelMod = " scl-status-panel--live";
    else if (isDanger) panelMod = " scl-status-panel--danger";

    const title =
      c.title ||
      (isLive
        ? `Your ${PROVIDER_LABEL[provider] || provider} store is live`
        : isPending
          ? meta.label
          : "Storefront setup");

    const body =
      c.message ||
      (provider === "whop" && status === "pending_scl_link_import"
        ? "Thanks. You’ve added SCL as an affiliate on Whop. SCL will copy your product-specific links from our Whop affiliate dashboard and publish packages on your profile. No further action is required unless we contact you."
        : provider === "winible" && status === "pending_scl_acceptance"
          ? "Thanks. Your Winible affiliate request has been submitted. SCL must accept the request in Winible, then import your package links. No further action is required right now unless we contact you."
          : isLive
            ? "Your packages are visible on your SCL profile using SCL tracking URLs."
            : "Connect a storefront so fans can purchase your packages from your SCL profile.");

    const steps = c.timeline || defaultTimeline(provider, status);
    const timelineHtml = steps
      .map((step) => {
        const cls = step.state === "done" ? "is-done" : step.state === "current" ? "is-current" : "";
        return `<li class="${cls}"><span class="scl-timeline__dot" aria-hidden="true"></span><span>${esc(step.label)}</span></li>`;
      })
      .join("");

    return `
      <section class="scl-status-panel${panelMod}">
        <div class="scl-status-panel__top">
          ${statusChipHtml(status)}
          ${providerBadgeHtml(provider)}
        </div>
        <h2 class="scl-status-panel__title">${esc(title)}</h2>
        <p class="scl-status-panel__body">${esc(body)}</p>
        <ol class="scl-timeline">${timelineHtml}</ol>
      </section>`;
  }

  function defaultTimeline(provider, status) {
    if (provider === "whop") {
      const map = {
        not_started: ["current", "todo", "todo", "todo"],
        instructions_viewed: ["done", "current", "todo", "todo"],
        pending_scl_link_import: ["done", "done", "current", "todo"],
        links_received: ["done", "done", "done", "current"],
        packages_imported: ["done", "done", "done", "current"],
        live: ["done", "done", "done", "done"],
      };
      const states = map[status] || ["todo", "todo", "todo", "todo"];
      return [
        { label: "Choose Whop and review affiliate model", state: states[0] },
        { label: "Add Sports Cappers Leaderboard as an affiliate", state: states[1] },
        { label: "SCL copies product-specific links from Whop dashboard", state: states[2] },
        { label: "Packages go live on your SCL profile", state: states[3] },
      ];
    }

    const map = {
      not_started: ["current", "todo", "todo", "todo"],
      instructions_viewed: ["done", "current", "todo", "todo"],
      pending_scl_acceptance: ["done", "done", "current", "todo"],
      links_received: ["done", "done", "done", "current"],
      packages_imported: ["done", "done", "done", "current"],
      live: ["done", "done", "done", "done"],
    };
    const states = map[status] || ["todo", "todo", "todo", "todo"];
    return [
      { label: "Choose Winible and review affiliate model", state: states[0] },
      { label: "Submit affiliate invite in Winible", state: states[1] },
      { label: "SCL accepts invite and imports package links", state: states[2] },
      { label: "Packages go live on your SCL profile", state: states[3] },
    ];
  }

  function stepperHtml(steps, activeIndex) {
    return `
      <nav class="scl-stepper" aria-label="Setup progress">
        ${steps
          .map((label, i) => {
            const cls = i < activeIndex ? "is-done" : i === activeIndex ? "is-active" : "";
            return `<div class="scl-stepper__item ${cls}"><span class="scl-stepper__num">${i + 1}</span><span>${esc(label)}</span></div>`;
          })
          .join("")}
      </nav>`;
  }

  function queueRowHtml(row) {
    const r = row || {};
    return `
      <tr data-request-id="${esc(r.id || "")}">
        <td class="scl-table__capper">${esc(r.capperName || "—")}</td>
        <td>${providerBadgeHtml(r.provider)}</td>
        <td>${statusChipHtml(r.status)}</td>
        <td>${esc(r.submittedAt || "—")}</td>
        <td>${statusChipHtml(r.packageImportStatus || "not_started", {
          label: importLabel(r.packageImportStatus),
        })}</td>
        <td>${esc(r.adminNotes || "")}</td>
        <td>
          <div class="scl-table__actions">
            <button type="button" class="scl-btn scl-btn--secondary scl-btn--sm" data-action="open-request">Open</button>
            <button type="button" class="scl-btn scl-btn--ghost scl-btn--sm" data-action="open-packages">Packages</button>
          </div>
        </td>
      </tr>`;
  }

  function importLabel(status) {
    const map = {
      not_started: "Not Started",
      links_received: "Links Received",
      imported: "Imported",
      live: "Live",
    };
    return map[status] || statusMeta(status).label;
  }

  function checklistHtml(provider) {
    const items =
      provider === "whop"
        ? [
            "Capper confirmed SCL added as Whop affiliate",
            "Product-specific links visible in Whop affiliate dashboard",
            "Recurring commission confirmed (not first payment only)",
            "Package objects created with destination URLs",
            "SCL tracking URLs generated",
            "Packages marked Live on profile",
          ]
        : [
            "Winible affiliate invite email received",
            "Affiliate relationship accepted in Winible",
            "Package-level affiliate links available",
            "Package objects created with destination URLs",
            "SCL tracking URLs generated",
            "Packages marked Live on profile",
          ];

    return `
      <ul class="scl-checklist">
        ${items
          .map(
            (label, i) => `
          <li>
            <input type="checkbox" id="chk-${provider}-${i}" />
            <label for="chk-${provider}-${i}">${esc(label)}</label>
          </li>`
          )
          .join("")}
      </ul>`;
  }

  const COPY = {
    affiliateModel: {
      title: "Why SCL uses an affiliate model",
      body: [
        "Sports Cappers Leaderboard is free for creators. Rather than charging monthly platform fees, SCL is supported through affiliate relationships with approved third-party storefront platforms.",
        "When you connect your storefront, you designate Sports Cappers Leaderboard as an affiliate partner. SCL only receives compensation when a transaction is attributed to SCL under that platform’s affiliate program.",
        "Attribution rules, cookies, windows, and recurring commission policies are controlled by the third-party platform—not by SCL.",
      ],
    },
    winibleAck:
      "I understand that connecting my Winible store to SCL requires designating Sports Cappers Leaderboard as an affiliate partner in Winible. I understand that Winible controls its own affiliate attribution and commission rules, and that SCL will use the affiliate links provided by Winible on my SCL profile and package pages.",
    whopAck:
      "I understand that connecting my Whop store to SCL requires adding Sports Cappers Leaderboard (scleaderboard@gmail.com) as an affiliate on Whop. I understand that Whop controls its own affiliate attribution and commission rules, and that SCL will use product-specific affiliate links from our Whop dashboard on my SCL profile and package pages.",
  };

  global.SCLUI = {
    STATUS_META,
    PROVIDER_LABEL,
    COPY,
    esc,
    statusMeta,
    statusChipHtml,
    providerBadgeHtml,
    packageCardHtml,
    emptyStateHtml,
    statusPanelHtml,
    stepperHtml,
    queueRowHtml,
    checklistHtml,
    defaultTimeline,
  };
})(typeof window !== "undefined" ? window : globalThis);
