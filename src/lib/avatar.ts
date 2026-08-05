import * as ImagePicker from 'expo-image-picker';

import { showToast } from '@/lib/toast';

export type AvatarSource = 'library' | 'camera';

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

/**
 * Pick a photo to share. Unlike an avatar this keeps its own proportions , 
 * cropping someone's anniversary photo to a square would be presumptuous.
 */
export async function pickPhoto(source: AvatarSource = 'library'): Promise<string | null> {
  return pick(source, { mediaTypes: ['images'], quality: 0.85 });
}

/**
 * Ask for a profile picture. Returns the picked image's URI, or null if the
 * user backed out or hasn't granted access.
 */
export async function pickAvatar(source: AvatarSource): Promise<string | null> {
  return pick(source, OPTIONS);
}

async function pick(
  source: AvatarSource,
  options: ImagePicker.ImagePickerOptions,
): Promise<string | null> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showToast(
        source === 'camera'
          ? 'Camera access is off. Turn it on in Settings'
          : 'Photo access is off. Turn it on in Settings',
      );
      return null;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0].uri;
  } catch {
    showToast("Couldn't open your photos");
    return null;
  }
}
