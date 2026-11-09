import { APP_NAME } from '@easyarr/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { Logo } from '~/components/logo';
import { Wallpaper } from '~/components/wallpaper';
import { api } from '~/lib/api';

export function Layout() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });
  return (
    <div className="relative flex min-h-dvh flex-col text-white">
      <Wallpaper />
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pt-6 pb-4 md:px-8 md:pt-10">
        {/* The logo + name always lead back to the home screen (or the wizard's current step). */}
        <Link
          to="/"
          aria-label={t('app.home', { name: APP_NAME })}
          data-testid="home-link"
          className="-m-1.5 flex min-w-0 items-center gap-3 rounded-20 p-1.5 transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden"
        >
          <Logo size={44} />
          <div className="min-w-0">
            <h1 className="text-20 leading-tight font-bold -tracking-3 md:text-24">{APP_NAME}</h1>
            <p className="truncate text-13 text-white/60">{t('app.tagline')}</p>
          </div>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 md:px-8">
        <Outlet />
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-6 text-12 text-white/40 md:px-8">
        {health.data && <span>{t('footer.version', { version: health.data.version })}</span>}
        <a
          className="underline-offset-4 hover:text-white/70 hover:underline"
          href="/licenses/NOTICE.md"
        >
          {t('footer.licenses')}
        </a>
        <span>{t('footer.notAffiliated')}</span>
      </footer>
    </div>
  );
}
