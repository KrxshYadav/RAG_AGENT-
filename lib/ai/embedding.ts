// import { embedMany } from 'ai';

// const embeddingModel = 'openai/text-embedding-ada-002';

// const generateChunks = (input: string): string[] => {
//   return input
//     .trim()
//     .split('.')
//     .filter(i => i !== '');
// };

// export const generateEmbeddings = async (
//   value: string,
// ): Promise<Array<{ embedding: number[]; content: string }>> => {
//   const chunks = generateChunks(value);
//   const { embeddings } = await embedMany({
//     model: embeddingModel,
//     values: chunks,
//   });
//   return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
// };


import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { db } from '../db';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { embeddings } from '../db/schema/embeddings';

const embeddingModel = google.textEmbeddingModel('gemini-embedding-001');

// gemini-embedding-001 defaults to 3072 dims, but pgvector's HNSW index maxes
// out at 2000. Pin to 1536 so it matches the vector(1536) column and stays
// indexable.
const EMBEDDING_DIMENSIONS = 1536;

const generateChunks = (input: string): string[] => {
  return input
    .trim()
    .split('.')
    .filter(i => i !== '');
};

export const generateEmbeddings = async (
  value: string,
): Promise<Array<{ embedding: number[]; content: string }>> => {
  const chunks = generateChunks(value);
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    },
  });
  return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
};

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll('\\n', ' ');
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: 'RETRIEVAL_QUERY',
      },
    },
  });
  return embedding;
};

export const findRelevantContent = async (userQuery: string) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;
  // gemini-embedding-001 truncated to 1536 dims produces lower absolute cosine
  // scores than OpenAI embeddings, so a 0.5 cutoff filters out genuinely
  // relevant chunks. 0.3 reliably surfaces on-topic content while still
  // excluding unrelated noise.
  const similarGuides = await db
    .select({ name: embeddings.content, similarity })
    .from(embeddings)
    .where(gt(similarity, 0.3))
    .orderBy(t => desc(t.similarity))
    .limit(4);

  // No sufficiently-similar content in the embeddings DB. Signal the caller so
  // the model knows to fall back to its own (Gemini) knowledge instead of
  // treating an empty array as "nothing to say".
  if (similarGuides.length === 0) {
    return {
      found: false as const,
      content: [],
      message:
        'No relevant information found in the knowledge base. Answer the question using your own knowledge.',
    };
  }

  return { found: true as const, content: similarGuides };
};