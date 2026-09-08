/**
 * SCL Marketplace local data layer (Milestone 3 wiring)
 * localStorage-backed so capper → admin → profile → /go stays in sync in the browser.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "scl_m3_store_v1";

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  function trackingCode() {
    return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatTs(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function seed() {
    const cappers = [
      {
        id: "cap_edgelock",
        slug: "edgelock",
        name: "EdgeLock Analytics",
        sports: "MLB · NBA",
        record: "142-118",
        units: "+38.4",
        roi: "8.2%",
        streak: "W4",
        initials: "EL",
      },
      {
        id: "cap_northside",
        slug: "northside",
        name: "Northside Plays",
        sports: "NFL · NBA",
        record: "88-76",
        units: "+12.1",
        roi: "4.6%",
        streak: "L1",
        initials: "NP",
      },
      {
        id: "cap_unitlab",
        slug: "unitlab",
        name: "Unit Lab",
        sports: "MLB",
        record: "201-174",
        units: "+51.0",
        roi: "9.1%",
        streak: "W2",
        initials: "UL",
      },
    ];

    const storeConnections = [
      {
        id: "sc_unitlab_winible",
        capperId: "cap_unitlab",
        provider: "winible",
        status: "live",
        packageImportStatus: "live",
        submittedAt: "2026-07-10T13:18:00.000Z",
        adminNotes: "3 packages migrated",
        acknowledgmentAt: "2026-07-10T13:10:00.000Z",
        updatedAt: "2026-07-10T15:00:00.000Z",
      },
    ];

    const packages = [
      {
        id: "pkg_ul_1",
        capperId: "cap_unitlab",
        storeConnectionId: "sc_unitlab_winible",
        provider: "winible",
        name: "All Access",
        description: "Full slate cards and Discord alerts.",
        priceLabel: "$129 / month",
        providerDestinationUrl: "https://example.com/winible/unitlab-all",
        sclTrackingCode: "ulall01",
        status: "live",
        clicks: 184,
        createdAt: "2026-07-10T14:00:00.000Z",
        updatedAt: "2026-07-10T14:00:00.000Z",
      },
      {
        id: "pkg_ul_2",
        capperId: "cap_unitlab",
        storeConnectionId: "sc_unitlab_winible",
        provider: "winible",
        name: "MLB Only",
        description: "Baseball package via Winible affiliate link.",
        priceLabel: "$79 / month",
        providerDestinationUrl: "https://example.com/winible/unitlab-mlb",
        sclTrackingCode: "ulmlb02",
        status: "live",
        clicks: 62,
        createdAt: "2026-07-10T14:05:00.000Z",
        updatedAt: "2026-07-10T14:05:00.000Z",
      },
    ];

    return {
      version: 1,
      session: { role: "capper", capperId: "cap_edgelock" },
      cappers,
      storeConnections,
      packages,
      clicks: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const data = seed();
        save(data);
        return data;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.cappers) {
        const data = seed();
        save(data);
        return data;
      }
      return parsed;
    } catch (_) {
      const data = seed();
      save(data);
      return data;
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function mutate(fn) {
    const data = load();
    const result = fn(data);
    save(data);
    return result;
  }

  function getCapper(idOrSlug) {
    const data = load();
    return (
      data.cappers.find((c) => c.id === idOrSlug || c.slug === idOrSlug) || null
    );
  }

  function listCappers() {
    return load().cappers.slice();
  }

  function getSession() {
    return { ...load().session };
  }

  function setSession(patch) {
    return mutate((data) => {
      data.session = { ...data.session, ...patch };
      return data.session;
    });
  }

  function connectionsForCapper(capperId) {
    return load().storeConnections.filter((s) => s.capperId === capperId);
  }

  function getConnection(id) {
    return load().storeConnections.find((s) => s.id === id) || null;
  }

  function activeConnection(capperId, provider) {
    const list = connectionsForCapper(capperId);
    if (provider) return list.find((s) => s.provider === provider) || null;
    return list[0] || null;
  }

  function upsertConnection({ capperId, provider, status, acknowledgmentAt }) {
    return mutate((data) => {
      let conn = data.storeConnections.find(
        (s) => s.capperId === capperId && s.provider === provider
      );
      if (!conn) {
        conn = {
          id: uid("sc"),
          capperId,
          provider,
          status: status || "not_started",
          packageImportStatus: "not_started",
          submittedAt: null,
          adminNotes: "",
          acknowledgmentAt: null,
          updatedAt: nowIso(),
        };
        data.storeConnections.push(conn);
      }
      if (status) conn.status = status;
      if (acknowledgmentAt) conn.acknowledgmentAt = acknowledgmentAt;
      if (
        status === "pending_scl_acceptance" ||
        status === "pending_scl_link_import"
      ) {
        conn.submittedAt = conn.submittedAt || nowIso();
      }
      conn.updatedAt = nowIso();
      return { ...conn };
    });
  }

  function updateConnection(id, patch) {
    return mutate((data) => {
      const conn = data.storeConnections.find((s) => s.id === id);
      if (!conn) return null;
      Object.assign(conn, patch, { updatedAt: nowIso() });
      return { ...conn };
    });
  }

  function listStoreRequests(filters) {
    const data = load();
    const f = filters || {};
    return data.storeConnections
      .map((conn) => {
        const capper = data.cappers.find((c) => c.id === conn.capperId);
        return {
          ...conn,
          capperName: capper ? capper.name : "Unknown",
          capperSlug: capper ? capper.slug : "",
          submittedAtLabel: formatTs(conn.submittedAt),
        };
      })
      .filter((row) => {
        if (f.provider && f.provider !== "all" && row.provider !== f.provider) return false;
        if (f.pendingOnly && !String(row.status).startsWith("pending_")) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.submittedAt ? Date.parse(a.submittedAt) : 0;
        const tb = b.submittedAt ? Date.parse(b.submittedAt) : 0;
        return ta - tb;
      });
  }

  function packagesForCapper(capperId, opts) {
    const o = opts || {};
    return load()
      .packages.filter((p) => {
        if (p.capperId !== capperId) return false;
        if (o.liveOnly && p.status !== "live") return false;
        return true;
      })
      .map(enrichPackage);
  }

  function getPackage(id) {
    const pkg = load().packages.find((p) => p.id === id);
    return pkg ? enrichPackage(pkg) : null;
  }

  function enrichPackage(pkg) {
    return {
      ...pkg,
      sclTrackingUrl: trackingUrlFor(pkg.sclTrackingCode),
      clicks: pkg.clicks || 0,
    };
  }

  function trackingUrlFor(code) {
    // Relative to /scl/app/*
    return `go.html?c=${encodeURIComponent(code)}`;
  }

  function savePackage(input) {
    return mutate((data) => {
      let pkg = input.id ? data.packages.find((p) => p.id === input.id) : null;
      if (!pkg) {
        pkg = {
          id: uid("pkg"),
          capperId: input.capperId,
          storeConnectionId: input.storeConnectionId || null,
          provider: input.provider,
          name: input.name || "Untitled package",
          description: input.description || "",
          priceLabel: input.priceLabel || "",
          providerDestinationUrl: input.providerDestinationUrl || "",
          sclTrackingCode: trackingCode(),
          status: input.status || "draft",
          clicks: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        data.packages.push(pkg);
      } else {
        Object.assign(pkg, {
          name: input.name != null ? input.name : pkg.name,
          description: input.description != null ? input.description : pkg.description,
          priceLabel: input.priceLabel != null ? input.priceLabel : pkg.priceLabel,
          providerDestinationUrl:
            input.providerDestinationUrl != null
              ? input.providerDestinationUrl
              : pkg.providerDestinationUrl,
          status: input.status != null ? input.status : pkg.status,
          provider: input.provider != null ? input.provider : pkg.provider,
          updatedAt: nowIso(),
        });
      }

      if (input.storeConnectionId) pkg.storeConnectionId = input.storeConnectionId;

      // Keep connection import status in sync when publishing
      if (pkg.storeConnectionId) {
        const conn = data.storeConnections.find((s) => s.id === pkg.storeConnectionId);
        if (conn) {
          const liveCount = data.packages.filter(
            (p) => p.storeConnectionId === conn.id && p.status === "live"
          ).length;
          if (liveCount > 0) {
            conn.packageImportStatus = "live";
            if (conn.status !== "disabled" && conn.status !== "needs_action") {
              conn.status = "live";
            }
          } else if (pkg.status === "draft" || pkg.status === "live") {
            conn.packageImportStatus = "imported";
            if (
              conn.status === "pending_scl_acceptance" ||
              conn.status === "pending_scl_link_import" ||
              conn.status === "links_received"
            ) {
              conn.status = "packages_imported";
            }
          }
          conn.updatedAt = nowIso();
        }
      }

      return enrichPackage(pkg);
    });
  }

  function markLinksReceived(connectionId) {
    return updateConnection(connectionId, {
      status: "links_received",
      packageImportStatus: "links_received",
    });
  }

  function markNeedsAction(connectionId, notes) {
    return updateConnection(connectionId, {
      status: "needs_action",
      adminNotes: notes || "",
    });
  }

  function recordClick(code, meta) {
    return mutate((data) => {
      const pkg = data.packages.find((p) => p.sclTrackingCode === code);
      if (!pkg) return { ok: false, reason: "not_found" };
      if (pkg.status !== "live") return { ok: false, reason: "not_live", package: enrichPackage(pkg) };

      pkg.clicks = (pkg.clicks || 0) + 1;
      const click = {
        id: uid("clk"),
        packageId: pkg.id,
        trackingCode: code,
        clickedAt: nowIso(),
        referrer: (meta && meta.referrer) || "",
        userAgent: (meta && meta.userAgent) || "",
      };
      data.clicks.push(click);
      return {
        ok: true,
        package: enrichPackage(pkg),
        destinationUrl: pkg.providerDestinationUrl,
        click,
      };
    });
  }

  function clickStats() {
    const data = load();
    return {
      total: data.clicks.length,
      byPackage: data.packages.map((p) => ({
        id: p.id,
        name: p.name,
        clicks: p.clicks || 0,
        code: p.sclTrackingCode,
      })),
    };
  }

  function resetDemo() {
    const data = seed();
    save(data);
    return data;
  }

  function submitCapperStore({ capperId, provider, acknowledgment }) {
    if (!acknowledgment) throw new Error("Acknowledgment required");
    if (provider !== "winible" && provider !== "whop") {
      throw new Error("Unsupported provider");
    }
    const status =
      provider === "whop" ? "pending_scl_link_import" : "pending_scl_acceptance";
    return upsertConnection({
      capperId,
      provider,
      status,
      acknowledgmentAt: nowIso(),
    });
  }

  global.SCLStore = {
    STORAGE_KEY,
    load,
    resetDemo,
    formatTs,
    getCapper,
    listCappers,
    getSession,
    setSession,
    connectionsForCapper,
    getConnection,
    activeConnection,
    upsertConnection,
    updateConnection,
    listStoreRequests,
    packagesForCapper,
    getPackage,
    savePackage,
    markLinksReceived,
    markNeedsAction,
    recordClick,
    clickStats,
    submitCapperStore,
    trackingUrlFor,
  };
})(typeof window !== "undefined" ? window : globalThis);
