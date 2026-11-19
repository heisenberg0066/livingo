import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { LoadingScreen, Mascot, Shell } from "./components/Chrome.tsx";
import { Button } from "./components/ui/button.tsx";
import { AppProvider, useApp } from "./context/AppContext.tsx";
import { AddWordScreen } from "./screens/AddWordScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { NewStreakScreen } from "./screens/NewStreakScreen.tsx";
import { PairScreen } from "./screens/PairScreen.tsx";
import { QuizScreen } from "./screens/QuizScreen.tsx";
import { ConnectScreen, InviteScreen, JoinScreen, StartScreen, WelcomeScreen } from "./screens/StartScreens.tsx";
import { WordScreen } from "./screens/WordScreen.tsx";
import { WordsScreen } from "./screens/WordsScreen.tsx";

export function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/welcome" element={<WelcomeScreen />} />
          <Route path="/start" element={<StartScreen />} />
          <Route path="/join" element={<JoinScreen />} />
          <Route path="/connect" element={<ConnectScreen />} />
          <Route path="/invite" element={<Gate><InviteScreen /></Gate>} />
          <Route path="/" element={<Gate><HomeScreen /></Gate>} />
          <Route path="/add" element={<Gate><AddWordScreen /></Gate>} />
          <Route path="/words" element={<Gate><WordsScreen /></Gate>} />
          <Route path="/words/:wordId" element={<Gate><WordScreen /></Gate>} />
          <Route path="/quiz" element={<Gate><QuizScreen /></Gate>} />
          <Route path="/pair" element={<Gate><PairScreen /></Gate>} />
          <Route path="/streaks/new" element={<Gate><NewStreakScreen /></Gate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { status, me, error } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (status === "ready" && !me) navigate("/welcome", { replace: true });
  }, [status, me, navigate]);
  if (status === "loading") return <LoadingScreen />;
  if (status === "error") {
    return (
      <Shell>
        <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <Mascot className="h-16 w-16" />
          <h1 className="mt-4 font-display text-3xl">Livingo couldn't connect</h1>
          <p className="mt-2 font-bold text-ink/70">{error}</p>
          <Button className="mt-5" type="button" onClick={() => navigate("/connect")}>
            Check connection
          </Button>
        </div>
      </Shell>
    );
  }
  if (!me) return <LoadingScreen />;
  return children;
}
