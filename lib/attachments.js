/**
 * Chat attachments — what may be sent, how it is described, and the upload
 * handshake. Shared by the dashboard messages, the in-class chat and the
 * Convex mutations that store them, so the rules are stated once.
 */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Images plus the everyday documents a lesson actually needs. */
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
];

/** `accept` attribute for the file pickers. */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(",");

export function isAllowedAttachment(type) {
  return ALLOWED_ATTACHMENT_TYPES.includes(type);
}

export function isImageAttachment(type) {
  return typeof type === "string" && type.startsWith("image/");
}

export function fmtBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Pre-flight before uploading. Returns an error message, or null when fine. */
export function checkAttachment(file) {
  if (!file) return "No file selected.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `Files must be under ${fmtBytes(MAX_ATTACHMENT_BYTES)}.`;
  }
  if (!isAllowedAttachment(file.type)) {
    return "That file type isn't supported. Send an image, PDF, Office document, text or audio file.";
  }
  return null;
}

/**
 * Upload to Convex storage and return the fields the send mutations expect.
 * `generateUploadUrl` is the `api.files.generateChatUploadUrl` mutation.
 */
export async function uploadAttachment(generateUploadUrl, file) {
  const url = await generateUploadUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) throw new Error("Upload failed");
  const { storageId } = await response.json();
  return {
    attachmentId: storageId,
    attachmentName: file.name.slice(0, 200),
    attachmentType: file.type,
    attachmentSize: file.size,
  };
}
