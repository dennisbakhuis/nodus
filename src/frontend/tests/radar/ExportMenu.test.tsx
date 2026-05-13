import { useRef, type RefObject } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EXPORT_VIEWBOX_BOTTOM_PAD,
  ExportMenu,
  addNodusWatermark,
  inlineComputedStyles,
  prepareExportSvg,
  radarSvgString,
} from "../../src/radar/ExportMenu";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";

// jsdom can't actually rasterize SVG (no real <canvas> 2D context, no Image
// loading) → mock the rasterizer so we can assert the download path receives
// a PNG data URL without exercising the real canvas pipeline.
const svgToPngSpy = vi.fn().mockResolvedValue("data:image/png;base64,STUB");
vi.mock("../../src/radar/svgRaster", () => ({
  svgToPngDataUrl: (...args: unknown[]) => svgToPngSpy(...args),
}));

const savedPdfNames: string[] = [];
vi.mock("jspdf", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        save: (n: string) => {
          savedPdfNames.push(n);
        },
      };
    }),
  };
});

const svg2pdfSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("svg2pdf.js", () => ({ svg2pdf: (...args: unknown[]) => svg2pdfSpy(...args) }));

function ExportHarness() {
  // The ref is wired through to ExportMenu; jsdom's <svg> is enough for the
  // SVG and PDF code paths to exercise the cloning + svg2pdf calls.
  const ref = useRef<SVGSVGElement>(null);
  return (
    <div>
      <svg
        ref={ref}
        data-testid="harness-svg"
        viewBox="0 0 100 50"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="0" y="0" width="100" height="50" fill="red" />
      </svg>
      <ExportMenu
        svgRef={ref as RefObject<SVGSVGElement | null>}
        data={mockSmallRadarData}
      />
    </div>
  );
}

describe("ExportMenu", () => {
  beforeEach(() => {
    savedPdfNames.length = 0;
    svg2pdfSpy.mockClear();
    // jsdom doesn't implement createObjectURL — stub it.
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:stub");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dropdown is closed by default and exposes the toggle button", () => {
    render(<ExportHarness />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
  });

  it("clicking the toggle reveals exactly three menu items: SVG, PNG, PDF", async () => {
    const user = userEvent.setup();
    render(<ExportHarness />);
    await user.click(screen.getByRole("button", { name: /export/i }));

    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/svg/i);
    expect(items[0]).toHaveTextContent(/vector/i);
    expect(items[1]).toHaveTextContent(/png/i);
    expect(items[2]).toHaveTextContent(/pdf/i);
    expect(items[2]).toHaveTextContent(/vector/i);
  });

  it("clicking outside closes the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ExportHarness />
        <button data-testid="outside">elsewhere</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("Escape closes the dropdown", async () => {
    const user = userEvent.setup();
    render(<ExportHarness />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("SVG export downloads an image/svg+xml Blob carrying the live SVG markup", async () => {
    const user = userEvent.setup();
    render(<ExportHarness />);
    const blobs: Blob[] = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:stub";
    });

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /svg/i }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    const blob = blobs[0]!;
    expect(blob.type).toMatch(/^image\/svg\+xml/);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toContain("<?xml");
    expect(text).toContain("<svg");
    expect(text).toContain('data-testid="harness-svg"');
    // Watermark survived the round-trip.
    expect(text).toContain("Nodus");
    expect(text).toContain('data-watermark="nodus"');

    URL.createObjectURL = origCreate;
  });

  it("PDF export drives svg2pdf with the live SVG and saves a .pdf file", async () => {
    const user = userEvent.setup();
    render(<ExportHarness />);

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /pdf/i }));

    await waitFor(() => expect(svg2pdfSpy).toHaveBeenCalledTimes(1));
    const call = svg2pdfSpy.mock.calls[0]!;
    const [svgArg, , opts] = call;
    expect(svgArg).toBeInstanceOf(SVGSVGElement);
    expect(opts).toMatchObject({ x: 0, y: 0 });
    expect(opts.width).toBeGreaterThan(0);
    expect(opts.height).toBeGreaterThan(0);
    expect(savedPdfNames).toHaveLength(1);
    expect(savedPdfNames[0]).toMatch(/\.pdf$/);
  });

  it("PNG export rasterizes the prepared SVG and triggers a .png download", async () => {
    const user = userEvent.setup();
    svgToPngSpy.mockClear();
    const clicks: { href: string; download: string }[] = [];
    const origCreate = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === "a") {
          const a = el as HTMLAnchorElement;
          a.click = () => {
            clicks.push({ href: a.href, download: a.download });
          };
        }
        return el;
      });

    render(<ExportHarness />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    const pngItem = screen
      .getAllByRole("menuitem")
      .find((b) => (b.textContent ?? "").startsWith("PNG"));
    expect(pngItem).toBeTruthy();
    await user.click(pngItem!);

    await waitFor(() => expect(svgToPngSpy).toHaveBeenCalledTimes(1));
    const call = svgToPngSpy.mock.calls[0]!;
    const [svgArg, svgStringArg, scaleArg] = call;
    expect(svgArg).toBeInstanceOf(SVGSVGElement);
    expect(typeof svgStringArg).toBe("string");
    expect(svgStringArg).toContain("<svg");
    expect(scaleArg).toBe(2);

    await waitFor(() => expect(clicks.length).toBeGreaterThan(0));
    const png = clicks.find((c) => c.download.endsWith(".png"));
    expect(png).toBeTruthy();
    expect(png!.href).toMatch(/^data:image\/png/);

    createSpy.mockRestore();
  });
});

