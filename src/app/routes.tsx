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
const DrillsPage = lazy(() => import('@/features/drills/DrillsPage'));
const CoordinatesDrill = lazy(() => import('@/features/drills/CoordinatesDrill'));
const VisionDrill = lazy(() => import('@/features/drills/VisionDrill'));
const EndgameDrillPage = lazy(() => import('@/features/drills/EndgameDrillPage'));
const OpeningsPage = lazy(() => import('@/features/openings/OpeningsPage'));
const RepertoirePage = lazy(() => import('@/features/openings/RepertoirePage'));
const MyGamesPage = lazy(() => import('@/features/games/MyGamesPage'));
const CoursePage = lazy(() => import('@/features/learn/CoursePage'));
const RecallPage = lazy(() => import('@/features/learn/RecallPage'));
const StudiesPage = lazy(() => import('@/features/studies/StudiesPage'));
const StudyPage = lazy(() => import('@/features/studies/StudyPage'));
const ClassicsPage = lazy(() => import('@/features/classics/ClassicsPage'));
const ClassicGamePage = lazy(() => import('@/features/classics/ClassicGamePage'));
const ReferencePage = lazy(() => import('@/features/reference/ReferencePage'));
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
      { path: 'learn/course/:courseId', element: <CoursePage /> },
      { path: 'learn/recall', element: <RecallPage /> },
      { path: 'learn/:lessonId', element: <LessonPage /> },
      { path: 'puzzles', element: <PuzzlesPage /> },
      { path: 'puzzles/:mode', element: <PuzzlesPage /> },
      { path: 'play', element: <PlayPage /> },
      { path: 'analyze', element: <AnalyzePage /> },
      { path: 'drills', element: <DrillsPage /> },
      { path: 'drills/coordinates', element: <CoordinatesDrill /> },
      { path: 'drills/vision', element: <VisionDrill /> },
      { path: 'drills/endgame/:drillId', element: <EndgameDrillPage /> },
      { path: 'openings', element: <OpeningsPage /> },
      { path: 'openings/:repertoireId', element: <RepertoirePage /> },
      { path: 'games', element: <MyGamesPage /> },
      { path: 'studies', element: <StudiesPage /> },
      { path: 'studies/:studyId', element: <StudyPage /> },
      { path: 'classics', element: <ClassicsPage /> },
      { path: 'classics/:gameId', element: <ClassicGamePage /> },
      { path: 'reference', element: <ReferencePage /> },
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
