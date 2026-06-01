import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

export class NodeIdGeneratorAdapter implements IdGeneratorPort {
  randomUUID(): string {
    return crypto.randomUUID();
  }
}
