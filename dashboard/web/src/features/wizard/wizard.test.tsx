import '~/lib/i18n';
import {
  accountInputSchema,
  usenetAnswersSchema,
  usenetInputSchema,
  canOpenWizardStep,
  evaluateSystem,
  nextWizardStep,
  visibleWizardSteps,
  type SystemInfo,
  type WizardAnswers,
  type WizardView,
} from '@easyarr/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SetupIndex, WizardPage } from './wizard-page';

/** A tiny in-memory stand-in for the server's wizard API, using the same shared rules. */
function fakeServer(info: SystemInfo) {
  const db = {
    completed: [] as string[],
    answers: {} as WizardAnswers,
    account: null as null | { username: string },
    vpn: null as null | Record<string, unknown>,
    vpnConnection: 'connected' as string,
    prowlarrCount: 0,
    /** Server-sent events the fake wiring run sends. */
    wiringEvents: [] as unknown[],
    secrets: { servers: [] as string[], indexers: [] as string[] },
  };
  const posts: { step: string; body: unknown }[] = [];
  const vpnPosts: { url: string; body: unknown }[] = [];
  const view = (): WizardView => ({
    steps: visibleWizardSteps(db.answers).map((id) => ({
      id,
      completed: db.completed.includes(id),
    })),
    next: nextWizardStep(db.answers, db.completed),
    answers: db.answers,
    account: db.account ? { ...db.account, hasPassword: true } : null,
    usenetSecrets: db.secrets,
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/system-check') return json(evaluateSystem(info));
    if (url === '/api/wizard') return json(view());
    if (url === '/api/prowlarr/indexers')
      return json({ reachable: true, count: db.prowlarrCount, torrent: db.prowlarrCount });
    if (url === '/api/usenet/test-server' || url === '/api/usenet/test-indexer') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      vpnPosts.push({ url, body });
      const secret = body['password'] ?? body['apiKey'];
      return json(
        secret === 'right'
          ? { ok: true, reason: 'ok' }
          : { ok: false, reason: 'auth', detail: 'Authentication failed' },
      );
    }
    if (url === '/api/wiring/run') {
      const sse = db.wiringEvents.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (url.startsWith('/api/vpn/')) {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (init?.method === 'POST') vpnPosts.push({ url, body });
      if (url === '/api/vpn/config' && init?.method === 'POST') {
        db.vpn = {
          provider: body['provider'],
          protocol: body['protocol'],
          locations: body['locations'],
          portForwarding: body['portForwarding'],
          forwardedPort: null,
          freePlan: false,
          fields: {},
          savedSecrets: ['wgPrivateKey'],
          lastTest: null,
        };
        return json({ config: db.vpn });
      }
      if (url === '/api/vpn/config') return json({ config: db.vpn });
      if (url === '/api/vpn/status') {
        return json({ connection: db.vpnConnection, wrapper: 'running', provider: 'protonvpn' });
      }
      if (url === '/api/vpn/test') {
        const result = {
          ok: true,
          at: '2026-10-31T12:00:00Z',
          code: null,
          publicIp: '185.159.157.10',
          country: 'Netherlands',
          homeIpHidden: true,
          portForwarding: { mode: 'auto', port: 51413, state: 'active' },
          problemLine: null,
        };
        if (db.vpn) db.vpn['lastTest'] = result;
        return json(result);
      }
    }
    const step = url.replace('/api/wizard/', '') as keyof WizardAnswers;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    posts.push({ step, body });
    if (!canOpenWizardStep(step, db.answers, db.completed)) {
      return json({ error: 'previous_steps_incomplete', issues: [] }, 409);
    }
    if (step === 'account') {
      const parsed = accountInputSchema.parse(body);
      db.account = { username: parsed.username };
      db.answers.account = { username: parsed.username };
    } else if (step === 'usenet') {
      const parsed = usenetInputSchema.parse(body);
      db.secrets = {
        servers: parsed.servers.map((x) => x.id),
        indexers: parsed.indexers.map((x) => x.id),
      };
      db.answers.usenet = usenetAnswersSchema.parse(parsed);
    } else {
      (db.answers as Record<string, unknown>)[step] = body;
    }
    if (!db.completed.includes(step)) db.completed.push(step);
    return json(view());
  });
  return { db, posts, vpnPosts, fetchMock };
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>home</p> },
      { path: '/setup', element: <SetupIndex /> },
      { path: '/setup/:stepId', element: <WizardPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return router;
}

const GIB = 1024 ** 3;
const goodInfo: SystemInfo = {
  arch: 'x64',
  totalMemoryBytes: 24 * GIB,
  disk: { freeBytes: 5e12, totalBytes: 6e12 },
  gpu: { kind: 'dri', devices: ['/dev/dri/renderD128'] },
};

