import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Area } from "react-easy-crop";
import { MediaUploader } from "../../src/manage/MediaUploader";

type CropperProps = {
  onCropComplete?: (a: Area, p: Area) => void;
};

let lastCropperProps: CropperProps | null = null;

vi.mock("react-easy-crop", () => ({
  default: (props: CropperProps) => {
    lastCropperProps = props;
    return <div data-testid="mock-cropper" />;
  },
}));

vi.mock("../../src/manage/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/manage/api")>(
      "../../src/manage/api",
    );
  return {
    ...actual,
    uploadMedia: vi.fn(),
  };
});

import { uploadMedia } from "../../src/manage/api";

describe("MediaUploader", () => {
  it("renders drop zone initially", () => {
    render(<MediaUploader onUploaded={vi.fn()} />);
    expect(
      screen.getByText(/Drop image here or click to select/i),
    ).toBeInTheDocument();
  });

  it("rejects files with unsupported type", async () => {
    render(<MediaUploader onUploaded={vi.fn()} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();

    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Unsupported file type/i)).toBeInTheDocument();
    });
  });

  it("rejects files larger than 10 MB", async () => {
    render(<MediaUploader onUploaded={vi.fn()} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();

    const bigData = new Uint8Array(11 * 1024 * 1024);
    const file = new File([bigData], "big.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/File too large/i)).toBeInTheDocument();
    });
  });

  it("uploads the cropped image as image/webp", async () => {
    global.FileReader = class {
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({
              target: { result: "data:image/jpeg;base64,abc" },
            } as ProgressEvent<FileReader>);
          }
        }, 0);
      }
    } as unknown as typeof FileReader;

    HTMLCanvasElement.prototype.getContext = vi.fn(
      () =>
        ({
          drawImage: vi.fn(),
        }) as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const toBlobSpy = vi.fn(
      (cb: BlobCallback, mimeType?: string, _q?: number) => {
        cb(new Blob([new Uint8Array([1, 2, 3])], { type: mimeType }));
      },
    );
    HTMLCanvasElement.prototype.toBlob =
      toBlobSpy as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const originalImage = global.Image;
    global.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    } as unknown as typeof Image;

    const uploadMock = vi
      .mocked(uploadMedia)
      .mockResolvedValue({ id: "asset-1" } as Awaited<
        ReturnType<typeof uploadMedia>
      >);

    const onUploaded = vi.fn();
    render(<MediaUploader onUploaded={onUploaded} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("mock-cropper")).toBeInTheDocument();
    });

    expect(lastCropperProps?.onCropComplete).toBeDefined();
    const pixels: Area = { x: 0, y: 0, width: 1200, height: 630 };
    lastCropperProps!.onCropComplete!(pixels, pixels);

    const uploadButton = await screen.findByRole("button", {
      name: /Upload Hero Image/i,
    });
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledOnce();
    });

    const firstCall = uploadMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [calledWith] = firstCall!;
    expect(calledWith).toBeInstanceOf(File);
    expect((calledWith as File).type).toBe("image/webp");
    expect(toBlobSpy).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.85,
    );
    expect(onUploaded).toHaveBeenCalledWith({ id: "asset-1" });

    global.Image = originalImage;
  });

  it("accepts valid JPEG file and shows cropper", async () => {
    global.FileReader = class {
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({
              target: { result: "data:image/jpeg;base64,abc" },
            } as ProgressEvent<FileReader>);
          }
        }, 0);
      }
    } as unknown as typeof FileReader;

    render(<MediaUploader onUploaded={vi.fn()} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("mock-cropper")).toBeInTheDocument();
    });
  });
});
