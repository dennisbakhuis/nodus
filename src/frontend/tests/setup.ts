import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

if (typeof SVGElement !== "undefined") {
  (SVGElement.prototype as unknown as { getBBox: () => Partial<DOMRect> }).getBBox =
    () => ({ x: 0, y: 0, width: 50, height: 14 });
}

// JSDOM doesn't implement HTMLDialogElement; the shared Modal uses
// dialog.showModal() / dialog.close() so add minimal polyfills that
// flip the `open` attribute the way the spec does.
if (typeof HTMLDialogElement !== "undefined") {
  type DialogEl = HTMLDialogElement & {
    showModal: () => void;
    close: () => void;
  };
  const proto = HTMLDialogElement.prototype as unknown as DialogEl;
  if (!proto.showModal) {
    proto.showModal = function showModal(this: DialogEl) {
      this.setAttribute("open", "");
    };
  }
  if (!proto.close) {
    proto.close = function close(this: DialogEl) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
