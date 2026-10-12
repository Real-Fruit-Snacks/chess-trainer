import { toast } from '@/components/ui/toastStore';

/** A phone or a tablet (a coarse pointer): a link goes to its share sheet there. */
export function onPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Passes a link on: through the share sheet on a phone that has one, to the
 * clipboard otherwise (saying `copied` once it is there). Closing the share
 * sheet is a choice, not a failure: nothing more happens then.
 */
export async function shareLink(url: string, title: string, copied: string): Promise<void> {
  if (onPhone() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(copied, { tone: 'success' });
  } catch {
    toast('Could not copy the link.', { tone: 'warning' });
  }
}
