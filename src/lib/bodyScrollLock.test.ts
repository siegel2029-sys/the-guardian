import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type StyleBag = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  cssText: string;
};

function makeStyle(): StyleBag {
  return {
    overflow: '',
    position: '',
    top: '',
    left: '',
    right: '',
    width: '',
    cssText: '',
  };
}

const bodyStyle = makeStyle();
const htmlStyle = makeStyle();

beforeAll(() => {
  vi.stubGlobal('document', {
    documentElement: { style: htmlStyle },
    body: { style: bodyStyle },
    getElementById: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', {
    scrollY: 120,
    scrollTo: vi.fn(),
  });
});

afterEach(async () => {
  const {
    getBodyScrollLockCount,
    releaseBodyScrollLock,
  } = await import('./bodyScrollLock');
  while (getBodyScrollLockCount() > 0) {
    releaseBodyScrollLock();
  }
  Object.assign(bodyStyle, makeStyle());
  Object.assign(htmlStyle, makeStyle());
  vi.mocked(window.scrollTo).mockClear();
});

describe('bodyScrollLock', () => {
  it('freezes body overflow on first acquire and restores on last release', async () => {
    const {
      acquireBodyScrollLock,
      getBodyScrollLockCount,
      isBodyScrollLocked,
      releaseBodyScrollLock,
    } = await import('./bodyScrollLock');

    expect(isBodyScrollLocked()).toBe(false);

    acquireBodyScrollLock();
    expect(getBodyScrollLockCount()).toBe(1);
    expect(bodyStyle.overflow).toBe('hidden');
    expect(bodyStyle.position).toBe('fixed');
    expect(bodyStyle.top).toBe('-120px');
    expect(htmlStyle.overflow).toBe('hidden');

    acquireBodyScrollLock();
    expect(getBodyScrollLockCount()).toBe(2);
    expect(bodyStyle.overflow).toBe('hidden');

    releaseBodyScrollLock();
    expect(getBodyScrollLockCount()).toBe(1);
    expect(isBodyScrollLocked()).toBe(true);

    releaseBodyScrollLock();
    expect(getBodyScrollLockCount()).toBe(0);
    expect(isBodyScrollLocked()).toBe(false);
    expect(bodyStyle.position).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 120);
  });

  it('ignores extra releases when unlocked', async () => {
    const { getBodyScrollLockCount, releaseBodyScrollLock } = await import(
      './bodyScrollLock'
    );
    releaseBodyScrollLock();
    expect(getBodyScrollLockCount()).toBe(0);
  });
});
