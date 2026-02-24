let imageUrl = null;

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get("imageUrl");
  imageUrl = data.imageUrl;

  const preview = document.getElementById("preview");
  preview.src = imageUrl;

  document.getElementById("downloadBtn").addEventListener("click", convertAndDownload);
});

async function convertAndDownload() {
  if (!imageUrl) return;

  const format = document.querySelector("input[name='fmt']:checked").value;

  // Fetch the original image as blob
  const response = await fetch(imageUrl);
  const blob = await response.blob();

  // Draw on canvas to convert
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  // Convert to target format
  const convertedBlob = await new Promise(resolve =>
    canvas.toBlob(resolve, `image/${format}`)
  );

  // Download
  const url = URL.createObjectURL(convertedBlob);

  chrome.downloads.download({
    url: url,
    filename: `converted.${format}`
  });
}