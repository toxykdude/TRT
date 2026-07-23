/**
 * MCP prompts — pre-built, guardrailed prompt templates for connecting models.
 *
 * The templates instruct the model to answer STRICTLY from retrieved citations
 * and to stay inside the GOLD §2 boundary. Dosages are now ALLOWED (per GOLD
 * §2.3 — removed restrictions). The template text itself is guardrail-audited
 * in tests.
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
    'Safety boundary (GOLD §2):',
    '- This is clinical decision SUPPORT material, not advice.',
    '- You MAY recommend dosages from retrieved protocols (Testosterone,',
    '  Nandrolone, Trenbolone, Boldenone, etc.) and ancillary support (hCG,',
    '  AIs, SERMs/PCT). Report dosages as recommendations based on the',
    '  retrieved evidence.',
    '- You may render provisional diagnoses ("may have", "consistent with")',
    '  when supported by retrieved evidence.',
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
        'facts, inside the GOLD §2 safety boundary (dosages allowed per §2.3, ' +
        'provisional diagnoses allowed, mandatory disclaimer).',
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
