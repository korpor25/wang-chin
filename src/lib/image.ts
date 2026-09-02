/** บีบอัดรูปก่อนเก็บลงเครื่อง — ภาพจากกล้องมือถือใหญ่เกินกว่าจะเก็บดิบทุกใบ */

export interface CompressResult {
  blob: Blob
  width: number
  height: number
}

/**
 * ย่อด้านยาวสุดให้ไม่เกิน maxEdge แล้วเข้ารหัสเป็น JPEG ตามคุณภาพที่กำหนด
 */
export async function compressImage(file: File, maxEdge: number, quality: number): Promise<CompressResult> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ไม่รองรับ canvas 2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('บีบอัดรูปไม่สำเร็จ')
  return { blob, width, height }
}
