import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { Shell } from './Shell';

// Each feature is its own chunk so the first paint stays small.
const HomePage = lazy(() => import('@/features/home/HomePage'));
const LearnPage = lazy(() => import('@/features/learn/LearnPage'));
const LessonPage = lazy(() => import('@/features/learn/LessonPage'));
const PuzzlesPage = lazy(() => import('@/features/puzzles/PuzzlesPage'));
const PlayPage = lazy(() => import('@/features/play/PlayPage'));
const LivePage = lazy(() => import('@/features/live/LivePage'));
const LiveGamePage = lazy(() => import('@/features/live/LiveGamePage'));
const AnalyzePage = lazy(() => import('@/features/analyze/AnalyzePage'));
const ProgressPage = lazy(() => import('@/features/progress/ProgressPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const LabPage = lazy(() => import('@/features/lab/LabPage'));
const LichessCallbackPage = lazy(() => import('@/features/settings/LichessCallbackPage'));
const DrillsPage = lazy(() => import('@/features/drills/DrillsPage'));
const CoordinatesDrill = lazy(() => import('@/features/drills/CoordinatesDrill'));
const VisionDrill = lazy(() => import('@/features/drills/VisionDrill'));
const EndgameDrillPage = lazy(() => import('@/features/drills/EndgameDrillPage'));
const ThreatDrillPage = lazy(() => import('@/features/drills/ThreatDrillPage'));
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
const PlacementPage = lazy(() => import('@/features/placement/PlacementPage'));
const PatternsPage = lazy(() => import('@/features/patterns/PatternsPage'));
const ArcadePage = lazy(() => import('@/features/arcade/ArcadePage'));
const HandAndBrainPage = lazy(() => import('@/features/arcade/HandAndBrainPage'));
const DailyOpeningPage = lazy(() => import('@/features/arcade/DailyOpeningPage'));
const WhoStandsBetterPage = lazy(() => import('@/features/arcade/WhoStandsBetterPage'));
const OddsLadderPage = lazy(() => import('@/features/arcade/OddsLadderPage'));
const ArmyDraftPage = lazy(() => import('@/features/arcade/ArmyDraftPage'));
const FortressPage = lazy(() => import('@/features/arcade/FortressPage'));
const EngineSaysPage = lazy(() => import('@/features/arcade/EngineSaysPage'));
const BlindfoldPage = lazy(() => import('@/features/arcade/BlindfoldPage'));
const SimulPage = lazy(() => import('@/features/arcade/SimulPage'));
const ArbiterPage = lazy(() => import('@/features/arcade/ArbiterPage'));
const GhostKnightPage = lazy(() => import('@/features/arcade/GhostKnightPage'));
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
      { path: 'placement', element: <PlacementPage /> },
      { path: 'learn/:lessonId', element: <LessonPage /> },
      { path: 'puzzles', element: <PuzzlesPage /> },
      { path: 'puzzles/:mode', element: <PuzzlesPage /> },
      { path: 'play', element: <PlayPage /> },
      { path: 'play/online', element: <LivePage /> },
      { path: 'play/online/:gameId', element: <LiveGamePage source="relay" /> },
      { path: 'play/online/lichess/:gameId', element: <LiveGamePage source="lichess" /> },
      { path: 'analyze', element: <AnalyzePage /> },
      { path: 'drills', element: <DrillsPage /> },
      { path: 'drills/coordinates', element: <CoordinatesDrill /> },
      { path: 'drills/vision', element: <VisionDrill /> },
      { path: 'drills/threats', element: <ThreatDrillPage /> },
      { path: 'drills/endgame/:drillId', element: <EndgameDrillPage /> },
      { path: 'patterns', element: <PatternsPage /> },
      { path: 'arcade', element: <ArcadePage /> },
      { path: 'arcade/hand-and-brain', element: <HandAndBrainPage /> },
      { path: 'arcade/daily-opening', element: <DailyOpeningPage /> },
      { path: 'arcade/who-stands-better', element: <WhoStandsBetterPage /> },
      { path: 'arcade/odds-ladder', element: <OddsLadderPage /> },
      { path: 'arcade/army-draft', element: <ArmyDraftPage /> },
      { path: 'arcade/fortress', element: <FortressPage /> },
      { path: 'arcade/engine-says', element: <EngineSaysPage /> },
      { path: 'arcade/blindfold', element: <BlindfoldPage /> },
      { path: 'arcade/simul', element: <SimulPage /> },
      { path: 'arcade/arbiter', element: <ArbiterPage /> },
      { path: 'arcade/ghost-knight', element: <GhostKnightPage /> },
      { path: 'openings', element: <OpeningsPage /> },
      { path: 'openings/:repertoireId', element: <RepertoirePage /> },
      { path: 'games', element: <MyGamesPage /> },
      { path: 'studies', element: <StudiesPage /> },
      { path: 'studies/:studyId', element: <StudyPage /> },
      { path: 'classics', element: <ClassicsPage /> },
      { path: 'classics/:gameId', element: <ClassicGamePage /> },
      { path: 'reference', element: <ReferencePage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/lab', element: <LabPage /> },
      { path: 'settings/lichess', element: <LichessCallbackPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** Strips the trailing slash Vite adds so react-router gets "/repo" instead of "/repo/". */
export const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function createAppRouter() {
  return createBrowserRouter(routes, { basename: routerBasename });
}
