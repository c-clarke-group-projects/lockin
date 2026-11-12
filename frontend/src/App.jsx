import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { JoinPage } from './pages/JoinPage';
import { BigScreenLobby } from './pages/BigScreenLobby';
import { HostAuthPage } from './pages/host/HostAuthPage';
import { HostDashboardPage } from './pages/host/HostDashboardPage';
import { QuizEditorPage } from './pages/host/QuizEditorPage';
import { HostLiveRoomPage } from './pages/host/HostLiveRoomPage';
import { RequireHost } from './components/RequireHost';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { FlaggedQuestionsPage } from './pages/FlaggedQuestionsPage';

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Participants */}
        <Route path="/" element={<Navigate to="/join" replace />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />

        {/* Hosts */}
        <Route path="/host/login" element={<HostAuthPage />} />
        <Route path="/host/register" element={<HostAuthPage />} />
        <Route path="/host" element={<RequireHost><HostDashboardPage /></RequireHost>} />
        <Route path="/host/dashboard" element={<Navigate to="/host" replace />} />
        <Route path="/host/quiz/:id" element={<RequireHost><QuizEditorPage /></RequireHost>} />
        <Route path="/host/room/:sessionId" element={<RequireHost><HostLiveRoomPage /></RequireHost>} />

        {/* Big screen lobby */}
        <Route path="/big-screen" element={<BigScreenLobby />} />
        <Route path="/big-screen/:code" element={<BigScreenLobby />} />

        {/* Leaderboard */}
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/leaderboard/:code" element={<LeaderboardPage />} />
        <Route
          path="/host/sessions/:sessionId/flags"
          element={<FlaggedQuestionsPage />}
        />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
