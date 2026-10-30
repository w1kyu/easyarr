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
  };
  const posts: { step: string; body: unknown }[] = [];
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
  return { db, posts, fetchMock };
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
  it('walks through steps 1–4 and saves each one', async () => {
    const router = renderAt('/setup');
    await screen.findByRole('heading', { name: 'Welcome to EasyArr' });
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
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

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(server.posts.map((p) => p.step)).toEqual(['welcome', 'system', 'account', 'download']);
    expect(server.posts[2]?.body).toEqual({ username: 'kevin', password: 'summer-rain7' });
    expect(server.db.answers.download).toEqual({ method: 'usenet' });
  });

  it('resumes where the user left off and refuses to skip ahead', async () => {
    server.db.completed = ['welcome', 'system'];
    server.db.answers = { welcome: { started: true }, system: { acknowledgedProblems: false } };
    const router = renderAt('/setup/download');
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(router.state.location.pathname).toBe('/setup/account');
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
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
