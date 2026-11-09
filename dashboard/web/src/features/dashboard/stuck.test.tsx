import '~/lib/i18n';
import type { StuckItem } from '@easyarr/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StuckList } from './stuck';

const item = (over: Partial<StuckItem>): StuckItem => ({
  id: 'radarr:movie:7',
  kind: 'language',
  type: 'movie',
  title: 'Dune (2021)',
  since: '2026-11-09T10:00:00Z',
  actions: ['accept', 'dismiss'],
  offer: { languages: ['English'], quality: 'WEBDL-1080p', sizeBytes: 4e9, seeders: 12 },
  ...over,
});

function renderList(items: StuckItem[]) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init?.body ?? 'null')) });
      return new Response(JSON.stringify({ result: 'ok' }), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StuckList items={items} />
    </QueryClientProvider>,
  );
  return posts;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Needs your OK (D-068)', () => {
  it('says why in plain words and only acts on a click', async () => {
    const posts = renderList([
      item({}),
      {
        id: 'radarr:queue:9',
        type: 'movie',
        since: '2026-11-09T11:00:00Z',
        kind: 'downloadProblem',
        title: 'Heat (1995)',
        detail: 'No files found are eligible for import',
        actions: ['replace', 'dismiss'],
      },
    ]);
    expect(screen.getByText('Needs your OK')).toBeTruthy();
    expect(
      screen.getByText(
        /Not available yet in the audio languages you need. There is a version in English/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('12 people sharing it')).toBeTruthy();
    expect(screen.getByText(/No files found are eligible for import/)).toBeTruthy();
    expect(posts).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Download in English' }));
    await waitFor(() =>
      expect(posts).toEqual([{ url: '/api/stuck/radarr%3Amovie%3A7', body: { action: 'accept' } }]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try another version' }));
    await waitFor(() => expect(posts.at(-1)?.body).toEqual({ action: 'replace' }));
  });

  it('shows nothing when nothing is stuck', () => {
    renderList([]);
    expect(screen.queryByText('Needs your OK')).toBeNull();
  });
});
