import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 pt-[70px]">
      <div className="panel max-w-md p-10 text-center">
        <p className="font-display text-6xl text-amber">404</p>
        <h1 className="section-title mt-2">Nothing playing here</h1>
        <p className="mt-2 text-sm text-muted">That reel isn't in the library.</p>
        <Link to="/" className="btn-primary mt-6">
          Back to the lobby
        </Link>
      </div>
    </div>
  );
}
