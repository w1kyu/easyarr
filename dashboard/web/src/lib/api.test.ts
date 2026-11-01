import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWiring, type WiringEvent } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runWiring', () => {
  it('parses server-sent events, also when chunks split them', async () => {
    const chunks = [
      'event: start\ndata: {"type":"start","mode":"run","steps":[{"id":"a","service":"sonarr"}]}\n\n: keep-alive\n\nevent: st',
      'ep\ndata: {"type":"step","step":"a","service":"sonarr","state":"done","changes":2}\n\n',
      'event: end\ndata: {"type":"end","ok":true,"changes":2}\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const events: WiringEvent[] = [];
    await runWiring('repair', (e) => events.push(e));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/wiring/repair',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(events.map((e) => e.type)).toEqual(['start', 'step', 'end']);
    expect(events[1]).toMatchObject({ state: 'done', changes: 2 });
  });

  it('turns a refused start into an ApiError with the server code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"wizard_incomplete"}', { status: 409 })),
    );
    await expect(runWiring('run', () => undefined)).rejects.toMatchObject({
      status: 409,
      code: 'wizard_incomplete',
    });
  });
});
