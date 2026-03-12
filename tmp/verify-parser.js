const responseText = "Sure! I've scheduled the meeting for you. Here is the block:\n```json\n{\n  \"command\": \"SCHEDULE_MEETING\",\n  \"title\": \"Test Meeting\"\n}\n```\nLet me know if you need anything else!";

const jsonMatch = responseText.match(/\{[\s\S]*\}/);
if (jsonMatch) {
    const cleanedJson = jsonMatch[0].trim();
    try {
        const command = JSON.parse(cleanedJson);
        console.log("Extracted Command:", command);
    } catch (e) {
        console.error("Parse Error:", e);
    }
} else {
    console.log("No JSON found");
}
