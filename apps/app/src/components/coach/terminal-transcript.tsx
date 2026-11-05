import { CoachCard, type CardStatus } from "./card";

export type TerminalTranscriptProps = {
  cmd?: string;
  output?: string;
  status: CardStatus;
};

/** What `run_do_it` ran in the coach's terminal, kept in the thread (build step 3 fills it). */
export function TerminalTranscript({ cmd = "", output = "", status }: TerminalTranscriptProps) {
  return (
    <CoachCard label={status === "complete" ? "Done for you" : "Running for you"} testId="coach-transcript">
      <pre className="coach-pre coach-pre--terminal" aria-live="polite">
        <code>
          {`$ ${cmd}\n`}
          {output}
          {status !== "complete" && "…"}
        </code>
      </pre>
    </CoachCard>
  );
}
