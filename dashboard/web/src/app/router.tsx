import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { Loading } from '@/components/ui/loading';
import { Home } from './home';
import { Layout } from './layout';
import { NotFound } from './not-found';

// The component showcase only exists in dev builds (tree-shaken from production).
const DevUi = import.meta.env.DEV ? lazy(() => import('./dev-ui')) : null;

const children: RouteObject[] = [
  { index: true, element: <Home /> },
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
