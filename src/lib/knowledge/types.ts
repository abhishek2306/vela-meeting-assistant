export interface KnowledgeMetadata {
    source: string; // e.g., "Google Drive", "Local", "SharePoint"
    url?: string;
    permissions?: string[];
    author?: string;
    lastModified?: Date;
    mimeType?: string;
}

export interface KnowledgeItem {
    id: string;
    title: string;
    snippet?: string;
    metadata: KnowledgeMetadata;
}

export interface SearchOptions {
    limit?: number;
    filters?: Record<string, any>;
    accessToken?: string; // For authenticated sources like Drive
}

/**
 * Common interface for any enterprise content source.
 */
export interface KnowledgeProvider {
    id: string;
    name: string;
    
    /**
     * Searches the provider for relevant documents.
     */
    search(query: string, options: SearchOptions): Promise<KnowledgeItem[]>;
    
    /**
     * Extracts full text content from a specific item.
     */
    getContent(id: string, options: SearchOptions): Promise<string>;
    
    /**
     * Checks if the provider is currently available/authenticated.
     */
    isReady(options: SearchOptions): Promise<boolean>;
}

export interface KnowledgeResult {
    answer: string;
    sources: KnowledgeItem[];
}
