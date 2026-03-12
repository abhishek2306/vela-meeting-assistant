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

        // Flatten and sort by relevance (mock sort for now, would ideally be score-based)
        return results.flat().slice(0, 10);
    }

    async fetchContext(items: KnowledgeItem[], options: SearchOptions): Promise<string> {
        const contents = await Promise.all(
            items.map(async (item) => {
                const provider = this.providers.find(p => p.name === item.metadata.source);
                if (provider) {
                    try {
                        const content = await provider.getContent(item.id, options);
                        return `--- SOURCE: ${item.title} (${item.metadata.source}) ---\n${content}\n`;
                    } catch (err) {
                        console.error(`[KnowledgeHub] Failed to fetch content for ${item.title}:`, err);
                        return "";
                    }
                }
                return "";
            })
        );

        return contents.join("\n").slice(0, 500000); // Guard for total tokens
    }
}

// Global instance
export const knowledgeHub = new KnowledgeManager();

// Register default providers
knowledgeHub.registerProvider(new GoogleDriveProvider());
knowledgeHub.registerProvider(new LocalFilesProvider());
