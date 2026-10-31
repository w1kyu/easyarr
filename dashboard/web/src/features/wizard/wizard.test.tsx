import '~/lib/i18n';
import {
  accountInputSchema,
  canOpenWizardStep,
  evaluateSystem,
  nextWizardStep,
  visibleWizardSteps,
  type SystemInfo,
  type WizardAnswers,
  type WizardView,
} from '@easyarr/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/system-check') return json(evaluateSystem(info));
    if (url === '/api/wizard') return json(view());
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
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
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

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
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
    expect(screen.getByText('Step 3 of 5')).toBeTruthy();
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
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
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
    await screen.findByText(/A password is already saved/);
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
});
