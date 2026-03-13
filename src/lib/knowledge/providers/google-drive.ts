import { google } from "googleapis";
import * as mammoth from "mammoth";
import { getGoogleAuthClient } from "../../google-api";
import { downloadDriveFileAsText } from "../../google-drive";
import { KnowledgeProvider, KnowledgeItem, SearchOptions } from "../types";

// Polyfill for Node.js environment where DOMMatrix is missing
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

export class GoogleDriveProvider implements KnowledgeProvider {
    id = "google-drive";
    name = "Google Drive";

    async isReady(options: SearchOptions): Promise<boolean> {
        return !!options.accessToken;
    }

    async search(query: string, options: SearchOptions): Promise<KnowledgeItem[]> {
        if (!options.accessToken) return [];
        
        const auth = getGoogleAuthClient(options.accessToken);
        const drive = google.drive({ version: "v3", auth });

        // Broad search: Keywords in name OR full query in fullText
        const keywords = query.split(/\s+/).filter(k => k.length > 2);
        const nameQuery = keywords.length > 0 
            ? keywords.map(k => `name contains '${k}'`).join(" or ")
            : `name contains '${query}'`;
        
        const fullQuery = `(${nameQuery} or fullText contains '${query}') and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' or mimeType = 'application/vnd.google-apps.spreadsheet') and trashed = false`;

        console.log(`[DriveHub] Searching with Q:`, fullQuery);

        const res = await drive.files.list({
            q: fullQuery,
            fields: "files(id, name, mimeType, webViewLink, owners, modifiedTime)",
            pageSize: 30
        });

        console.log(`[DriveHub] Found ${res.data.files?.length || 0} results.`);

        return (res.data.files || []).map(file => ({
            id: file.id!,
            title: file.name!,
            metadata: {
                source: this.name,
                url: file.webViewLink || undefined,
                lastModified: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
                mimeType: file.mimeType || undefined,
                author: file.owners?.[0]?.displayName || "Unknown"
            }
        }));
    }

    async getContent(id: string, options: SearchOptions): Promise<string> {
        if (!options.accessToken) throw new Error("No access token provided for Google Drive");
        
        const drive = google.drive({ version: "v3", auth: getGoogleAuthClient(options.accessToken) });
        const fileRes = await drive.files.get({
            fileId: id,
            fields: "mimeType, name"
        });
        
        const mimeType = fileRes.data.mimeType!;
        
        // Handle Google Docs/Sheets/Text via existing utility
        if (mimeType.includes("google-apps") || mimeType === "text/plain") {
            return await downloadDriveFileAsText(options.accessToken, id, mimeType);
        }

        // Handle PDF/DOCX binaries from Drive
        try {
            const response = await drive.files.get({
                fileId: id,
                alt: "media"
            }, { responseType: "arraybuffer" });

            const buffer = Buffer.from(response.data as ArrayBuffer);

            if (mimeType === "application/pdf") {
                ensurePolyfills();
                const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
                // Absolute path logic for worker on Windows/Next.js
                const path = await import("path");
                const { pathToFileURL } = await import("url");
                const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
                (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true } as any);
                const pdf = await loadingTask.promise;
                console.log(`[DriveHub] Extracting ${pdf.numPages} pages from PDF: ${fileRes.data.name}`);
                
                let text = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map((it: any) => it.str).join(" ");
                    text += pageText + " ";
                }
                console.log(`[DriveHub] PDF Extraction Complete: ${text.length} characters retrieved.`);
                return text;
            }

            if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                const result = await mammoth.extractRawText({ buffer });
                return result.value;
            }
        } catch (err: any) {
            console.error(`[DriveHub] Binary extraction failed for ${id}:`, err);
            const logPath = require('path').join(process.cwd(), "extraction_errors.log");
            require('fs').appendFileSync(logPath, `${new Date().toISOString()} | [Drive] ${fileRes.data.name} | ${err.stack || err}\n`);
            return `[Drive Extraction Error for ${fileRes.data.name}: ${err.message}]`;
        }
        
        return await downloadDriveFileAsText(options.accessToken, id, mimeType);
    }
}
