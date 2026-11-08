/**
 * The coach's server routes (story 31): each path the page asks for, and the handler for each
 * method. The paths are the ones the page has always used; the handlers live in src/api and take
 * a Request (plus the path's parameters) and return a Response.
 */
import * as coachFeedback from "@/api/coach-feedback";
import * as coachFeedbackFile from "@/api/coach-feedback-file";
import * as coachGoal from "@/api/coach-goal";
import * as coachKeys from "@/api/coach-keys";
import * as coachNote from "@/api/coach-note";
import * as coachProvider from "@/api/coach-provider";
import * as coachProviderCheck from "@/api/coach-provider-check";
import * as coachRating from "@/api/coach-rating";
import * as coachRestart from "@/api/coach-restart";
import * as copilotkit from "@/api/copilotkit";
import * as curriculumFigure from "@/api/curriculum-figure";
import * as curriculumMap from "@/api/curriculum-map";
import * as curriculumStep from "@/api/curriculum-step";
import * as curriculumStory from "@/api/curriculum-story";
import * as health from "@/api/health";
import * as providerKeys from "@/api/provider-keys";

export const METHODS = ["GET", "POST", "DELETE"] as const;
export type Method = (typeof METHODS)[number];
export type Params = Record<string, string>;
type Context = { params: Promise<Params> };
type Reply = Response | Promise<Response>;
/**
 * A handler module: some of GET, POST and DELETE, each given the request and its path
 * parameters. Method signatures, so a handler may name the parameters its path has.
 */
export interface HandlerModule {
  GET?(req: Request, ctx: Context): Reply;
  POST?(req: Request, ctx: Context): Reply;
  DELETE?(req: Request, ctx: Context): Reply;
}

/** Path patterns use `:name` for a parameter, as Bun.serve does. */
export const ROUTES: Record<string, HandlerModule> = {
  "/api/health": health,
  "/api/copilotkit": copilotkit,
  "/api/provider-keys": providerKeys,
  "/api/coach-keys": coachKeys,
  "/api/coach-provider": coachProvider,
  "/api/coach-provider/check": coachProviderCheck,
  "/api/coach-rating": coachRating,
  "/api/coach-note": coachNote,
  "/api/coach-feedback": coachFeedback,
  "/api/coach-feedback-file": coachFeedbackFile,
  "/api/coach-restart": coachRestart,
  "/api/coach-goal": coachGoal,
  "/api/curriculum/map": curriculumMap,
  "/api/curriculum/figure/:id": curriculumFigure,
  "/api/curriculum/story/:id": curriculumStory,
  "/api/curriculum/step/:station/:step": curriculumStep,
};

export const METHOD_NOT_ALLOWED = 405;

/** Answer a request for one route: its method's handler, or 405 naming the methods it has. */
export function dispatch(mod: HandlerModule, req: Request, params: Params): Reply {
  const handler = (METHODS as readonly string[]).includes(req.method) ? mod[req.method as Method] : undefined;
  if (!handler) {
    const allow = METHODS.filter((m) => mod[m]).join(", ");
    return new Response("Method not allowed", { status: METHOD_NOT_ALLOWED, headers: { Allow: allow } });
  }
  return handler.call(mod, req, { params: Promise.resolve(params) });
}
