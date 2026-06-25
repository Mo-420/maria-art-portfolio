#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 18142);
const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT || "/data/media");
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const STORAGE_TOKEN = process.env.MARYILU_STORAGE_TOKEN || process.env.STORAGE_TOKEN || "";
const MAX_IMAGE_UPLOAD_BYTES = Number(process.env.MAX_IMAGE_UPLOAD_BYTES || 6 * 1024 * 1024);
const MAX_MULTIPART_BYTES = MAX_IMAGE_UPLOAD_BYTES + 512 * 1024;

const IMAGE_UPLOAD_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
]);

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Vary": "Origin"
    };
}

function sendJson(response, status, body) {
    response.writeHead(status, {
        ...corsHeaders(),
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(body));
}

function sendText(response, status, body) {
    response.writeHead(status, {
        ...corsHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
}

function cleanString(value, max = 500) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function timingSafeEqualText(a, b) {
    const left = Buffer.from(String(a || ""));
    const right = Buffer.from(String(b || ""));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function isAuthorized(request) {
    if (!STORAGE_TOKEN) return false;
    const header = request.headers.authorization || "";
    return timingSafeEqualText(header, `Bearer ${STORAGE_TOKEN}`);
}

function uploadedImageExtension(file) {
    const type = cleanString(file?.type, 80).toLowerCase().split(";")[0];
    if (IMAGE_UPLOAD_TYPES.has(type)) return IMAGE_UPLOAD_TYPES.get(type);

    const name = cleanString(file?.name, 220).toLowerCase();
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
    if (name.endsWith(".png")) return "png";
    if (name.endsWith(".webp")) return "webp";
    return "";
}

function uploadedImageContentType(file, extension) {
    const type = cleanString(file?.type, 80).toLowerCase().split(";")[0];
    if (IMAGE_UPLOAD_TYPES.has(type)) return type;
    if (extension === "jpg") return "image/jpeg";
    if (extension === "png") return "image/png";
    if (extension === "webp") return "image/webp";
    return "";
}

function extensionContentType(key) {
    const lower = key.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    return "application/octet-stream";
}

function normalizeMediaKey(value) {
    let decoded = "";
    try {
        decoded = decodeURIComponent(String(value || ""));
    } catch {
        return "";
    }
    const clean = decoded.replace(/^\/+/, "");
    if (!clean || clean.includes("..") || !/^[A-Za-z0-9/_\-.]+$/.test(clean)) return "";
    return clean;
}

function mediaFilePath(key) {
    const fullPath = resolve(MEDIA_ROOT, key);
    if (fullPath !== MEDIA_ROOT && !fullPath.startsWith(`${MEDIA_ROOT}${sep}`)) return "";
    return fullPath;
}

function mediaUrl(request, key) {
    const mediaPath = `/media/${key.split("/").map(part => encodeURIComponent(part)).join("/")}`;
    if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}${mediaPath}`;
    const host = request.headers.host || `127.0.0.1:${PORT}`;
    return `http://${host}${mediaPath}`;
}

async function parseFormData(request) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) headers.append(key, item);
        } else if (value != null) {
            headers.set(key, value);
        }
    }

    const webRequest = new Request(`http://storage.local${request.url}`, {
        method: request.method,
        headers,
        body: request,
        duplex: "half"
    });

    return await webRequest.formData();
}

async function handleUpload(request, response) {
    if (!isAuthorized(request)) {
        return sendJson(response, 401, { success: false, error: "Unauthorized." });
    }

    const contentLength = Number(request.headers["content-length"] || "0");
    if (contentLength > MAX_MULTIPART_BYTES) {
        return sendJson(response, 413, { success: false, error: "Image is too large. Upload a file under 6 MB." });
    }

    const form = await parseFormData(request).catch(() => null);
    const file = form?.get("image") || form?.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.size !== "number") {
        return sendJson(response, 400, { success: false, error: "Upload an image file." });
    }

    if (file.size <= 0) {
        return sendJson(response, 400, { success: false, error: "Image file is empty." });
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        return sendJson(response, 413, { success: false, error: "Image is too large. Upload a file under 6 MB." });
    }

    const extension = uploadedImageExtension(file);
    const contentType = uploadedImageContentType(file, extension);
    if (!extension || !contentType) {
        return sendJson(response, 415, { success: false, error: "Upload a JPG, PNG, or WebP image." });
    }

    const uploadedAt = new Date().toISOString();
    const key = `shop-items/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const filePath = mediaFilePath(key);
    const metadataPath = `${filePath}.json`;
    const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    const bytes = Buffer.from(await file.arrayBuffer());

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(tmpPath, bytes, { mode: 0o640 });
    await rename(tmpPath, filePath);
    await writeFile(metadataPath, JSON.stringify({
        contentType,
        size: file.size,
        originalName: cleanString(file.name, 220),
        uploadedAt
    }, null, 2), { mode: 0o640 });

    const url = mediaUrl(request, key);
    return sendJson(response, 201, {
        success: true,
        key,
        url,
        mediaUrl: url,
        contentType,
        size: file.size,
        uploadedAt
    });
}

async function handleMedia(request, response, keyInput) {
    const key = normalizeMediaKey(keyInput);
    if (!key) return sendText(response, 400, "Invalid media key.");

    const filePath = mediaFilePath(key);
    let fileStat;
    try {
        fileStat = await stat(filePath);
        if (!fileStat.isFile()) return sendText(response, 404, "Media not found.");
    } catch {
        return sendText(response, 404, "Media not found.");
    }

    let metadata = {};
    try {
        metadata = JSON.parse(await readFile(`${filePath}.json`, "utf8"));
    } catch {
        metadata = {};
    }

    response.writeHead(200, {
        ...corsHeaders(),
        "Content-Type": metadata.contentType || extensionContentType(key),
        "Content-Length": String(fileStat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
    });
    createReadStream(filePath).pipe(response);
}

async function route(request, response) {
    const url = new URL(request.url || "/", `http://${request.headers.host || "storage.local"}`);

    if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders());
        response.end();
        return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
            ok: true,
            storage: "maryilu-ax42",
            configured: Boolean(STORAGE_TOKEN),
            mediaRoot: MEDIA_ROOT
        });
    }

    if (request.method === "POST" && url.pathname === "/uploads/images") {
        return await handleUpload(request, response);
    }

    const mediaMatch = url.pathname.match(/^\/media\/(.+)$/);
    if (request.method === "GET" && mediaMatch) {
        return await handleMedia(request, response, mediaMatch[1]);
    }

    return sendText(response, 404, "Not found.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await mkdir(MEDIA_ROOT, { recursive: true });
    createServer((request, response) => {
        route(request, response).catch((error) => {
            console.error(error);
            if (!response.headersSent) {
                sendJson(response, 500, { success: false, error: "Storage service failed." });
            } else {
                response.destroy(error);
            }
        });
    }).listen(PORT, "0.0.0.0", () => {
        console.log(`Maryilu image storage listening on ${PORT}`);
    });
}