describe("radarSvgString", () => {
  it("wraps the SVG with an XML declaration and the SVG namespace", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    const out = radarSvgString(svg);
    expect(out.startsWith("<?xml")).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe("inlineComputedStyles", () => {
  it("copies presentation properties from src to dst", () => {
    const NS = "http://www.w3.org/2000/svg";
    const src = document.createElementNS(NS, "svg");
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "10");
    line.setAttribute("y1", "0");
    line.setAttribute("y2", "10");
    line.style.stroke = "rgb(20, 30, 40)";
    line.style.strokeWidth = "2";
    src.appendChild(line);
    document.body.appendChild(src);

    const dst = src.cloneNode(true) as SVGSVGElement;
    inlineComputedStyles(src, dst);

    const dstLine = dst.querySelector("line") as SVGElement;
    expect(dstLine.style.stroke).toContain("rgb(20, 30, 40)");
    expect(dstLine.style.strokeWidth).toMatch(/^2(px)?$/);
    src.remove();
  });
});

describe("addNodusWatermark", () => {
  it("appends a group containing the Nodus mark <image> and Nodus wordmark", () => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 200 100");
    addNodusWatermark(svg);
    const wm = svg.querySelector('[data-watermark="nodus"]');
    expect(wm).not.toBeNull();
    const image = wm?.querySelector("image");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("href")).toBe("/nodus_mark.svg");
    const text = wm?.querySelector("text");
    expect(text?.textContent).toBe("Nodus");
  });

  it("places the mark + wordmark as a 5th ring-label slot, one band-step right of Monitor", () => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1100 580");
    addNodusWatermark(svg);
    const wm = svg.querySelector('[data-watermark="nodus"]')!;
    const image = wm.querySelector("image")!;
    const text = wm.querySelector("text")!;

    // Geometry: CX=550, CY=550, R_INNER=55, R_OUTER=360, N_RINGS=4.
    // bandStep = (360 - 55) / 4 = 76.25.
    // Slot center x = CX + R_INNER + 4.5 * bandStep + markSize
    //              = 550 + 55 + 343.125 + 16 = 964.125.
    // Slot baseline y = CY + 13 = 563 (matches Invest/Pilot/Explore/Monitor labels).
    // approxTextWidth("Nodus", 8 px) = 8 * 0.55 * 5 = 22.
    expect(Number(text.getAttribute("x"))).toBe(964.125);
    expect(Number(text.getAttribute("y"))).toBe(563);
    expect(text.getAttribute("text-anchor")).toBe("middle");
    expect(Number(text.getAttribute("font-size"))).toBe(8);

    // Logo: gap 4 to the left of the wordmark, size 16.
    // markX = 964.125 - 11 - 4 - 16 = 933.125
    // markY = 563 - 0.35*8 - 8 = 552.2
    expect(Number(image.getAttribute("x"))).toBe(933.125);
    expect(Number(image.getAttribute("y"))).toBeCloseTo(552.2, 5);
    expect(Number(image.getAttribute("width"))).toBe(16);
    expect(Number(image.getAttribute("height"))).toBe(16);
  });
});

