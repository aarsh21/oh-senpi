import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

interface WebSearchInput extends Record<string, unknown> {
  provider?: string;
  workflow?: string;
}

const DISABLED_WEB_ACCESS_TOOLS = new Set([
  "fetch_content",
  "get_search_content",
]);

export default function webSearchOnly(pi: ExtensionAPI) {
  const applyToolFilter = () => {
    pi.setActiveTools(
      pi
        .getActiveTools()
        .filter((name) => !DISABLED_WEB_ACCESS_TOOLS.has(name)),
    );
  };

  pi.on("session_start", applyToolFilter);
  pi.on("session_tree", applyToolFilter);
  pi.on("tool_call", (event) => {
    if (
      !isToolCallEventType<"web_search", WebSearchInput>("web_search", event)
    ) {
      return;
    }

    event.input.provider = "openai";
    event.input.workflow = "none";
  });
}