let server: ReturnType<typeof fakeServer>;
beforeEach(() => {
  server = fakeServer(goodInfo);
  vi.stubGlobal('fetch', server.fetchMock);
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));

describe('setup wizard', () => {
  it('walks through steps 1–5 and saves each one (VPN skipped)', async () => {
    const router = renderAt('/setup');
    await screen.findByRole('heading', { name: 'Welcome to EasyArr' });
    expect(screen.getByText('Step 1 of 7')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restore from backup/ })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: /Start setup/ }));

    await screen.findByRole('heading', { name: 'Checking your Umbrel' });
    await screen.findByText('Your Umbrel is ready for EasyArr.');
    expect(screen.getByTestId('system-memory').textContent).toContain('24.0 GB');
    next();

    await screen.findByRole('heading', { name: 'Create your account' });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'kevin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'summer-rain7' } });
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'summer-rain7' },
    });
    next();

    await screen.findByRole('heading', { name: 'How do you want to download?' });
    fireEvent.click(screen.getByRole('radio', { name: /Usenet/ }));
    next();

    await screen.findByRole('heading', { name: 'Protect your downloads with a VPN' });
    await screen.findByTestId('vpn-provider-protonvpn');
    fireEvent.click(await screen.findByRole('button', { name: /Skip for now/ }));
    await screen.findByRole('dialog');
    expect(server.posts.map((p) => p.step)).not.toContain('vpn');
    fireEvent.click(screen.getByRole('button', { name: /Skip — I'll set it up later/ }));

    // Usenet was chosen: step 6 comes next (8 steps now: no torrent indexer step).
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/usenet'));
    await screen.findByText('Step 6 of 8');
    expect(server.posts.map((p) => p.step)).toEqual([
      'welcome',
      'system',
      'account',
      'download',
      'vpn',
    ]);
    expect(server.posts[4]?.body).toEqual({ mode: 'skipped' });
    expect(server.posts[2]?.body).toEqual({ username: 'kevin', password: 'summer-rain7' });
    expect(server.db.answers.download).toEqual({ method: 'usenet' });
  });

  it('resumes where the user left off and refuses to skip ahead', async () => {
    server.db.completed = ['welcome', 'system'];
    server.db.answers = { welcome: { started: true }, system: { acknowledgedProblems: false } };
    const router = renderAt('/setup/download');
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(router.state.location.pathname).toBe('/setup/account');
    expect(screen.getByText('Step 3 of 7')).toBeTruthy();
  });

  it('VPN step: pick a provider, connect, see the test result, continue', async () => {
    server.db.completed = ['welcome', 'system', 'account', 'download'];
    server.db.answers = { download: { method: 'torrents' } } as WizardAnswers;
    const router = renderAt('/setup/vpn');
    fireEvent.change(await screen.findByLabelText('Search VPN providers'), {
      target: { value: 'proton' },
    });
    expect(screen.queryByTestId('vpn-provider-mullvad')).toBeNull();
    fireEvent.click(screen.getByTestId('vpn-provider-protonvpn'));
    await screen.findByTestId('vpn-provider-name');
    // WireGuard is pre-selected; Proton only needs the key.
    fireEvent.change(screen.getByLabelText('WireGuard private key'), {
      target: { value: 'wOEI9rqqbDwnN8/Bpp22sVz48T71vJ4fYmFWujulwUU=' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    const result = await screen.findByTestId('vpn-result', {}, { timeout: 5000 });
    expect(result.dataset['ok']).toBe('true');
    expect(result.textContent).toContain('185.159.157.10 (Netherlands)');
    expect(result.textContent).toContain('Your home IP is hidden');
    expect(result.textContent).toContain('port 51413');
    expect(server.vpnPosts[0]).toMatchObject({
      url: '/api/vpn/config',
      body: {
        provider: 'protonvpn',
        protocol: 'wireguard',
        portForwarding: true,
        fields: { wgPrivateKey: 'wOEI9rqqbDwnN8/Bpp22sVz48T71vJ4fYmFWujulwUU=' },
      },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Next/ })).toBeTruthy());
    next();
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/indexers'));
    expect(server.posts.at(-1)).toEqual({ step: 'vpn', body: { mode: 'configured' } });
  });

  it('validates the account form before sending anything', async () => {
    server.db.completed = ['welcome', 'system'];
    renderAt('/setup/account');
    await screen.findByRole('heading', { name: 'Create your account' });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'k k' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123!' } });
    expect(screen.getByTestId('password-strength').dataset['score']).toBe('1');
    fireEvent.change(screen.getByLabelText('Repeat password'), { target: { value: 'other' } });
    next();
    await screen.findByText(/Use 2–32 letters/);
    expect(screen.getByText(/too easy to guess/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'summer-rain7' } });
    next();
    await screen.findByText("The passwords don't match.");
    expect(server.posts).toEqual([]);
  });

  it('keeps a saved password when the fields stay empty', async () => {
    server.db.completed = ['welcome', 'system', 'account'];
    server.db.account = { username: 'kevin' };
    server.db.answers = { account: { username: 'kevin' } };
    renderAt('/setup/account');
    await screen.findByText(/isn't shown here for security reasons/);
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('kevin');
    next();
    await waitFor(() =>
      expect(server.posts).toEqual([{ step: 'account', body: { username: 'kevin' } }]),
    );
  });

  it('a ❌ in the system check needs "continue anyway"', async () => {
    server = fakeServer({ ...goodInfo, totalMemoryBytes: 2 * GIB });
    vi.stubGlobal('fetch', server.fetchMock);
    server.db.completed = ['welcome'];
    renderAt('/setup/system');
    await screen.findByText('Your Umbrel may struggle to run EasyArr.');
    expect(screen.getByTestId('system-memory').dataset['verdict']).toBe('error');
    next();
    await screen.findByText('Please confirm that you want to continue anyway.');
    expect(server.posts).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox'));
    next();
    await waitFor(() =>
      expect(server.posts).toEqual([{ step: 'system', body: { acknowledgedProblems: true } }]),
    );
  });

  it('asks for a download method before continuing', async () => {
    server.db.completed = ['welcome', 'system', 'account'];
    renderAt('/setup/download');
    await screen.findByRole('heading', { name: 'How do you want to download?' });
    next();
    await screen.findByText('Please choose one of the options.');
    expect(server.posts).toEqual([]);
  });

  const doneUntil = (step: string, method: 'torrents' | 'usenet' | 'both') => {
    const all = [
      'welcome',
      'system',
      'account',
      'download',
      'vpn',
      'usenet',
      'indexers',
      'library',
    ];
    server.db.completed = all.slice(0, all.indexOf(step));
    server.db.answers = {
      welcome: { started: true },
      system: { acknowledgedProblems: false },
      account: { username: 'kevin' },
      download: { method },
      vpn: { mode: 'configured' },
    } as WizardAnswers;
  };

  it('Usenet step: explains provider vs indexer, tests, and sends secrets only when typed', async () => {
    doneUntil('usenet', 'usenet');
    renderAt('/setup/usenet');
    await screen.findByRole('heading', { name: 'Your Usenet accounts' });
    expect(screen.getByTestId('usenet-explainer').textContent).toContain('Provider');
    next();
    expect(await screen.findByText('Enter the server address from your provider.')).toBeTruthy();
    expect(screen.getByText("Enter the API key from the indexer's website.")).toBeTruthy();
    expect(server.posts.map((p) => p.step)).not.toContain('usenet');

    const card = within(screen.getByTestId('usenet-server-0'));
    fireEvent.change(card.getByLabelText('Server address'), {
      target: { value: 'news.example.com' },
    });
    fireEvent.change(card.getByLabelText('Username'), { target: { value: 'me' } });
    fireEvent.change(card.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(card.getByRole('button', { name: 'Test this provider' }));
    expect((await card.findByTestId('usenet-test-result')).textContent).toContain('was refused');
    fireEvent.change(card.getByLabelText('Password'), { target: { value: 'right' } });
    fireEvent.click(card.getByRole('button', { name: 'Test this provider' }));
    await waitFor(() =>
      expect(card.getByTestId('usenet-test-result').getAttribute('data-ok')).toBe('true'),
    );

    const ix = within(screen.getByTestId('usenet-indexer-0'));
    fireEvent.change(ix.getByLabelText('Indexer'), { target: { value: 'nzbgeek' } });
    expect((ix.getByLabelText('Address') as HTMLInputElement).value).toBe(
      'https://api.nzbgeek.info',
    );
    fireEvent.change(ix.getByLabelText('API key'), { target: { value: 'right' } });
    next();
    await waitFor(() => expect(server.posts.map((p) => p.step)).toContain('usenet'));
    const body = server.posts.find((p) => p.step === 'usenet')?.body as {
      servers: Record<string, unknown>[];
      indexers: Record<string, unknown>[];
    };
    expect(body.servers[0]).toMatchObject({
      host: 'news.example.com',
      port: 563,
      ssl: true,
      password: 'right',
    });
    expect(body.indexers[0]).toMatchObject({ preset: 'nzbgeek', name: 'NZBgeek', apiKey: 'right' });
  });

  it('Indexers step: "Do this later" until Prowlarr has one, then Next', async () => {
    doneUntil('indexers', 'torrents');
    const router = renderAt('/setup/indexers');
    await screen.findByRole('heading', { name: 'Add search sites for torrents' });
    expect(await screen.findByText('No search sites in Prowlarr yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open Prowlarr/ }).getAttribute('href')).toBe(
      '/apps/prowlarr/',
    );
    fireEvent.click(screen.getByRole('button', { name: /Do this later/ }));
    expect(await screen.findByText('Add search sites later?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add them now' }));

    server.db.prowlarrCount = 2;
    fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(/Prowlarr has 2 search sites/)).toBeTruthy();
    await waitFor(() => screen.getByRole('button', { name: /^Next/ }));
    next();
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/library'));
    expect(server.posts.at(-1)).toEqual({ step: 'indexers', body: { mode: 'added' } });
  });

  it('What do you want?: at least one library, language and quality are saved', async () => {
    doneUntil('library', 'torrents');
    server.db.completed.push('indexers');
    renderAt('/setup/library');
    await screen.findByRole('heading', { name: 'What do you want?' });
    for (const name of ['Movies', 'TV shows', 'Music'])
      fireEvent.click(screen.getByRole('switch', { name }));
    next();
    expect(await screen.findByText('Choose at least one: movies, shows or music.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Movies' }));
    // Audio default: Original, then English. Add German, move it to the top, make it a must-have.
    fireEvent.change(screen.getByLabelText('Add an audio language'), { target: { value: 'de' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move German up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move German up' }));
    fireEvent.click(screen.getByRole('switch', { name: 'German is a must-have' }));
    const audio = screen.getByRole('list', { name: 'Audio languages, best first' });
    fireEvent.click(within(audio).getByRole('button', { name: 'Remove English' }));
    // Subtitles: drop the default English, add German.
    const subs = screen.getByRole('list', { name: 'Subtitle languages, best first' });
    fireEvent.click(within(subs).getByRole('button', { name: 'Remove English' }));
    expect(screen.getByText('No subtitles.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Add a subtitle language'), { target: { value: 'de' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Save space' }));
    expect(screen.getByRole('radio', { name: 'Balanced' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    next();
    await waitFor(() => expect(server.posts.at(-1)?.step).toBe('library'));
    expect(server.posts.at(-1)?.body).toEqual({
      libraries: { movies: true, tv: false, music: false },
      audio: [
        { code: 'de', required: true },
        { code: 'original', required: false },
      ],
      subtitles: [{ code: 'de', required: false }],
      language: 'de',
      quality: 'small',
    });
  });

  const finishedSteps = () => {
    doneUntil('library', 'torrents');
    server.db.completed.push('indexers', 'library');
  };

  it('Finish: live checklist, then the "what now" tour and the dashboard', async () => {
    finishedSteps();
    server.db.wiringEvents = [
      { type: 'start', mode: 'run', steps: [{ id: 'sonarr.connect', service: 'sonarr' }] },
      { type: 'step', step: 'sonarr.connect', service: 'sonarr', state: 'done', changes: 2 },
      { type: 'end', ok: true, changes: 2 },
    ];
    const router = renderAt('/setup/finish');
    await screen.findByRole('heading', { name: 'Connect everything' });
    expect(screen.getByTestId('finish-summary')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Connect everything/ }));
    expect(await screen.findByText('Everything is connected')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open the request page/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Go to my dashboard/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(server.posts.at(-1)).toEqual({ step: 'finish', body: { result: 'ok' } });
  });

  it('Finish: a failed step is explained in plain words, with Retry and "Finish anyway"', async () => {
    finishedSteps();
    server.db.wiringEvents = [
      {
        type: 'start',
        mode: 'run',
        steps: [
          { id: 'recyclarr.sync', service: 'recyclarr' },
          { id: 'radarr.connect', service: 'radarr' },
        ],
      },
      {
        type: 'step',
        step: 'recyclarr.sync',
        service: 'recyclarr',
        state: 'failed',
        error: { code: 'http', service: 'recyclarr', message: 'sync failed', details: [] },
      },
      {
        type: 'step',
        step: 'radarr.connect',
        service: 'radarr',
        state: 'failed',
        error: { code: 'unreachable', service: 'radarr', message: 'refused', details: [] },
      },
      { type: 'end', ok: false, changes: 0 },
    ];
    renderAt('/setup/finish');
    await screen.findByRole('heading', { name: 'Connect everything' });
    fireEvent.click(screen.getByRole('button', { name: /^Connect everything/ }));
    expect(await screen.findByTestId('finish-failed')).toBeTruthy();
    expect(screen.getByText(/TRaSH guides/)).toBeTruthy();
    expect(screen.getByText(/Radarr isn't answering yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Get help with AI/ })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish anyway' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finish anyway', hidden: false }));
    await waitFor(() =>
      expect(server.posts.at(-1)).toEqual({ step: 'finish', body: { result: 'problems' } }),
    );
  });
});
