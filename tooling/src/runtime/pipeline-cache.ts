/**
 * Checkpoint/cache helpers for multi-phase pipeline orchestration.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type PipelinePhase = 'ingest' | 'index' | 'analyze' | 'emit';

export type CheckpointEnvelope<T> = {
    schemaVersion: number;
    toolVersion: string;
    phase: PipelinePhase;
    dependencyHash: string;
    payloadHash: string;
    createdAt: string;
    payload: T;
};

export type InputFileHash = {
    file: string;
    sha256: string;
    size: number;
    mtimeMs: number;
};

export type InputHashSnapshot = {
    inputHash: string;
    files: InputFileHash[];
};

function stableJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => stableJsonValue(item));
    }
    if (value && typeof value === 'object') {
        const input = value as Record<string, unknown>;
        const keys = Object.keys(input).sort((a, b) => a.localeCompare(b));
        const out: Record<string, unknown> = {};
        for (const key of keys) {
            out[key] = stableJsonValue(input[key]);
        }
        return out;
    }
    return value;
}

export function stableStringify(value: unknown): string {
    return JSON.stringify(stableJsonValue(value));
}

export function sha256FromString(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256FromObject(value: unknown): string {
    return sha256FromString(stableStringify(value));
}

export function sha256FromFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

export function writeJsonAtomic(filePath: string, value: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = path.join(
        dir,
        `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

export function readJsonFile<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content) as T;
    } catch {
        return null;
    }
}

export function loadCheckpoint<T>(
    filePath: string,
    phase: PipelinePhase,
    dependencyHash: string,
    schemaVersion: number,
    toolVersion: string
): CheckpointEnvelope<T> | null {
    const envelope = readJsonFile<CheckpointEnvelope<T>>(filePath);
    if (!envelope) return null;
    if (envelope.phase !== phase) return null;
    if (envelope.schemaVersion !== schemaVersion) return null;
    if (envelope.toolVersion !== toolVersion) return null;
    if (envelope.dependencyHash !== dependencyHash) return null;

    const payloadHash = sha256FromObject(envelope.payload);
    if (payloadHash !== envelope.payloadHash) return null;

    return envelope;
}

export function saveCheckpoint<T>(
    filePath: string,
    phase: PipelinePhase,
    dependencyHash: string,
    payload: T,
    schemaVersion: number,
    toolVersion: string
): CheckpointEnvelope<T> {
    const envelope: CheckpointEnvelope<T> = {
        schemaVersion,
        toolVersion,
        phase,
        dependencyHash,
        payloadHash: sha256FromObject(payload),
        createdAt: new Date().toISOString(),
        payload
    };
    writeJsonAtomic(filePath, envelope);
    return envelope;
}

export function hashJsonInputDirectory(dir: string): InputHashSnapshot {
    if (!fs.existsSync(dir)) {
        throw new Error(`Directory not found: ${dir}`);
    }

    const files = fs
        .readdirSync(dir)
        .filter(file => path.extname(file).toLowerCase() === '.json')
        .sort((a, b) => a.localeCompare(b));

    const aggregate = crypto.createHash('sha256');
    const hashedFiles: InputFileHash[] = [];

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath);
        const fileHash = crypto.createHash('sha256').update(content).digest('hex');

        aggregate.update(file);
        aggregate.update('\0');
        aggregate.update(fileHash);
        aggregate.update('\0');

        hashedFiles.push({
            file,
            sha256: fileHash,
            size: stat.size,
            mtimeMs: stat.mtimeMs
        });
    }

    return {
        inputHash: aggregate.digest('hex'),
        files: hashedFiles
    };
}
