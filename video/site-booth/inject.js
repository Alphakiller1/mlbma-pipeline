/*
 * Runs inside every site page the booth proxies. It only keeps the page on stage:
 * links that would leave the site, or open a new tab, stay in the stage frame instead.
 * Everything else (hotkeys, markers, spotlight) is done by the booth from outside,
 * which it can because the page is same-origin.
 */
(() => {
  if (window.top === window) return; // opened directly, not on stage: behave like the site
  const home = location.origin;
  const tell = (msg) => window.top.postMessage({ booth: true, ...msg }, home);
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented) return;
      const url = new URL(a.href, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.origin !== home) {
        e.preventDefault();
        tell({ type: "external", href: url.href });
      } else if (a.target && a.target !== "_self") {
        e.preventDefault();
        location.href = url.href;
      }
    },
    true,
  );
  const open = window.open;
  window.open = (href, ...rest) => {
    try {
      const url = new URL(href, location.href);
      if (url.origin === home) {
        location.href = url.href;
        return window;
      }
      tell({ type: "external", href: url.href });
      return null;
    } catch {
      return open.call(window, href, ...rest);
    }
  };
})();
