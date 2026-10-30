import '~/lib/i18n';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Home } from './home';

describe('Home', () => {
  it('lists every included service and the published apps', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('First part of the setup is done')).toBeTruthy();
    expect(screen.getByText('Review your answers').closest('a')?.getAttribute('href')).toBe(
      '/setup/welcome',
    );
    for (const name of ['Sonarr', 'Radarr', 'Jellyfin', 'qBittorrent', 'Unpackerr']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Open Jellyfin').closest('a')?.getAttribute('href')).toMatch(/:39096$/);
  });
});
