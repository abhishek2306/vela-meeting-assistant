import { generateWithFailover } from "@/lib/gemini-client";

/**
 * Takes a raw meeting transcript and uses Gemini to generate a structured Minutes of Meeting.
 */
export async function generateMoM(transcript: string, meetingTitle: string) {

    const prompt = `
You are an expert executive assistant. I am providing you with the raw transcript from a meeting titled "${meetingTitle}".
Your task is to generate a professional, structured Minutes of Meeting (MoM) from this transcript.

### CRITICAL INSTRUCTIONS:
1. **Language Detection**: Detect the primary language of the transcript. Respond in THAT SAME LANGUAGE unless specifically asked otherwise.
2. **Sentiment Analysis**: Analyze the overall tone, energy, and "vibe" of the meeting (e.g., Collaborative, Urgent, Tense, Productive, etc.).

Extract and format exactly the following 4 sections:

### Summary
[Write a concise 2-3 paragraph summary of the main topics discussed and the primary objective of the meeting.]

### Decisions Made
[Create a bulleted list of any firm decisions, agreements, or conclusions reached by the participants. If none, write "No major decisions recorded."]
- Decision 1
- Decision 2

### Action Items
[Create a numbered list of tasks assigned, including who is responsible (if mentioned) and any deadlines (if mentioned). If none, write "No specific action items."]
1. Action item 1
2. Action item 2

### Sentiment
[Provide a short label and 1-sentence description of the meeting vibe, e.g., "Highly Productive: The team was aligned and moved quickly through all agenda items."]

---
TRANSCRIPT:
${transcript}
  `;

    try {
        const text = await generateWithFailover(prompt);

        // Basic parser to split the text back into our database fields
        const summaryMatch = text.match(/### Summary\n([\s\S]*?)(?=### Decisions Made)/);
        const decisionsMatch = text.match(/### Decisions Made\n([\s\S]*?)(?=### Action Items)/);
        const actionItemsMatch = text.match(/### Action Items\n([\s\S]*?)(?=### Sentiment)/);
        const sentimentMatch = text.match(/### Sentiment\n([\s\S]*)$/);

        return {
            summary: summaryMatch ? summaryMatch[1].trim() : "Summary could not be generated.",
            decisions: decisionsMatch ? decisionsMatch[1].trim() : "No decisions recorded.",
            actionItems: actionItemsMatch ? actionItemsMatch[1].trim() : "No action items recorded.",
            sentiment: sentimentMatch ? sentimentMatch[1].trim() : "Neutral",
        };
    } catch (error) {
        console.error("Error generating MoM from Gemini:", error);
        throw error;
    }
}

/**
 * Generates a daily morning briefing based on schedule and action items.
 */
export async function generateMorningBrief(name: string, events: any[], actionItems: any[]) {
    const prompt = `
You are Vela, a premium AI executive assistant. Your goal is to prepare a "Morning Briefing" for ${name}.

### DATA:
1. **Today's Schedule**:
${events.map(e => `- ${e.summary} at ${new Date(e.start.dateTime || e.start.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join("\n") || "No meetings scheduled today."}

2. **Pending Action Items**:
${actionItems.map(i => `- [${i.priority}] ${i.title}: ${i.description || ""}`).join("\n") || "No pending action items."}

### TASK:
Generate a warm, professional, and highly actionable briefing email content.
Use the following structure:
1. **Greeting**: Warm and personalized.
2. **The "Big Picture"**: A 2-sentence overview of the day's intensity and focus.
3. **Meeting Prep**: For each meeting today, provide a "Pro-Tip" or "Prep Note" (e.g., "Review the Q3 projections before this starts").
4. **Action Item Focus**: Highlight 1-2 high-priority items from yesterday that should be tackled first.
5. **Closing**: A supportive, empowering sign-off.

Format the output in clean Markdown.
  `;

    try {
        return await generateWithFailover(prompt);
    } catch (error) {
        console.error("Error generating briefing from Gemini:", error);
        return "Vela couldn't generate a brief today, but you have a productive day ahead!";
    }
}

/**
 * Reasons over multiple documents from the Enterprise Knowledge Hub.
 */
export async function askKnowledgeBase(query: string, context: string) {
    const prompt = `
You are Vela, an AI executive assistant with access to the enterprise knowledge base. 
Your goal is to provide a structured, factual, and source-cited answer based ONLY on the provided document context.

### CONTEXT:
${context}

### USER QUERY:
${query}

### INSTRUCTIONS:
1. **Answer Formally**: Provide a professional answer.
2. **Citations**: Every time you mention a fact from the documents, cite it in brackets, e.g., "[1]" or "[Project_Brief.pdf]".
3. **Synthesis**: If information is spread across multiple sources, combine them logically.
4. **Permissions**: If a document looks restricted or sensitive, mention that you are citing from a specific source.
5. **Unknowns**: If the context doesn't have the answer, say "I couldn't find specific information regarding this in the knowledge hubs."

Format your response in clean Markdown.
    `;

    try {
        return await generateWithFailover(prompt);
    } catch (error) {
        console.error("Error questioning knowledge base:", error);
        return "I encountered an error while searching the enterprise hubs. Please try again.";
    }
}
