import { lazy } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Shell } from './Shell';

// Each feature is its own chunk so the first paint stays small.
const HomePage = lazy(() => import('@/features/home/HomePage'));
const LearnPage = lazy(() => import('@/features/learn/LearnPage'));
const LessonPage = lazy(() => import('@/features/learn/LessonPage'));
const PuzzlesPage = lazy(() => import('@/features/puzzles/PuzzlesPage'));
const PlayPage = lazy(() => import('@/features/play/PlayPage'));
const AnalyzePage = lazy(() => import('@/features/analyze/AnalyzePage'));
const ProgressPage = lazy(() => import('@/features/progress/ProgressPage'));
const NotFoundPage = lazy(() => import('@/features/home/NotFoundPage'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'learn', element: <LearnPage /> },
      { path: 'learn/:lessonId', element: <LessonPage /> },
      { path: 'puzzles', element: <PuzzlesPage /> },
      { path: 'puzzles/:mode', element: <PuzzlesPage /> },
      { path: 'play', element: <PlayPage /> },
      { path: 'analyze', element: <AnalyzePage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'settings', element: <Navigate to="/progress#settings" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** Strips the trailing slash Vite adds so react-router gets "/repo" instead of "/repo/". */
export const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function createAppRouter() {
  return createBrowserRouter(routes, { basename: routerBasename });
}
