/**
 * MCP prompts — pre-built, guardrailed prompt templates for connecting models.
 *
 * The templates instruct the model to answer STRICTLY from retrieved citations
 * and to stay inside the GOLD §2 boundary (no dosages, no diagnoses, no
 * medication changes, mandatory disclaimer). The template text itself is
 * guardrail-audited in tests.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DISCLAIMER } from './safety.js';

/** Build the grounded-answer prompt for a user question. Exported for tests. */
export function buildGroundedAnswerPrompt(question: string): string {
  return [
    'You are answering a question with access to the TRT knowledge stack via MCP tools.',
    '',
    `Question: ${question}`,
    '',
    'Method (required):',
    '1. Call search_all with the key concepts of the question to gather cited',
    '   corpus passages and knowledge-graph facts.',
    '2. If a hit looks relevant but truncated, call get_passage with its chunkId',
    '   to read it in full before citing.',
    '3. Answer ONLY from the retrieved material. Cite every claim to its source',
    '   (document title + page, or graph fact). If the corpus does not cover it,',
    '   say so plainly instead of guessing.',
    '',
    'Safety boundary (GOLD §2 — non-negotiable):',
    '- This is clinical decision SUPPORT material, not advice. Do not present',
    '  any medication dosage, schedule, or titration plan as a recommendation,',
    '  even if a source passage contains one; report it strictly as cited',
    '  historical/published source content.',
    '- Do not render a diagnosis. Do not tell anyone to start, stop, or change',
    '  a medication.',
    '- Reference ranges are per-lab/per-assay; never treat one as global.',
    '- Direct all treatment decisions to a qualified healthcare professional.',
    '',
    `End your answer with this exact line: "${DISCLAIMER}"`,
  ].join('\n');
}

/** Register prompt templates on the server. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'trt_knowledge_query',
    {
      title: 'Grounded answer from the TRT knowledge stack',
      description:
        'Answer a question strictly from cited corpus passages and knowledge-graph ' +
        'facts, inside the GOLD §2 safety boundary (no dosages, no diagnoses, ' +
        'mandatory disclaimer).',
      argsSchema: {
        question: z.string().min(3).describe('The question to answer from cited sources'),
      },
    },
    ({ question }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: buildGroundedAnswerPrompt(question) },
        },
      ],
    }),
  );
}
