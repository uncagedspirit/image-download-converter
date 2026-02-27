let imageUrl = "";
const preview = document.getElementById("preview");
const filenameInput = document.getElementById("filename");
const downloadBtn = document.getElementById("downloadBtn");
const formatSelect = document.getElementById("format");
const statusMsg = document.getElementById("statusMsg");

const MIME_TYPES = {
  jpg:  "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  avif: "image/avif",
  bmp:  "image/bmp",
  gif:  "image/gif",
  tiff: "image/tiff",
  ico:  "image/x-icon",
};

// ---------------------------------------------------------------------------
// Format support detection
// Browsers silently fall back to PNG when they don't support a MIME type in
// toDataURL/toBlob, so we detect support by encoding a 1×1 canvas and checking
// whether the result actually starts with the expected MIME type.
// ---------------------------------------------------------------------------
function checkFormatSupport() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  canvas.getContext("2d").fillRect(0, 0, 1, 1);

  Array.from(formatSelect.options).forEach((option) => {
    const mime = MIME_TYPES[option.value];
    if (!mime) return;

    // JPEG uses toDataURL for reliability (see convertAndDownload), so test it the same way
    if (mime === "image/jpeg") {
      const result = canvas.toDataURL("image/jpeg");
      const supported = result.startsWith("data:image/jpeg");
      markOption(option, supported);
      return;
    }

    // For everything else, test via toDataURL synchronously
    const result = canvas.toDataURL(mime);
    // If the browser doesn't support the format it returns a PNG data URL regardless
    const supported = result.startsWith(`data:${mime}`);
    markOption(option, supported);
  });

  // If the currently selected option is unsupported, auto-select the first supported one
  if (formatSelect.selectedOptions[0]?.disabled) {
    const firstSupported = Array.from(formatSelect.options).find((o) => !o.disabled);
    if (firstSupported) firstSupported.selected = true;
  }
}

function markOption(option, supported) {
  if (!supported) {
    option.disabled = true;
    option.title = `${option.value.toUpperCase()} is not supported by this browser`;
    option.textContent = `${option.value.toUpperCase()} (not supported)`;
  }
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------
chrome.storage.local.get("imageUrl", (data) => {
  imageUrl = data.imageUrl;
  if (!imageUrl) {
    setStatus("No image URL found. Right-click an image and choose 'Download With Format…'", "error");
    return;
  }
  preview.src = imageUrl;
  const parsedName = imageUrl.split("/").pop().split("?")[0];
  const baseName = parsedName.replace(/\.[^.]+$/, "") || "image";
  filenameInput.value = baseName;
});

// Run detection immediately on popup open
checkFormatSupport();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setStatus(msg, type = "info") {
  statusMsg.textContent = msg;
  statusMsg.className = type; // CSS handles colour via class
}

function clearStatus() {
  statusMsg.textContent = "";
  statusMsg.className = "";
}

function dataURLtoBlob(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

// ---------------------------------------------------------------------------
// Conversion + download
// ---------------------------------------------------------------------------
function drawAndDownload(source, format, filename) {
  const mimeType = MIME_TYPES[format];

  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const ctx = canvas.getContext("2d");

  // JPEG has no alpha channel — fill white so transparent areas don't go black
  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0);

  const triggerDownload = (blob) => {
    const blobUrl = URL.createObjectURL(blob);
    chrome.downloads.download({ url: blobUrl, filename: `${filename}.${format}` }, () => {
      if (chrome.runtime.lastError) {
        setStatus("Download failed: " + chrome.runtime.lastError.message, "error");
      } else {
        setStatus("✓ Download started!", "success");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
      downloadBtn.disabled = false;
    });
  };

  // toBlob with "image/jpg" silently falls back to PNG in most browsers,
  // so we use toDataURL for JPEG which is reliable, then convert back to Blob.
  if (mimeType === "image/jpeg") {
    triggerDownload(dataURLtoBlob(canvas.toDataURL("image/jpeg", 0.92)));
  } else {
    canvas.toBlob((blob) => {
      if (!blob) {
        // Shouldn't normally reach here since we pre-checked, but just in case
        setStatus(`Conversion to ${format.toUpperCase()} failed unexpectedly.`, "error");
        downloadBtn.disabled = false;
        return;
      }
      triggerDownload(blob);
    }, mimeType);
  }
}

function convertAndDownload() {
  const format = formatSelect.value;
  const filename = filenameInput.value.trim() || "image";

  if (!imageUrl) {
    setStatus("No image URL available.", "error");
    return;
  }

  clearStatus();
  setStatus("Converting…");
  downloadBtn.disabled = true;

  // Attempt 1: fetch() as a blob. Works when host_permissions covers the origin.
  fetch(imageUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
      offscreen.getContext("2d").drawImage(bitmap, 0, 0);
      offscreen.naturalWidth = bitmap.width;
      offscreen.naturalHeight = bitmap.height;
      drawAndDownload(offscreen, format, filename);
    })
    .catch((fetchErr) => {
      // Attempt 2: fetch() blocked (CORS). Retry with crossOrigin="anonymous".
      console.warn("fetch() blocked, trying crossOrigin img fallback:", fetchErr.message);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          drawAndDownload(img, format, filename);
        } catch (e) {
          setStatus("CORS blocked. Add '<all_urls>' to host_permissions in manifest.json.", "error");
          downloadBtn.disabled = false;
        }
      };
      img.onerror = () => {
        setStatus("Failed to load image. It may require login or block hotlinking.", "error");
        downloadBtn.disabled = false;
      };
      img.src = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "_cb=" + Date.now();
    });
}

downloadBtn.addEventListener("click", convertAndDownload);