let imageUrl = "";
const preview = document.getElementById("preview");
const filenameInput = document.getElementById("filename");
const downloadBtn = document.getElementById("downloadBtn");
const formatSelect = document.getElementById("format");
const statusMsg = document.getElementById("statusMsg");

const MIME_TYPES = {
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  bmp:  "image/bmp",
  gif:  "image/gif",
  tiff: "image/tiff",
  avif: "image/avif",
  ico:  "image/x-icon",
};

chrome.storage.local.get("imageUrl", (data) => {
  imageUrl = data.imageUrl;
  if (!imageUrl) {
    setStatus("No image URL found. Right-click an image and use 'Download With Format…'", "error");
    return;
  }
  preview.src = imageUrl;
  const parsedName = imageUrl.split("/").pop().split("?")[0];
  const baseName = parsedName.replace(/\.[^.]+$/, "") || "image";
  filenameInput.value = baseName;
});

function setStatus(msg, type = "info") {
  statusMsg.textContent = msg;
  statusMsg.style.color = type === "error" ? "#c0392b" : "#27ae60";
}

function dataURLtoBlob(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

function drawAndDownload(source, format, filename) {
  const mimeType = MIME_TYPES[format] || `image/${format}`;

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
    chrome.downloads.download({ url: blobUrl, filename: `${filename}.${format}` }, (downloadId) => {
      if (chrome.runtime.lastError) {
        setStatus("Download failed: " + chrome.runtime.lastError.message, "error");
      } else {
        setStatus("✓ Download started!");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
      downloadBtn.disabled = false;
    });
  };

  if (mimeType === "image/jpeg") {
    // toBlob with "image/jpg" silently falls back to PNG in most browsers;
    // toDataURL("image/jpeg") is reliable, so we use that and convert back to Blob.
    triggerDownload(dataURLtoBlob(canvas.toDataURL("image/jpeg", 0.92)));
  } else {
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus(`${format.toUpperCase()} is not supported by this browser.`, "error");
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

  setStatus("Converting…");
  downloadBtn.disabled = true;

  // Attempt 1: fetch() as a blob.
  // This works reliably when host_permissions in manifest.json covers the image's origin,
  // which lets the extension bypass CORS. Without it, fetch() throws a CORS error.
  fetch(imageUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      // createImageBitmap returns a bitmap, not an HTMLImageElement.
      // Wrap it in a canvas so drawAndDownload can call drawImage() on it.
      const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
      offscreen.getContext("2d").drawImage(bitmap, 0, 0);
      // OffscreenCanvas doesn't have naturalWidth, patch it:
      offscreen.naturalWidth = bitmap.width;
      offscreen.naturalHeight = bitmap.height;
      drawAndDownload(offscreen, format, filename);
    })
    .catch((fetchErr) => {
      // Attempt 2: fetch() failed (likely CORS). Try loading with crossOrigin="anonymous"
      // so the canvas doesn't get tainted and we can still call toBlob/toDataURL.
      console.warn("fetch() blocked, trying crossOrigin img fallback:", fetchErr.message);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          drawAndDownload(img, format, filename);
        } catch (e) {
          // Canvas is tainted — server doesn't send CORS headers.
          setStatus("CORS blocked. Add '<all_urls>' to host_permissions in manifest.json.", "error");
          downloadBtn.disabled = false;
          console.error(e);
        }
      };
      img.onerror = () => {
        setStatus("Failed to load image. It may require login or block hotlinking.", "error");
        downloadBtn.disabled = false;
      };
      // Cache-bust so the browser makes a fresh request with the CORS header
      img.src = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "_cb=" + Date.now();
    });
}

downloadBtn.addEventListener("click", convertAndDownload);