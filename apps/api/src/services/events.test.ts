import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeTopic } from '@text-them/shared';
import { createChangeNotifier } from './events.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function watch(intervalMs = 1000) {
  const notifier = createChangeNotifier(intervalMs);
  const heard: ChangeTopic[] = [];
  notifier.subscribe((topic) => heard.push(topic));
  return { notifier, heard };
}

describe('createChangeNotifier', () => {
  it('sends the first change right away', () => {
    const { notifier, heard } = watch();
    notifier.notify('groups');
    expect(heard).toEqual(['groups']);
  });

  it('folds a burst of changes into one more notice at the end of the interval', () => {
    const { notifier, heard } = watch();
    notifier.notify('messages');
    for (let i = 0; i < 50; i++) notifier.notify('messages'); // e.g. delivery callbacks
    expect(heard).toEqual(['messages']);

    vi.advanceTimersByTime(1000);
    expect(heard).toEqual(['messages', 'messages']);

    // Nothing new came in, so the burst is over.
    vi.advanceTimersByTime(5000);
    expect(heard).toEqual(['messages', 'messages']);
  });

  it('sends again at once after a quiet interval', () => {
    const { notifier, heard } = watch();
    notifier.notify('groups');
    vi.advanceTimersByTime(1000);
    notifier.notify('groups');
    expect(heard).toEqual(['groups', 'groups']);
  });

  it('throttles each topic on its own', () => {
    const { notifier, heard } = watch();
    notifier.notify('groups');
    notifier.notify('messages');
    expect(heard).toEqual(['groups', 'messages']);
  });

  it('stops telling a listener once it unsubscribes', () => {
    const notifier = createChangeNotifier(0);
    const heard: ChangeTopic[] = [];
    const unsubscribe = notifier.subscribe((topic) => heard.push(topic));
    unsubscribe();
    notifier.notify('groups');
    expect(heard).toEqual([]);
  });

  it('still reaches the other listeners when one throws', () => {
    const { notifier, heard } = watch();
    notifier.subscribe(() => {
      throw new Error('stream closed');
    });
    const late: ChangeTopic[] = [];
    notifier.subscribe((topic) => late.push(topic));
    notifier.notify('groups');
    expect(heard).toEqual(['groups']);
    expect(late).toEqual(['groups']);
  });

  it('drops a pending notice on close', () => {
    const { notifier, heard } = watch();
    notifier.notify('groups');
    notifier.notify('groups');
    notifier.close();
    vi.advanceTimersByTime(1000);
    expect(heard).toEqual(['groups']);
  });
});
