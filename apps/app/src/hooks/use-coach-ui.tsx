"use client";

import { z } from "zod";
import {
  useAgent,
  useComponent,
  useDefaultRenderTool,
  useFrontendTool,
  useHumanInTheLoop,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import { ToolReasoning } from "@/components/tool-rendering";
import type { CardStatus } from "@/components/coach/card";
import { StoryCard } from "@/components/coach/story";
import { StepCard } from "@/components/coach/step-card";
import { NumberCard, detectPlatform } from "@/components/coach/number-card";
import { CheckResult } from "@/components/coach/check-result";
import { TubeMap, type MapStation } from "@/components/coach/tube-map";
import { RunConfirm } from "@/components/coach/run-confirm";
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
});

const NumberParams = z.object({
  station_id: z.string().optional(),
  step_id: z.string().optional(),
  prompt: z.string(),
  unit: z.literal("GB"),
  hint: z.string().optional(),
});

const RunConfirmParams = z.object({ cmd: z.string(), explain: z.string() });

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
  evidence: z.array(EvidenceSchema),
  note: z.string().optional(),
});

export const ShowMapParams = z.object({ focus: z.string().optional() });

const RunDoItParams = z.object({
  station_id: z.string().optional(),
  step_id: z.string().optional(),
  cmd: z.string().optional(),
});

const SandboxEventParams = z.object({ step_id: z.string(), event: z.record(z.string(), z.unknown()) });

/** Tools whose calls show the upstream reasoning card, so nothing the coach does is silent. */
const SILENT_TOOLS = new Set<string>();

function platform() {
  return typeof navigator === "undefined" ? "other" : detectPlatform(navigator.userAgent);
}

/** The map reads the coach's progress snapshot from agent state, not from the model's args. */
function ShowMap({ focus }: { focus?: string }) {
  const { agent } = useAgent();
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
        platform={platform()}
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
    render: ({ station_id, step_id, passed, evidence, note }) => (
      <CheckResult stationId={station_id} stepId={step_id} passed={passed} evidence={evidence} note={note} />
    ),
  });

  useComponent({
    name: "show_map",
    description: "Show the learner's map with each V1 station's status.",
    parameters: ShowMapParams,
    render: ({ focus }) => <ShowMap focus={focus} />,
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
      if (SILENT_TOOLS.has(name)) return <></>;
      return <ToolReasoning name={name} status={status} args={parameters} />;
    },
  });
};
