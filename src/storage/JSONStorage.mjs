import fs from 'fs/promises';
import path from 'path';

export class JSONStorage {
  constructor(filePath = './data/db.json', options = {}) {
    const resolvedFilePath = path.resolve(filePath);
    this.filePath = resolvedFilePath;
    this.dir = path.dirname(resolvedFilePath);
    this.projectRoot = path.resolve(this.dir, '..');
    this.defaultDataPath = options.defaultDataPath
      ? path.resolve(options.defaultDataPath)
      : path.join(this.projectRoot, 'data', 'overview.json');
  }

  async ensureDir() {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch (_) {
      // ignore mkdir errors (race conditions, permissions will surface later on write)
    }
  }

  async pathExists(checkPath) {
    try {
      await fs.access(checkPath);
      return true;
    } catch (_) {
      return false;
    }
  }

  sanitizeInputs(inputs) {
    if (!Array.isArray(inputs)) return [];

    return inputs.map((i) => {
      const timestampValue = (() => {
        if (!i || i.timestamp == null) return null;
        if (i.timestamp instanceof Date) return i.timestamp.toISOString();
        // If timestamp is a number, treat as epoch millis
        if (typeof i.timestamp === 'number' && Number.isFinite(i.timestamp)) {
          try {
            return new Date(i.timestamp).toISOString();
          } catch (_) {
            return null;
          }
        }
        // If timestamp is a string that Date can parse, keep as-is
        if (typeof i.timestamp === 'string') return i.timestamp;
        return null;
      })();

      return {
        id: i?.id ?? null,
        content: i?.content ?? '',
        type: i?.type ?? null,
        timestamp: timestampValue,
        tags: Array.isArray(i?.tags) ? i.tags : [],
        priority: i?.priority ?? null,
        status: i?.status ?? 'new',
        metadata: (i && typeof i.metadata === 'object' && i.metadata !== null) ? i.metadata : {},
      };
    });
  }

  async readJson(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed; // support bare array format
    if (parsed && Array.isArray(parsed.inputs)) return parsed.inputs;
    return [];
  }

  async loadRaw() {
    // Prefer the primary DB if it exists; otherwise fall back to default seed
    try {
      if (await this.pathExists(this.filePath)) {
        const inputs = await this.readJson(this.filePath);
        return this.sanitizeInputs(inputs);
      }

      if (await this.pathExists(this.defaultDataPath)) {
        const inputs = await this.readJson(this.defaultDataPath);
        return this.sanitizeInputs(inputs);
      }
    } catch (_) {
      // swallow and fall through to empty
    }

    return [];
  }

  async saveRaw(inputs) {
    await this.ensureDir();

    const serializable = this.sanitizeInputs(inputs);

    const data = {
      inputs: serializable,
    };

    const tmpPath = `${this.filePath}.tmp`;

    // Atomic write: write to tmp and rename
    const contents = `${JSON.stringify(data, null, 2)}\n`;
    await fs.writeFile(tmpPath, contents, 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }
}

export default JSONStorage;
