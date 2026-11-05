import { useConfigureSuggestions } from "@copilotkit/react-core/v2";

/** The first-run entry points (docs/design.md, Frontend design). */
export const COACH_STARTERS = [
  { title: "Read Priya's story", message: "Read Priya's story" },
  { title: "What can my computer do?", message: "What can my computer do?" },
  { title: "Where am I on the map?", message: "Where am I on the map?" },
] as const;

export const useExampleSuggestions = () => {
  useConfigureSuggestions({
    suggestions: COACH_STARTERS.map(({ title, message }) => ({ title, message })),
    available: "always",
  });
};
