// Hands a text file to the person: a download on the web, the share sheet on phones.

import { Platform, Share } from 'react-native';

export const MAX_SHARE_CHARS = 400_000; // the share sheet passes text through the OS, which has a size limit

export type DeliverResult = 'saved' | 'shared' | 'cancelled' | 'too_big' | 'failed';

export async function deliverText(name: string, text: string, mime: string): Promise<DeliverResult> {
  try {
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return 'saved';
    }
    if (text.length > MAX_SHARE_CHARS) return 'too_big';
    const r = await Share.share({ title: name, message: text });
    return r.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'failed';
  }
}
