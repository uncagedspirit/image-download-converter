let imageUrl = null;

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get("imageUrl");
  imageUrl = data.imageUrl;

  document.getElementById("preview").src = imageUrl;

  document.getElementById("downloadBtn")
    .addEventListener("click", convertAndDownload);
});

// Prevent double extensions
function sanitizeFilename(name, format) {
  const lower = name.toLowerCase();
  if (lower.endsWith("." + format)) {
    return name;
  }
  return `${name}.${format}`;
}

async function convertAndDownload() {
  if (!imageUrl) return;

  const format = document.querySelector("input[name='fmt']:checked").value;

  const filenameInput = document.getElementById("filename").value.trim();
  if (!filenameInput) {
    alert("Please enter a file name.");
    return;
  }

  const finalName = sanitizeFilename(filenameInput, format);

  const response = await fetch(imageUrl);
  const blob = await response.blob();

  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  // Convert
  const convertedBlob = await new Promise(resolve =>
    canvas.toBlob(resolve, `image/${format}`)
  );

  const url = URL.createObjectURL(convertedBlob);

  chrome.downloads.download({
    url,
    filename: finalName
  });
}