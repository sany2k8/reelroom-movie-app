import { Router } from "express";
import { z } from "zod";
import {
  createRequest,
  deleteRequest,
  listRequests,
  resolveRequest,
  voteRequest,
} from "../services/requests.js";
import { HttpError } from "../middleware/errors.js";

export const requestsRouter = Router();

const createSchema = z.object({
  title: z.string().trim().min(1, "What should we add?").max(120),
  year: z.coerce.number().int().min(1880).max(2100).optional().nullable(),
  note: z.string().trim().max(400).optional(),
});

requestsRouter.get("/", (req, res) => {
  const status = req.query.status;
  const filter = ["open", "fulfilled", "declined"].includes(status) ? status : null;
  res.json({ items: listRequests(req.profile.id, filter) });
});

requestsRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, "INVALID_INPUT");

  try {
    res.status(201).json(createRequest({ profileId: req.profile.id, ...parsed.data }));
  } catch (err) {
    if (err.code === "DUPLICATE_REQUEST") throw new HttpError(409, err.message, err.code);
    throw err;
  }
});

requestsRouter.put("/:id/vote", (req, res) => {
  const active = req.body?.active !== false;
  voteRequest({ requestId: Number(req.params.id), profileId: req.profile.id, active });
  res.json({ active });
});

/** A requester can withdraw their own; an admin can remove any. */
requestsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const mine = listRequests(req.profile.id).find((r) => r.id === id);
  if (!mine) throw new HttpError(404, "Request not found", "NOT_FOUND");
  if (mine.profileId !== req.profile.id && !req.profile.isAdmin) {
    throw new HttpError(403, "That isn't your request", "FORBIDDEN");
  }
  res.json({ removed: deleteRequest(id) });
});

const resolveSchema = z.object({
  status: z.enum(["fulfilled", "declined", "open"]),
  movieId: z.string().optional().nullable(),
});

requestsRouter.put("/:id/status", (req, res) => {
  if (!req.profile.isAdmin) throw new HttpError(403, "Admins only", "FORBIDDEN");

  const parsed = resolveSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, "INVALID_INPUT");

  res.json(
    resolveRequest({
      id: Number(req.params.id),
      status: parsed.data.status,
      movieId: parsed.data.movieId ?? null,
      resolvedBy: req.profile.id,
    }),
  );
});
