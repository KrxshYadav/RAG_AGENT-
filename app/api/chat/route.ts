import { createResource } from '@/lib/actions/resources';
import {
  convertToModelMessages,
  streamText,
  tool,
  UIMessage,
  stepCountIs,
} from 'ai';
import { z } from 'zod';
import { google } from '@ai-sdk/google';
import { findRelevantContent } from '@/lib/ai/embedding';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Deterministic RAG: always search the knowledge base for the latest user
  // question and inject the results into the system prompt. Relying on the model
  // to *decide* to call a retrieval tool is unreliable with gemini-flash-lite —
  // it often skips the tool on the first message of a brand-new conversation, so
  // DB content is never searched. Doing it here guarantees it runs every time.
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const userQuestion =
    lastUserMessage?.parts
      ?.map(p => (p.type === 'text' ? p.text : ''))
      .join(' ')
      .trim() ?? '';

  let knowledgeBase = 'No relevant information found in the knowledge base.';
  if (userQuestion) {
    const relevant = await findRelevantContent(userQuestion);
    if (relevant.found) {
      knowledgeBase = relevant.content.map(c => `- ${c.name}`).join('\n');
    }
  }

  const result = streamText({
    model: google('gemini-2.5-flash-lite'),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    system: `You are a helpful assistant. The current date and time is ${new Date().toString()}.

Here is information retrieved from the knowledge base for the user's latest question:
<knowledge_base>
${knowledgeBase}
</knowledge_base>

- If the knowledge base above contains information relevant to the question, answer using it.
- If it does not, answer using your own general knowledge. Do NOT refuse just because the knowledge base is empty.
- For live data you cannot access (today's news, sports results, prices, weather), tell the user honestly that you don't have real-time web access instead of guessing.
- If the user shares a new fact they want remembered, use the addResource tool to save it to the knowledge base.`,
    tools: {
      addResource: tool({
        description: `add a resource to your knowledge base.
          If the user provides a random piece of knowledge unprompted, use this tool without asking for confirmation.`,
        inputSchema: z.object({
          content: z
            .string()
            .describe('the content or resource to add to the knowledge base'),
        }),
        execute: async ({ content }) => createResource({ content }),
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    onError: error => {
      // Surface a clear, user-facing message when Gemini's API quota / rate
      // limit is hit (HTTP 429 / RESOURCE_EXHAUSTED) instead of a generic
      // "An error occurred".
      const message = error instanceof Error ? error.message : String(error);

      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined;

      const isRateLimited =
        status === 429 ||
        /quota|rate limit|resource[_ ]exhausted|too many requests/i.test(
          message,
        );

      if (isRateLimited) {
        return '⚠️ Gemini API limit reached — you have exceeded your current quota or rate limit. Please wait a moment and try again, or check your API plan and billing.';
      }

      return message || 'Something went wrong. Please try again.';
    },
  });
}
