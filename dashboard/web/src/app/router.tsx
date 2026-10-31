import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { Loading } from '@/components/ui/loading';
import { DocsPage } from '~/features/docs/docs-page';
import { SetupIndex, WizardPage } from '~/features/wizard/wizard-page';
import { Start } from './home';
import { Layout } from './layout';
import { NotFound } from './not-found';
import { Unavailable } from './unavailable';

// The component showcase only exists in dev builds (tree-shaken from production).
const DevUi = import.meta.env.DEV ? lazy(() => import('./dev-ui')) : null;

const children: RouteObject[] = [
  { index: true, element: <Start /> },
  { path: 'setup', element: <SetupIndex /> },
  { path: 'setup/:stepId', element: <WizardPage /> },
  { path: 'help/*', element: <DocsPage /> },
  { path: 'unavailable/:service', element: <Unavailable /> },
  ...(DevUi
    ? [
        {
          path: 'dev/ui',
          element: (
            <Suspense fallback={<Loading />}>
              <DevUi />
            </Suspense>
          ),
        },
      ]
    : []),
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter([{ path: '/', element: <Layout />, children }]);
