import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Browse } from "@/pages/Browse";
import { Detail } from "@/pages/Detail";
import { Home } from "@/pages/Home";
import { ListPage } from "@/pages/ListPage";
import { Login } from "@/pages/Login";
import { Requests } from "@/pages/Requests";
import { Admin } from "@/pages/Admin";
import { NotFound } from "@/pages/NotFound";
import { Watch } from "@/pages/Watch";
import { useSession } from "@/store/session";

export default function App() {
  const status = useSession((s) => s.status);
  const check = useSession((s) => s.check);

  useEffect(() => {
    void check();
  }, [check]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber/30 border-t-amber" />
      </div>
    );
  }

  if (status === "anonymous") return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/movies" element={<Browse />} />
          <Route path="/movies/:id" element={<Detail />} />
          <Route path="/watch/:id" element={<Watch />} />
          <Route path="/watchlist" element={<ListPage list="watchlist" />} />
          <Route path="/favourites" element={<ListPage list="favourite" />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/admin" element={<Admin />} />
          {/* Old two-page app linked here; keep the URL alive. */}
          <Route path="/movie.html" element={<Navigate to="/movies" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
