const blobBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
export async function preparePhoto(file, category) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 25 * 1024 * 1024
  )
    throw new Error("请上传 25 MB 以内的 JPEG、PNG 或 WebP 图片。");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width > 16000 || bitmap.height > 16000)
      throw new Error("图片尺寸过大，请先缩小至 16000 像素以内。");
    const id = "photo-" + crypto.randomUUID();
    const uploads = [];
    for (const size of [640, 1280, 1920]) {
      const ratio = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      );
      if (!blob || blob.type !== "image/webp")
        throw new Error(
          "当前浏览器不支持 WebP 编码，请使用新版 Chrome 或 Edge。",
        );
      uploads.push({
        path: `media/${id}-${size}.webp`,
        base64: await blobBase64(blob),
      });
    }
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    return {
      photo: {
        id,
        title,
        alt: title,
        category,
        image: `media/${id}-1920.webp`,
        thumbnail: `media/${id}-640.webp`,
        display: `media/${id}-1280.webp`,
        large: `media/${id}-1920.webp`,
        width: bitmap.width,
        height: bitmap.height,
        published: false,
        featured: false,
      },
      uploads,
      preview: URL.createObjectURL(file),
    };
  } finally {
    bitmap.close();
  }
}