describe("prepareExportSvg", () => {
  it("preserves source lines, sets explicit width/height, and stamps a watermark", async () => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    const ringLine = document.createElementNS(NS, "line");
    ringLine.setAttribute("x1", "0");
    ringLine.setAttribute("x2", "100");
    ringLine.setAttribute("y1", "25");
    ringLine.setAttribute("y2", "25");
    ringLine.setAttribute("data-relview-baseline", "");
    ringLine.style.stroke = "rgb(11, 22, 33)"; // simulates a CSS-var-resolved color
    svg.appendChild(ringLine);
    document.body.appendChild(svg);

    const exported = await prepareExportSvg(svg);
    expect(exported.getAttribute("width")).toBe("100");
    // viewBox bottom is padded on export so the ring-label baseline +
    // watermark don't get clipped when the fit transform replays at the
    // export's 1:1 px-to-vb ratio.
    expect(exported.getAttribute("height")).toBe(
      String(50 + EXPORT_VIEWBOX_BOTTOM_PAD),
    );
    expect(exported.getAttribute("viewBox")).toBe(
      `0 0 100 ${50 + EXPORT_VIEWBOX_BOTTOM_PAD}`,
    );
    const xml = radarSvgString(exported);
    expect(xml).toContain('data-relview-baseline=""');
    expect(xml).toContain("rgb(11, 22, 33)");
    expect(xml).toContain('data-watermark="nodus"');
    svg.remove();
  });

  it("reveals the focus-mode Nodus watermark and skips the standard one", async () => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    const focusWm = document.createElementNS(NS, "g");
    focusWm.setAttribute("data-focus-watermark", "nodus");
    focusWm.setAttribute("opacity", "0");
    // Simulate what inlineComputedStyles does in real browsers — it folds
    // the live opacity="0" presentation attribute into the clone's inline
    // style, which would beat the reveal's setAttribute unless cleared.
    focusWm.style.opacity = "0";
    svg.appendChild(focusWm);
    document.body.appendChild(svg);

    const exported = await prepareExportSvg(svg);
    // No standard 5th-ring-label-slot watermark — the focus-mode placement
    // replaces it on the Pilot ring's bottom boundary.
    expect(exported.querySelector('[data-watermark="nodus"]')).toBeNull();
    const revealed = exported.querySelector<SVGGElement>(
      '[data-focus-watermark="nodus"]',
    );
    expect(revealed).not.toBeNull();
    expect(revealed?.getAttribute("opacity")).toBe("1");
    // The inline style.opacity must be cleared — otherwise the inline rule
    // would beat the new attribute and the watermark would still render at 0.
    expect(revealed?.style.opacity).toBe("");
    svg.remove();
  });

  it("skips the watermark when the SVG already shows the Nodus center logo", async () => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    const centerLogo = document.createElementNS(NS, "g");
    centerLogo.setAttribute("data-center-logo", "nodus");
    svg.appendChild(centerLogo);
    document.body.appendChild(svg);

    const exported = await prepareExportSvg(svg);
    expect(exported.querySelector('[data-watermark="nodus"]')).toBeNull();
    expect(exported.querySelector('[data-center-logo="nodus"]')).not.toBeNull();
    svg.remove();
  });

  it("converts <image href> URLs into inline data: URLs", async () => {
    const NS = "http://www.w3.org/2000/svg";
    // Bypass Response machinery — jsdom's Response.blob() round-trip is flaky.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          ({
            ok: true,
            status: 200,
            blob: async () =>
              new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
          }) as unknown as Response,
      );

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    const img = document.createElementNS(NS, "image");
    img.setAttribute("href", "/brand/logo.png");
    img.setAttribute("x", "10");
    img.setAttribute("y", "10");
    img.setAttribute("width", "20");
    img.setAttribute("height", "20");
    svg.appendChild(img);
    document.body.appendChild(svg);

    const exported = await prepareExportSvg(svg);
    const out = exported.querySelector("image") as SVGImageElement;
    expect(fetchSpy).toHaveBeenCalled();
    expect(out.getAttribute("href")).toMatch(/^data:image\/png;base64,/);
    svg.remove();
    fetchSpy.mockRestore();
  });
});
