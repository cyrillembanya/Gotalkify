"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Direct-to-storage uploads for photos and intro videos.
 *
 * Files go straight from the browser to Convex storage. The upload starts the
 * moment a file is picked (not when the form is submitted), reports progress,
 * and retries transient failures with a fresh upload URL, so a 60 MB intro
 * video is normally already stored by the time the tutor presses Save.
 */

const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 800;

/** Longest edge and JPEG quality a profile photo is reduced to before upload. */
const PHOTO_MAX_EDGE = 1200;
const PHOTO_QUALITY = 0.86;
/** A JPEG/WebP already this small and small enough in pixels is sent as-is. */
const PHOTO_KEEP_BYTES = 400 * 1024;

export class UploadError extends Error {
  constructor(message, { retryable = false, status } = {}) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
    this.status = status;
  }
}

function isAbort(error) {
  return error?.name === "AbortError";
}

/** One POST of `file` to `url`, resolving to the new storage id. */
function postOnce(url, file, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { storageId } = JSON.parse(xhr.responseText);
          if (!storageId) throw new Error("no storageId");
          resolve(storageId);
        } catch {
          reject(new UploadError("Storage returned an unexpected response", { retryable: true }));
        }
        return;
      }
      reject(
        new UploadError(`Upload failed (${xhr.status})`, {
          status: xhr.status,
          // 5xx and 408/429 are worth another go; other 4xx will not change.
          retryable: xhr.status >= 500 || xhr.status === 408 || xhr.status === 429,
        })
      );
    };
    xhr.onerror = () => reject(new UploadError("Network error during upload", { retryable: true }));
    xhr.ontimeout = () => reject(new UploadError("Upload timed out", { retryable: true }));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Upload cancelled", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Upload cancelled", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Upload `file` to Convex storage and resolve to its storage id.
 * `generateUploadUrl` is a Convex mutation returning a fresh upload URL — a
 * new one is requested for every attempt, so retries never reuse a URL that
 * may already have been consumed or expired.
 */
export async function uploadToStorage(generateUploadUrl, file, { onProgress, signal } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const url = await generateUploadUrl();
      return await postOnce(url, file, { onProgress, signal });
    } catch (error) {
      if (isAbort(error)) throw error;
      lastError = error;
      const retryable = error instanceof UploadError ? error.retryable : true;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      onProgress?.(0);
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1), signal);
    }
  }
  throw lastError ?? new UploadError("Upload failed");
}

/**
 * Shrink a profile photo before it leaves the device: phones produce 5–12 MB
 * images, of which a 1200 px JPEG (~150 KB) is all a profile card ever shows.
 * Anything the browser cannot decode (HEIC outside Safari, for instance) is
 * returned untouched rather than rejected.
 */
export async function shrinkImage(
  file,
  { maxEdge = PHOTO_MAX_EDGE, quality = PHOTO_QUALITY } = {}
) {
  if (!file?.type?.startsWith("image/") || file.type === "image/gif") return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap;
  try {
    // "from-image" applies the EXIF rotation so portrait phone photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const alreadyCompact =
      scale === 1 &&
      file.size <= PHOTO_KEEP_BYTES &&
      (file.type === "image/jpeg" || file.type === "image/webp");
    if (alreadyCompact) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Flatten transparency onto white — JPEG has no alpha channel.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

/**
 * React hook: an upload slot that begins transferring as soon as `select(file)`
 * is called and can be awaited later with `result()`.
 *
 *   const photo = useUpload(generateUploadUrl, { prepare: shrinkImage });
 *   <input onChange={(e) => photo.select(e.target.files?.[0])} />
 *   …
 *   const photoStorageId = await photo.result(); // resolves at once if done
 *
 * Selecting a new file cancels the one in flight. The state object exposes
 * `file`, `status` (idle | preparing | uploading | done | error), `progress`
 * (0–1), `error` and `storageId` for rendering a progress bar.
 */
export function useUpload(generateUploadUrl, { prepare } = {}) {
  const [state, setState] = useState(idleState);
  const inflight = useRef(null); // { file, controller, promise }
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const generateRef = useRef(generateUploadUrl);
  generateRef.current = generateUploadUrl;

  const cancel = useCallback(() => {
    inflight.current?.controller.abort();
    inflight.current = null;
  }, []);

  const start = useCallback(
    (file) => {
      cancel();
      if (!file) {
        setState(idleState());
        return;
      }
      const controller = new AbortController();
      const { signal } = controller;
      const update = (patch) => {
        if (!signal.aborted) setState((s) => ({ ...s, ...patch }));
      };
      setState({ file, status: "preparing", progress: 0, error: null, storageId: null });

      const promise = (async () => {
        const prepared = prepareRef.current ? await prepareRef.current(file) : file;
        if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
        update({ file: prepared, status: "uploading" });
        const storageId = await uploadToStorage(generateRef.current, prepared, {
          signal,
          onProgress: (progress) => update({ progress }),
        });
        update({ status: "done", progress: 1, storageId });
        return storageId;
      })();
      // Failures surface through `result()` and the state; nothing is unhandled.
      promise.catch((error) => {
        if (!isAbort(error)) update({ status: "error", error: messageOf(error) });
      });
      inflight.current = { file, controller, promise };
    },
    [cancel]
  );

  /** Pick a file (or `null` to clear). Starts uploading immediately. */
  const select = useCallback((file) => start(file ?? null), [start]);

  /** Re-run the last selection after a failure. */
  const retry = useCallback(() => {
    if (inflight.current?.file) start(inflight.current.file);
  }, [start]);

  /** Clear the slot, cancelling any transfer in progress. */
  const reset = useCallback(() => {
    cancel();
    setState(idleState());
  }, [cancel]);

  /**
   * Wait for the current upload and return its storage id. Resolves `null`
   * when nothing is selected; rejects with the upload error on failure.
   */
  const result = useCallback(async () => {
    const current = inflight.current;
    if (!current) return null;
    try {
      return await current.promise;
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return { ...state, select, retry, reset, result, cancel };
}

function idleState() {
  return { file: null, status: "idle", progress: 0, error: null, storageId: null };
}

function messageOf(error) {
  return String(error?.message ?? error ?? "Upload failed").replace(/^Uncaught Error:\s*/, "");
}
