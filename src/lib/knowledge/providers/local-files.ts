// Polyfill for Node.js environment where DOMMatrix is missing
// We use a more aggressive global assignment to ensure it persists in Next.js runtime
function ensurePolyfills() {
    if (typeof global !== "undefined" && !(global as any).DOMMatrix) {
        (global as any).DOMMatrix = class DOMMatrix {
            a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
            constructor() {
                this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
            }
        };
    }
}

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import * as mammoth from "mammoth";
import { KnowledgeProvider, KnowledgeItem, SearchOptions } from "../types";

export class LocalFilesProvider implements KnowledgeProvider {
    id = "local-files";
    name = "Local Hub";
    private storagePath: string;

    constructor() {
        // Define a local folder in the project for corporate knowledge
        this.storagePath = path.join(process.cwd(), "knowledge_base");
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }

    async isReady(): Promise<boolean> {
        return fs.existsSync(this.storagePath);
    }

    async search(query: string): Promise<KnowledgeItem[]> {
        const files = fs.readdirSync(this.storagePath);
        const lowerQuery = query.toLowerCase();
        const queryKeywords = lowerQuery.split(/\s+/).filter(k => k.length > 2);

        console.log(`[LocalHub] Searching for: "${query}" | Keywords:`, queryKeywords);
        console.log(`[LocalHub] Available files:`, files);

        const matches = files.filter(file => {
            const lowerFile = file.toLowerCase();
            const matched = queryKeywords.some(keyword => lowerFile.includes(keyword)) ||
                            lowerFile.includes(lowerQuery);
            if (matched) console.log(`[LocalHub] Match found: ${file}`);
            return matched;
        });

        // Log results for debugging
        const logPath = path.join(process.cwd(), "extraction_errors.log");
        fs.appendFileSync(logPath, `${new Date().toISOString()} | [LocalSearch] Query: "${query}" | Found: ${matches.join(", ")}\n`);

        return matches.map(file => {
            const stats = fs.statSync(path.join(this.storagePath, file));
            return {
                id: file,
                title: file,
                metadata: {
                    source: this.name,
                    lastModified: stats.mtime,
                    mimeType: this.getMimeType(file),
                }
            };
        });
    }

    async getContent(id: string): Promise<string> {
        const filePath = path.join(this.storagePath, id);
        if (!fs.existsSync(filePath)) throw new Error("File not found");

        const ext = path.extname(id).toLowerCase();
        
        try {
            if ([".txt", ".md", ".json", ".csv"].includes(ext)) {
                return fs.readFileSync(filePath, "utf-8");
            }

            if (ext === ".pdf") {
                ensurePolyfills();
                // Dynamic import to match the working test script
                const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
                
                // Set the worker path to an absolute path in node_modules to avoid Next.js bundling issues
                // On Windows, ESM requires file:// protocol for absolute paths
                const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
                (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

                const data = new Uint8Array(fs.readFileSync(filePath));
                const loadingTask = pdfjsLib.getDocument({ 
                    data,
                    disableWorker: true, // Use main thread in Node.js context
                    useSystemFonts: true 
                } as any);
                const pdf = await loadingTask.promise;
                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const strings = content.items.map((item: any) => {
                        return (item as any).str || "";
                    });
                    fullText += strings.join(" ") + " ";
                    // Optional: trim extremely large PDFs if they exceed context, but Gemini has 1M+ context
                }
                return fullText;
            }

            if (ext === ".docx") {
                const buffer = fs.readFileSync(filePath);
                const result = await mammoth.extractRawText({ buffer });
                return result.value;
            }
        } catch (err: any) {
            const errorMsg = `CRITICAL_EXTRACT_ERROR: [${id}] -> ${err.message} | STACK: ${err.stack?.substring(0, 300)}`;
            console.error(`[LocalHub] ${errorMsg}`);
            
            // Force write to a fresh file we can definitely find
            try {
                fs.writeFileSync(path.join(process.cwd(), "latest_error.txt"), errorMsg);
            } catch (ignore) {}

            return `[CANNOT_READ_FILE: ${id}. Technical Details: ${err.message}]`;
        }

        return `[Unsupported file format for ${id}]`;
    }

    private getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        const types: Record<string, string> = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
            ".md": "text/markdown",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
        return types[ext] || "application/octet-stream";
    }
}
