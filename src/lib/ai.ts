import "server-only";

/**
 * Turns one or more reference photos into a suggested request description.
 * This module is server-only: importing it from a client component is a
 * build error, which is how the API key stays out of the browser bundle.
 */
const STUB =
  "Reference photos attached. (AI description is unavailable until an API key is configured.) Describe the garment, fabric, colour, fit and the details you want.";

const PROMPT =
  "You are helping a customer brief a bespoke tailor. Look at these reference photos of the same garment (or the same idea from several angles) and write a 2 to 4 sentence request describing the garment type, fabric and colour, cut and fit, and any notable details (lapels, pockets, buttons, hem). Write in the first person as the customer, plainly, with no preamble and no bullet points.";

export interface ImageInput {
  bytes: Buffer;
  mime: string;
}

export async function describePhotos(images: ImageInput[]): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return STUB;
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "MyTailor",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.bytes.toString("base64")}` } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter responded ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim();
  return text || STUB;
}
