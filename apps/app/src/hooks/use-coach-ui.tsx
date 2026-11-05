"use client";

import { z } from "zod";
import {
  UseAgentUpdate,
  useAgent,
  useComponent,
  useDefaultRenderTool,
  useFrontendTool,
  useHumanInTheLoop,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import { ToolReasoning } from "@/components/tool-rendering";
import { CoachNote, QUIET_TOOLS, coachNoteText } from "@/components/coach/coach-note";
import type { CardStatus } from "@/components/coach/card";
import { StoryCard } from "@/components/coach/story";
import { StepCard } from "@/components/coach/step-card";
import { NumberCard, detectPlatform } from "@/components/coach/number-card";
import { CheckResult } from "@/components/coach/check-result";
import { TubeMap, type MapStation } from "@/components/coach/tube-map";
import { RunConfirm } from "@/components/coach/run-confirm";
import { ConsentCard } from "@/components/coach/consent-card";
import { RecapCard } from "@/components/coach/recap-card";
import { TerminalTranscript } from "@/components/coach/terminal-transcript";
import "@/components/coach/coach.css";

/**
 * Every coach card, registered with CopilotKit (docs/design.md, Frontend design).
 * The components under components/coach/ never import CopilotKit; this file is
 * the only place they meet it.
 */

const StoryParams = z.object({
  story_id: z.string(),
  question: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const StepParams = z.object({
  station_id: z.string(),
  step_id: z.string(),
  text: z.string(),
  where: z.string(),
  hint: z.string().optional(),
  has_do_it: z.boolean(),
  figure: z.string().optional(),
});

const NumberParams = z.object({
  station_id: z.string().optional(),
  step_id: z.string().optional(),
  prompt: z.string(),
  unit: z.literal("GB"),
  hint: z.string().optional(),
  figure: z.string().optional(),
});

const RunConfirmParams = z.object({ cmd: z.string(), explain: z.string() });

const ConsentParams = z.object({
  station_id: z.string().optional(),
  step_id: z.string().optional(),
  typed: z.number().optional(),
  items: z.array(z.string()),
  history_item: z.string().optional(),
});

const RecapParams = z.object({
  item_id: z.string(),
  question: z.string(),
  kind: z.enum(["recap", "redo"]),
  options: z.array(z.string()).optional(),
});

const EvidenceSchema = z.object({ probe: z.string(), cmd: z.string(), matched: z.array(z.string()) });

export const CheckResultParams = z.object({
  station_id: z.string(),
  step_id: z.string(),
  passed: z.boolean(),
  checked: z.boolean().optional(),
  evidence: z.array(EvidenceSchema),
  note: z.string().optional(),
  measured: z.unknown().optional(),
});

export const ShowMapParams = z.object({ focus: z.string().optional() });

const RunDoItParams = z.object({
  station_id: z.string().optional(),
  step_id: z.string().optional(),
  cmd: z.string().optional(),
});

const SandboxEventParams = z.object({ step_id: z.string(), event: z.record(z.string(), z.unknown()) });

/** Tools whose calls show the upstream reasoning card, so nothing the coach does is silent. */
const SILENT_TOOLS = new Set<string>(["run_check"]);

const RunCheckParams = z.object({ station_id: z.string(), step_id: z.string() });

type RunCheckVerdict = z.infer<typeof CheckResultParams>;

/** run_check's result as the check card; a request for permission or a rubric draws nothing. */
export function RunCheckResult({ result }: { result?: string }) {
  let verdict: Partial<RunCheckVerdict> | null = null;
  try {
    verdict = result ? (JSON.parse(result) as Partial<RunCheckVerdict>) : null;
  } catch {
    verdict = null;
  }
  if (!verdict || typeof verdict.passed !== "boolean" || !Array.isArray(verdict.evidence)) return null;
  return (
    <CheckResult
      stationId={verdict.station_id}
      stepId={verdict.step_id}
      passed={verdict.passed}
      checked={verdict.checked}
      evidence={verdict.evidence}
      note={verdict.note}
    />
  );
}

function platform() {
  return typeof navigator === "undefined" ? "other" : detectPlatform(navigator.userAgent);
}

/** Re-render the map on state changes only, not on every streamed message. */
const MAP_UPDATES = [UseAgentUpdate.OnStateChanged];

/** The map reads the coach's progress snapshot from agent state, not from the model's args. */
function ShowMap({ focus }: { focus?: string }) {
  const { agent } = useAgent({ updates: MAP_UPDATES });
  const snapshot = (agent.state as { progress_snapshot?: MapStation[] } | undefined)?.progress_snapshot;
  return <TubeMap stations={Array.isArray(snapshot) ? snapshot : undefined} focus={focus} />;
}

export const useCoachUI = () => {
  useHumanInTheLoop({
    name: "story",
    description: "Show a story from the curriculum, with one closing question. Returns {read, answer}.",
    parameters: StoryParams,
    render: ({ args, status, respond, result }) => (
      <StoryCard
        storyId={args.story_id}
        question={args.question}
        options={args.options}
        status={status as CardStatus}
        respond={respond ? (value) => void respond(value) : undefined}
        result={result}
      />
    ),
  });

  useHumanInTheLoop({
    name: "step_card",
    description: "Show one lesson step. Returns {action: claim | do_it | skip}.",
    parameters: StepParams,
    render: ({ args, status, respond, result }) => (
      <StepCard
        stationId={args.station_id}
        stepId={args.step_id}
        text={args.text}
        where={args.where}
        hint={args.hint}
        hasDoIt={args.has_do_it}
        figure={args.figure || undefined}
        status={status as CardStatus}
        respond={respond ? (value) => void respond(value) : undefined}
        result={result}
      />
    ),
  });

  useHumanInTheLoop({
    name: "number_card",
    description: "Ask the learner for their memory number in GB. Returns {value}.",
    parameters: NumberParams,
    render: ({ args, status, respond, result }) => (
      <NumberCard
        prompt={args.prompt}
        unit={args.unit}
        hint={args.hint}
        figure={args.figure || undefined}
        platform={platform()}
        status={status as CardStatus}
        respond={respond ? (value) => void respond(value) : undefined}
        result={result}
      />
    ),
  });

  useHumanInTheLoop({
    name: "consent_card",
    description: "Ask once, before the first look at this computer, listing exactly what may be read. Returns {allow, history}.",
    parameters: ConsentParams,
    render: ({ args, status, respond, result }) => (
      <ConsentCard
        items={args.items}
        historyItem={args.history_item}
        status={status as CardStatus}
        respond={respond ? (value) => void respond(value) : undefined}
        result={result}
      />
    ),
  });

  useHumanInTheLoop({
    name: "run_confirm",
    description: "Show the exact command before the coach runs it. Returns {confirmed}.",
    parameters: RunConfirmParams,
    render: ({ args, status, respond, result }) => (
      <RunConfirm
        cmd={args.cmd}
        explain={args.explain}
        status={status as CardStatus}
        respond={respond ? (value) => void respond(value) : undefined}
        result={result}
      />
    ),
  });

  useHumanInTheLoop({
    name: "recap_card",
    description: "One recap question or a 'now you' redo. Returns {answer} or {skipped: true}.",
    parameters: RecapParams,
    render: ({ args, status, respond, result }) => (
      <RecapCard
        itemId={args.item_id}
        question={args.question}
        kind={args.kind}
        options={args.options}
        status={status as CardStatus}
        respond={respond ? (value) => void respond(value) : undefined}
        result={result}
      />
    ),
  });

  useComponent({
    name: "check_result",
    description: "Show a check's result and exactly what was looked at.",
    parameters: CheckResultParams,
    render: ({ station_id, step_id, passed, checked, evidence, note }) => (
      <CheckResult stationId={station_id} stepId={step_id} passed={passed} checked={checked} evidence={evidence} note={note} />
    ),
  });

  useComponent({
    name: "show_map",
    description: "Show the learner's map with each V1 station's status.",
    parameters: ShowMapParams,
    render: ({ focus }) => <ShowMap focus={focus} />,
  });

  // The real coach (Ceetrix story 10): the check card is drawn from run_check's own
  // result, so the learner always sees what was really run, not a copy.
  useRenderTool({
    name: "run_check",
    parameters: RunCheckParams,
    render: ({ result }) => <RunCheckResult result={result} />,
  });

  useRenderTool({
    name: "run_do_it",
    parameters: RunDoItParams,
    render: ({ parameters, status, result }) => (
      <TerminalTranscript cmd={parameters.cmd ?? ""} output={result ?? ""} status={status as CardStatus} />
    ),
  });

  useFrontendTool({
    name: "sandbox_event",
    description: "Not for the model: the practice terminal reports what the learner typed.",
    parameters: SandboxEventParams,
    handler: async () => "recorded",
  });

  useDefaultRenderTool({
    render: ({ name, status, parameters }) => {
      if (SILENT_TOOLS.has(name) || QUIET_TOOLS.has(name)) return <></>;
      const note = coachNoteText(name, (parameters ?? {}) as Record<string, unknown>);
      if (note) return <CoachNote text={note} status={status} />;
      return <ToolReasoning name={name} status={status} args={parameters} />;
    },
  });
};
