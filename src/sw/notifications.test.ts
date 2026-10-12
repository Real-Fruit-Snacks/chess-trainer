import { describe, expect, it } from 'vitest';
import { noticeOf, noticeTarget, notificationOptions } from './notifications';

describe('notices', () => {
  it('takes what the relay pushes, checked', () => {
    expect(
      noticeOf({
        title: 'Your move against Patient Bishop',
        body: 'Patient Bishop played Nf3.',
        url: 'play/online/abcdefABCDEF0123',
        tag: 'abcdefABCDEF0123',
      }),
    ).toEqual({
      title: 'Your move against Patient Bishop',
      body: 'Patient Bishop played Nf3.',
      url: 'play/online/abcdefABCDEF0123',
      tag: 'abcdefABCDEF0123',
    });
    // Anything but a plain path in the app opens the home page.
    for (const url of [
      'https://evil.test/',
      '//evil.test',
      '../settings',
      'play/../x',
      '/play',
      42,
    ]) {
      expect(noticeOf({ title: 'Hi', url })?.url, String(url)).toBe('');
    }
    expect(noticeOf({ title: 'Hi', tag: 'not a tag!' })).toEqual({
      title: 'Hi',
      body: '',
      url: '',
      tag: 'notice',
    });
    expect(noticeOf({ title: '  ' })).toBeNull();
    expect(noticeOf({ body: 'no title' })).toBeNull();
    expect(noticeOf('text')).toBeNull();
    expect(noticeOf(null)).toBeNull();
    expect(noticeOf({ title: 'x'.repeat(500) })?.title).toHaveLength(120);
  });

  it('opens the app’s own page, under its base', () => {
    const origin = 'https://example.github.io';
    expect(noticeTarget('/open-file/', 'play/online/abc', origin)).toBe(
      'https://example.github.io/open-file/play/online/abc',
    );
    expect(noticeTarget('/open-file/', '', origin)).toBe('https://example.github.io/open-file/');
    expect(noticeTarget('/', '//evil.test/x', origin)).toBe('https://example.github.io/');
    expect(noticeTarget('/', undefined, origin)).toBe('https://example.github.io/');
  });

  it('shows a notice with the app’s icons, its tag and its path', () => {
    expect(
      notificationOptions(
        { title: 'Time for some chess', body: 'Go on.', url: '', tag: 'reminder' },
        '/app/',
      ),
    ).toEqual({
      body: 'Go on.',
      tag: 'reminder',
      icon: '/app/icons/icon-192.png',
      badge: '/app/icons/icon-monochrome-512.png',
      data: { url: '' },
    });
  });
});
