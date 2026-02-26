import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { auth, ensureAnonymousAuth, firebaseConfigError } from "../firebase/client";
import { onAuthStateChanged } from "firebase/auth";

type AuthState = "loading" | "signed-in" | "error";

export function AppShell() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authError, setAuthError] = useState<string>("");

  useEffect(() => {
    if (firebaseConfigError) {
      setAuthError(firebaseConfigError);
      setAuthState("error");
      return;
    }

    let isMounted = true;

    ensureAnonymousAuth()
      .then(() => {
        if (isMounted) setAuthState("signed-in");
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Authentication failed";
        setAuthError(message);
        setAuthState("error");
      });

    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return;
      setAuthState(user ? "signed-in" : "loading");
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Seekv8</div>
        <nav className="nav">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Games
          </NavLink>
        </nav>
      </header>

      <main className="content">
        {authState === "loading" && <p>Signing in...</p>}
        {authState === "error" && (
          <p className="error">Could not authenticate anonymously: {authError}</p>
        )}
        {authState === "signed-in" && <Outlet />}
      </main>
    </div>
  );
}
