import fs from "fs/promises";
import path from "path";
import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";

export class NodeFileSystemAdapter implements FileSystemPort {
  async readFile(filePath: string, encoding: BufferEncoding = "utf-8"): Promise<string | null> {
    try {
      return await fs.readFile(filePath, { encoding });
    } catch {
      return null;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, "utf-8");
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, { recursive: options?.recursive ?? false });
  }

  async readdir(dirPath: string): Promise<{ name: string; isFile: boolean; isDirectory: boolean }[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isFile: e.isFile(),
        isDirectory: e.isDirectory(),
      }));
    } catch {
      return [];
    }
  }

  async unlink(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  join(...segments: string[]): string {
    return path.join(...segments);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
}
