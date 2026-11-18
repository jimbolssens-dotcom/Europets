// lib/profilePhoto.js
// Browser only. A pet's profile picture, shrunk before it's uploaded
// (Jim, 18 Nov: "a profile pic of any animal that comes in", but no large
// files): turned upright, cropped to a centred square, scaled to
// PROFILE_PHOTO_SIDE and saved as a JPEG, around 50 to 100 KB from a
// several-MB phone photo. Used by uploadPatientProfilePhoto
// (lib/attachments.js) for staff and owners alike.

export const PROFILE_PHOTO_SIDE = 640;

// The square crop of an image of (w, h): { sx, sy, size }. Pure.
export function squareCrop(w, h) {
  const size = Math.min(w, h);
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size };
}

export async function shrinkProfilePhoto(file, side = PROFILE_PHOTO_SIDE, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that photo'));
      i.src = url; // browsers apply the photo's orientation when decoding
    });
    const { sx, sy, size } = squareCrop(img.naturalWidth, img.naturalHeight);
    const out = Math.min(side, size);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, out, out);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not shrink that photo');
    return new File([blob], `profile-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
