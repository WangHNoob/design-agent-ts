export interface FileSystemPort {
  readFile(path: string, encoding?: BufferEncoding): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<{ name: string; isFile: boolean; isDirectory: boolean }[]>;
  unlink(path: string): Promise<void>;
  join(...segments: string[]): string;
  dirname(filePath: string): string;
  relative(from: string, to: string): string;
}
