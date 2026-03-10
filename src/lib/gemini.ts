import { generateWithFailover } from "@/lib/gemini-client";

/**
 * Takes a raw meeting transcript and uses Gemini to generate a structured Minutes of Meeting.
 */
export async function generateMoM(transcript: string, meetingTitle: string) {

    const prompt = `
You are an expert executive assistant. I am providing you with the raw transcript from a meeting titled "${meetingTitle}".
Your task is to generate a professional, structured Minutes of Meeting (MoM) from this transcript.

Extract and format exactly the following 3 sections:

### Summary
[Write a concise 2-3 paragraph summary of the main topics discussed, the overall tone, and the primary objective of the meeting.]

### Decisions Made
[Create a bulleted list of any firm decisions, agreements, or conclusions reached by the participants. If none, write "No major decisions recorded."]
- Decision 1
- Decision 2

### Action Items
[Create a numbered list of tasks assigned, including who is responsible (if mentioned) and any deadlines (if mentioned). If none, write "No specific action items."]
1. Action item 1
2. Action item 2

---
TRANSCRIPT:
${transcript}
  `;

    try {
        const text = await generateWithFailover(prompt);

        // Basic parser to split the text back into our database fields
        // This assumes the LLM strictly follows the ### Header structure
        const summaryMatch = text.match(/### Summary\n([\s\S]*?)(?=### Decisions Made)/);
        const decisionsMatch = text.match(/### Decisions Made\n([\s\S]*?)(?=### Action Items)/);
        const actionItemsMatch = text.match(/### Action Items\n([\s\S]*)$/);

        return {
            summary: summaryMatch ? summaryMatch[1].trim() : "Summary could not be generated.",
            decisions: decisionsMatch ? decisionsMatch[1].trim() : "No decisions recorded.",
            actionItems: actionItemsMatch ? actionItemsMatch[1].trim() : "No action items recorded.",
        };
    } catch (error) {
        console.error("Error generating MoM from Gemini:", error);
        throw error;
    }
}
