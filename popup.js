let imageUrl = "";
const preview = document.getElementById("preview");
const filenameInput = document.getElementById("filename");
const downloadBtn = document.getElementById("downloadBtn");
const formatSelect = document.getElementById("format");

chrome.storage.local.get("imageUrl", async (data) => {
  imageUrl = data.imageUrl;
  preview.src = imageUrl;

  const parsedName = imageUrl.split("/").pop().split("?")[0];
  const baseName = parsedName.replace(/\.[^.]+$/, "") || "image";
  filenameInput.value = baseName;
});

//TODO: JPG format not working, fix it by using canvas.toDataURL instead of toBlob for JPG and then converting the data URL back to a blob.

function convertAndDownload() {
  const format = formatSelect.value;
  const filename = filenameInput.value.trim() || "image";

  fetch(imageUrl)
    .then((res) => res.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);

      canvas.toBlob(
        (convertedBlob) => {
          const blobUrl = URL.createObjectURL(convertedBlob);

          chrome.downloads.download({
            url: blobUrl,
            filename: `${filename}.${format}`
          });
        },
        `image/${format}`
      );
    });
}

downloadBtn.addEventListener("click", convertAndDownload);