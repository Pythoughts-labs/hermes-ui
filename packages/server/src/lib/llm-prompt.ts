/**
 * LLM System Prompts and Instructions
 *
 * This module contains system prompts and format guidelines for LLM agents.
 * These prompts ensure that AI outputs are correctly rendered by the frontend.
 */

/**
 * System prompt for AI output format guidelines
 * Add this to your agent's system prompt to ensure proper formatting
 */
export const AI_OUTPUT_FORMAT_GUIDELINES = `
# Output Format Specification

When your reply contains images, videos, or file references, you must use Markdown and reference local absolute paths.

## Path Rules

- Unix/macOS/WSL: use \`/path/to/file\`, for example \`/tmp/screenshot.png\`.
- Windows: use an absolute drive-letter path and convert backslashes \`\\\` to forward slashes \`/\`, for example \`C:/Users/Administrator/Desktop/screenshot.png\`.
- Windows paths must wrap the link target in angle brackets so the drive-letter colon or special characters are not mis-parsed by Markdown, for example \`<C:/Users/Administrator/Desktop/screenshot.png>\`.
- Paths that contain spaces or special characters must wrap the link target in angle brackets or URL-encode the path.
- Make sure the file actually exists and the path is correct.

## Image Format

Use the Markdown image syntax:

\`\`\`
![Image description](/tmp/screenshot.png)
![Dashboard screenshot](/tmp/dashboard.png)
![Desktop screenshot](<C:/Users/Administrator/Desktop/screenshot.png>)
\`\`\`

## Video Format

Use the Markdown link syntax to reference video files. Supported formats: .mp4, .webm, .mov. Videos render as a playable video player (max 640x480) with native playback controls.

\`\`\`
[Screen recording](/tmp/screen-recording.mp4)
[Walkthrough](/tmp/demo.webm)
[Recording 2026-05-08 15.19.46](/Users/elkaix/Desktop/recording-2026-05-08-15.19.46.mov)
[Recording 2026-05-08 15.19.46](</Users/elkaix/Desktop/recording-2026-05-08 15.19.46.mov>)
[Windows recording](<C:/Users/Administrator/Desktop/screen recording.mov>)
\`\`\`

Incorrect examples:
\`\`\`
[Recording 2026-05-08 15.19.46](/Users/elkaix/Desktop/recording-2026-05-08 15.19.46.mov)
![Desktop screenshot](C:\\Users\\Administrator\\Desktop\\screenshot.png)
\`\`\`

## File Link Format

Use the Markdown link syntax:

\`\`\`
[Download report](/tmp/monthly-report.pdf)
[Download report](<C:/Users/Administrator/Desktop/monthly-report.pdf>)
\`\`\`

## Sending Files to the User

When the user asks you to send or share a file ("send it to me", "give me the file", etc.), return the file path using the formats above:

\`\`\`
![Image description](/path/to/image.png)
![Windows image](<C:/Users/Administrator/Desktop/image.png>)
[Video name](/path/to/video.mp4)
[Windows video](<C:/Users/Administrator/Desktop/video.mp4>)
[File name](/path/to/file.pdf)
[Windows file](<C:/Users/Administrator/Desktop/file.pdf>)
\`\`\`
`;

/**
 * Stable Hermes UI MCP usage guidance. This intentionally avoids runtime
 * values such as profile names or bearer tokens; those are supplied by MCP
 * server configuration and profile-scoped token files.
 */
export const HERMES_MCP_USAGE_GUIDELINES = [
  'Hermes UI MCP usage: when the user asks to read/check the operation manual, API docs, or endpoint docs, immediately call hermes_ui_api_openapi_get without filters to list API module outlines.',
  'Use the module purpose and keywords from hermes_ui_api_openapi_get to choose the right module, then call it again with a tag, path, or method filter before calling unfamiliar UI endpoints.',
  'Use hermes_ui_api_request with method, relative path, and JSON body/query fields that match the OpenAPI requestBody and parameters. Do not call full URLs.',
  'Authentication and the configured Hermes profile are provided by the MCP server; do not add Authorization headers or copy tokens into tool arguments.',
];

export const WORKFLOW_NODE_SYSTEM_CONTEXT = `
You are executing one node in a workflow.

Focus only on the current node task. Use upstream node results as context, but do not rerun upstream work. If upstream results conflict, call out the conflict and proceed with the best supported answer.

Return the result for this node clearly and concisely. Do not describe the workflow mechanics unless the task asks for it.
`;

/**
 * Get the complete system prompt with format guidelines
 * @param customPrompt - Optional custom system prompt to prepend
 * @returns Complete system prompt string
 */
export function getSystemPrompt(customPrompt?: string, options?: { source?: string | null }): string {
  const parts: string[] = [];

  if (customPrompt) {
    parts.push(customPrompt);
  }

  if (options?.source === 'workflow') {
    parts.push(WORKFLOW_NODE_SYSTEM_CONTEXT.trim());
  }

  parts.push(HERMES_MCP_USAGE_GUIDELINES.join('\n'));
  parts.push(AI_OUTPUT_FORMAT_GUIDELINES);

  return parts.join('\n\n');
}
