import { supabase } from "@/integrations/supabase/client";

// Rasmni client-side siqish (max 1600px, JPEG ~0.82). PDF/boshqa fayllar tegmaydi.
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size < 400 * 1024) return file; // 400KB dan kichik bo'lsa siqish shart emas

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file;
  const newName = file.name.replace(/\.(png|jpg|jpeg|webp|heic|heif)$/i, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

// Supabase storage signed URL ga XHR orqali yuklash — progress bilan.
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ publicUrl: string }> {
  // 1) Signed upload URL olamiz
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (signErr || !signed) throw signErr ?? new Error("Signed URL olinmadi");

  // 2) XHR PUT — progress event bilan
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Tarmoq xatosi"));
    xhr.send(file);
  });

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: pub.publicUrl };
}
