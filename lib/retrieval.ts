import { getCollection } from "./chroma";
import { embed } from "./embeddings";

export interface RetrievedChunk {
  text: string;
  page: number;
  chunkIndex: number;
}

/**
 * Embed the question (same model as the chunks) and pull the top-k most
 * similar chunks for ONE document. `where: { documentId }` scopes the search
 * so one collection can hold every document.
 */
export async function retrieve(
  documentId: string,
  question: string,
  k = 5,
): Promise<RetrievedChunk[]> {
  const collection = await getCollection();
  const queryEmbedding = await embed(question);

  const res = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: k,
    where: { documentId },
  });

  const docs = res.documents[0] ?? [];
  const metas = res.metadatas[0] ?? [];

  return docs.map((text, i) => ({
    text: text ?? "",
    page: Number(metas[i]?.page ?? 0),
    chunkIndex: Number(metas[i]?.chunkIndex ?? i),
  }));
}
