let imageUrl = "";
const preview = document.getElementById("preview");
const filenameInput = document.getElementById("filename");
const downloadBtn = document.getElementById("downloadBtn");
const formatSelect = document.getElementById("format");

// Maps format option values to valid MIME types.
// "jpg" is not a real MIME type — it must be "image/jpeg".
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

chrome.storage.local.get("imageUrl", async (data) => {
  imageUrl = data.imageUrl;
  preview.src = imageUrl;

  const parsedName = imageUrl.split("/").pop().split("?")[0];
  const baseName = parsedName.replace(/\.[^.]+$/, "") || "image";
  filenameInput.value = baseName;
});

function dataURLtoBlob(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
}

function convertAndDownload() {
  const format = formatSelect.value;
  const filename = filenameInput.value.trim() || "image";
  const mimeType = MIME_TYPES[format] || `image/${format}`;

  fetch(imageUrl)
    .then((res) => res.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");

      // For JPG, fill background white first — transparent pixels
      // would otherwise render as black since JPEG has no alpha channel.
      if (mimeType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(bitmap, 0, 0);

      // Use toDataURL for JPEG (toBlob with image/jpg silently falls back
      // to PNG in many browsers). Convert the data URL back to a Blob so
      // chrome.downloads.download can still receive a blob URL.
      if (mimeType === "image/jpeg") {
        const dataURL = canvas.toDataURL("image/jpeg", 0.92);
        const convertedBlob = dataURLtoBlob(dataURL);
        const blobUrl = URL.createObjectURL(convertedBlob);
        chrome.downloads.download({ url: blobUrl, filename: `${filename}.${format}` });
      } else {
        canvas.toBlob(
          (convertedBlob) => {
            const blobUrl = URL.createObjectURL(convertedBlob);
            chrome.downloads.download({ url: blobUrl, filename: `${filename}.${format}` });
          },
          mimeType
        );
      }
    });
}

downloadBtn.addEventListener("click", convertAndDownload);