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

// JSDOM doesn't implement PointerEvent or pointer capture; the resizable
// sidebar handles use them. Provide minimal polyfills so fireEvent.pointerDown
// reaches React handlers and setPointerCapture is a no-op.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.pointerId = (props as { pointerId?: number }).pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}
if (typeof Element !== "undefined") {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
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
