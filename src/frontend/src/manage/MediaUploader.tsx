import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { uploadMedia } from "./api";
import type { MediaAssetRead } from "./types";
import styles from "./MediaUploader.module.css";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const ASPECT = 1200 / 630;

type Props = {
  onUploaded: (asset: MediaAssetRead) => void;
  onCancel?: () => void;
};

async function getCroppedBlob(
  imageSrc: string,
  croppedArea: Area,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = croppedArea.width;
  canvas.height = croppedArea.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(
    image,
    croppedArea.x,
    croppedArea.y,
    croppedArea.width,
    croppedArea.height,
    0,
    0,
    croppedArea.width,
    croppedArea.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/webp",
      0.85,
    );
  });
}

export function MediaUploader({ onUploaded, onCancel }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setFileError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError(
        `Unsupported file type: ${file.type}. Accepted: JPEG, PNG, WebP.`,
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError(
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 10 MB.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleUpload() {
    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const file = new File([blob], "hero.webp", { type: "image/webp" });
      const asset = await uploadMedia(file);
      onUploaded(asset);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {!imageSrc ? (
        <div
          className={styles.dropzone}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          aria-label="Drop image here or click to select"
        >
          <p className={styles.dropzoneText}>
            Drop image here or click to select
          </p>
          <p className={styles.dropzoneHint}>JPEG, PNG, or WebP — max 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className={styles.hiddenInput}
            onChange={handleInputChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      ) : (
        <div className={styles.cropArea}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>
      )}

      {fileError && <p className={styles.error}>{fileError}</p>}
      {uploadError && <p className={styles.error}>{uploadError}</p>}

      {imageSrc && (
        <div className={styles.controls}>
          <label className={styles.zoomLabel}>
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className={styles.zoomSlider}
              aria-label="Zoom"
            />
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => {
                setImageSrc(null);
                if (onCancel) onCancel();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => void handleUpload()}
              disabled={uploading || !croppedAreaPixels}
            >
              {uploading ? "Uploading…" : "Upload Hero Image"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
