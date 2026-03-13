import { KnowledgeProvider, KnowledgeItem, SearchOptions } from "./types";
import { GoogleDriveProvider } from "./providers/google-drive";
import { LocalFilesProvider } from "./providers/local-files";

export class KnowledgeManager {
    private providers: KnowledgeProvider[] = [];

    registerProvider(provider: KnowledgeProvider) {
        if (!this.providers.find(p => p.id === provider.id)) {
            this.providers.push(provider);
        }
    }

    async searchAll(query: string, options: SearchOptions): Promise<KnowledgeItem[]> {
        const results = await Promise.all(
            this.providers.map(async (provider) => {
                try {
                    if (await provider.isReady(options)) {
                        return await provider.search(query, options);
                    }
                    return [];
                } catch (err) {
                    console.error(`[KnowledgeHub] Provider ${provider.name} failed search:`, err);
                    return [];
                }
            })
        );

        // Flatten
        const allItems = results.flat();

        // Implement Keyword-based Relevance Scoring
        const queryKeywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        const scoredItems = allItems.map(item => {
            let score = 0;
            const title = item.title.toLowerCase();
            
            // Priority 1: Exact keyword matches in title
            queryKeywords.forEach(kw => {
                if (title.includes(kw)) score += 10;
                // Extra weight for whole word match
                if (new RegExp(`\\b${kw}\\b`).test(title)) score += 5;
            });

            // Priority 2: Recency (Dec 2025 matches Dec 2025)
            if (item.metadata.lastModified) {
                const yearMatch = query.match(/\b20\d{2}\b/);
                if (yearMatch && item.title.includes(yearMatch[0])) score += 5;
            }

            return { item, score };
        });

        // Sort by score descending and take top 10
        return scoredItems
            .sort((a, b) => b.score - a.score)
            .map(si => si.item)
            .slice(0, 10);
    }

    async fetchContext(items: KnowledgeItem[], options: SearchOptions): Promise<string> {
        console.log(`[KnowledgeHub] Fetching context for ${items.length} items...`);
        const contents = await Promise.all(
            items.map(async (item, index) => {
                const provider = this.providers.find(p => p.name === item.metadata.source);
                if (provider) {
                    try {
                        const content = await provider.getContent(item.id, options);
                        console.log(`[KnowledgeHub] [${index+1}/${items.length}] Extracted ${content.length} chars from "${item.title}"`);
                        return `--- SOURCE: ${item.title} (${item.metadata.source}) ---\n${content}\n`;
                    } catch (err) {
                        console.error(`[KnowledgeHub] Failed to fetch content for ${item.title}:`, err);
                        return "";
                    }
                }
                return "";
            })
        );

        const fullContext = contents.join("\n");
        console.log(`[KnowledgeHub] Total Context Size: ${fullContext.length} characters`);
        return fullContext.slice(0, 1000000); // 1M char limit for Gemini
    }
}

// Global instance
export const knowledgeHub = new KnowledgeManager();

// Register default providers
knowledgeHub.registerProvider(new GoogleDriveProvider());
knowledgeHub.registerProvider(new LocalFilesProvider());
