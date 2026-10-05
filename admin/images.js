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
    const paths = {}, seen = new Map();
    for (const size of [640, 1280, 1920]) {
      const ratio = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const dimensions = `${Math.round(bitmap.width * ratio)}x${Math.round(bitmap.height * ratio)}`;
      if (seen.has(dimensions)) { paths[size] = seen.get(dimensions); continue; }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob;
      for (const quality of [0.85, 0.78, 0.7, 0.62, 0.54, 0.46]) {
        blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.size <= 1024 * 1024) break;
      }
      if (blob?.size > 1024 * 1024) throw new Error("这张照片压缩后仍超过 1 MB，请先导出较小的展示版本。");
      if (!blob || blob.type !== "image/webp")
        throw new Error(
          "当前浏览器不支持 WebP 编码，请使用新版 Chrome 或 Edge。",
        );
      paths[size] = `media/${id}-${size}.webp`;
      seen.set(dimensions, paths[size]);
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
        image: paths[1920],
        thumbnail: paths[640],
        display: paths[1280],
        large: paths[1920],
        width: bitmap.width,
        height: bitmap.height,
        published: false,
        featured: false,
        homeSelected: false,
        placement: "gallery",
      },
      uploads,
      preview: URL.createObjectURL(file),
    };
  } finally {
    bitmap.close();
  }
}
