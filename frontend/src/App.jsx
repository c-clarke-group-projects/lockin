import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { JoinPage } from './pages/JoinPage';
import { BigScreenLobby } from './pages/BigScreenLobby';
import { LeaderboardPage } from './pages/LeaderboardPage';

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/big-screen" element={<BigScreenLobby />} />
        <Route path="/big-screen/:code" element={<BigScreenLobby />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/leaderboard/:code" element={<LeaderboardPage />} />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
