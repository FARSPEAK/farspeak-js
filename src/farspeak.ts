import "dotenv/config";
import { fileTypeFromBuffer } from "file-type";
import { readFile } from "fs/promises";
import { dissoc, omit, pick } from "ramda";
import {
  deleteEntities,
  deleteEntity,
  fromDocument,
  getEntities,
  getEntity,
  getInquiry,
  updateEntities,
  updateEntity,
  writeEntities,
} from "./api";
import { FarspeakError } from "./errors";
import {
  DeleteEntitiesResult,
  EntityType,
  Entity_ID,
  Farspeak_Construct,
  PaginationMeta,
  WriteEntitiesResult,
} from "./types";
import { tryApi } from "./utils";

class Farspeak {
  public app: string = "";
  public env: string = "";
  public backendToken: string = "";
  public publicKey: string = "";
  public secretKey: string = "";
  public vectorIndexName: string = "";
  private chain: string[];
  constructor({
    app,
    env,
    backendToken,
    publicKey,
    secretKey,
    vectorIndexName,
  }: Farspeak_Construct) {
    if (!app || !env || !backendToken) {
      throw new FarspeakError("One of the dependencies is missing!");
    }
    this.app = app;
    this.env = env;
    this.backendToken = backendToken;
    if (publicKey) {
      this.publicKey = publicKey;
    }
    if (secretKey) {
      this.secretKey = secretKey;
    }
    if (vectorIndexName) {
      this.vectorIndexName = vectorIndexName;
    }
    this.chain = [];
  }
  public addToChain(val: string) {
    this.chain.push(val);
  }
  public resetChain() {
    this.chain = [];
  }
  public async writeEntities(payload: EntityType[]): WriteEntitiesResult {
    const ids = await tryApi(() =>
      writeEntities({
        app: this.app,
        env: this.env,
        backendToken: this.backendToken,
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        payload,
        chain: this.chain,
      })
    );
    return ids;
  }
  public entity(name: string) {
    this.chain.push(name);
    const ops = { ...dissoc("entity", EntityOps(this, name)) };
    return ops;
  }
  public async getEntities<T, N extends string>(): Promise<
    { [K in N]: Array<T & { id: string }> } & PaginationMeta
  > {
    const entities = await tryApi(() =>
      getEntities({
        app: this.app,
        env: this.env,
        backendToken: this.backendToken,
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        chain: this.chain,
      })
    );
    return entities;
  }
  public async getEntity<T>(id: string): Promise<T & { id: string }> {
    const entities = await tryApi(() =>
      getEntity({
        app: this.app,
        env: this.env,
        backendToken: this.backendToken,
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        chain: this.chain,
        id,
      })
    );
    return entities;
  }
  public async updateAll<T>(
    payload: Array<T & { id: string } & Record<string, unknown>>
  ): Promise<Array<T & { id: string } & Record<string, unknown>>> {
    const entities = await updateEntities<T>({
      app: this.app,
      env: this.env,
      backendToken: this.backendToken,
      publicKey: this.publicKey,
      secretKey: this.secretKey,
      chain: this.chain,
      payload,
    });
    return entities;
  }
  public async update<T>(
    payload: T & { id: string }
  ): Promise<Array<T & { id: string } & Record<string, unknown>>> {
    const entities = await updateEntity({
      app: this.app,
      env: this.env,
      backendToken: this.backendToken,
      publicKey: this.publicKey,
      secretKey: this.secretKey,
      chain: this.chain,
      id: payload.id,
      body: omit(["id"], payload),
    });
    return entities;
  }
  public async inquire(inquiry: string): Promise<{ answer: string }> {
    const entities = await getInquiry({
      app: this.app,
      env: this.env,
      backendToken: this.backendToken,
      publicKey: this.publicKey,
      secretKey: this.secretKey,
      vectorIndexName: this.vectorIndexName,
      chain: this.chain,
      inquiry,
    });
    return entities;
  }
  public async deleteAll(): DeleteEntitiesResult {
    const numberOfDeletedItems = await tryApi(() =>
      deleteEntities({
        app: this.app,
        env: this.env,
        backendToken: this.backendToken,
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        chain: this.chain,
      })
    );
    return numberOfDeletedItems;
  }
  public async deleteOne(id: string) {
    const deleted = await tryApi(() =>
      deleteEntity({
        app: this.app,
        env: this.env,
        backendToken: this.backendToken,
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        chain: this.chain,
        id,
      })
    );
    return deleted;
  }
  public async fromDocument({
    file,
    instructions,
    template,
  }: {
    instructions: string;
    template: string;
    file: Buffer;
  }) {
    const doc = await tryApi(() =>
      fromDocument({
        app: this.app,
        env: this.env,
        backendToken: this.backendToken,
        publicKey: this.publicKey,
        secretKey: this.secretKey,
        chain: this.chain,
        instructions,
        template,
        file,
      })
    );
    return doc;
  }
}

const checkPdf = async (file: Buffer) => {
  const type = await fileTypeFromBuffer(file);
  if (type?.mime === "application/pdf") {
    return true;
  }
};

const EntityOps = (farspeak: Farspeak, name: string) => {
  return {
    entity: (name: string) => {
      farspeak.addToChain(name);
      return dissoc("entity", EntityOps(farspeak, name));
    },
    id: (id: string) => {
      farspeak.addToChain(id);
      return pick(["entity"], EntityOps(farspeak, name));
    },
    getAll: async <T, N extends string>() => {
      const entities = await farspeak.getEntities<T, N>();
      farspeak.resetChain();
      return entities;
    },
    get: async <T>(id: string) => {
      const entities = await farspeak.getEntity<T>(id);
      farspeak.resetChain();
      return entities;
    },
    write: async (entities: EntityType[]) => {
      const result = await farspeak.writeEntities(entities);
      farspeak.resetChain();
      return result;
    },
    deleteAll: async () => {
      const result = await farspeak.deleteAll();
      farspeak.resetChain();
      return result;
    },
    delete: async (id: string) => {
      const result = await farspeak.deleteOne(id);
      farspeak.resetChain();
      return result;
    },
    updateAll: async <T>(
      entities: Array<Partial<T> & { id: string } & Record<string, unknown>>
    ) => {
      const result = await farspeak.updateAll<Partial<T>>(entities);
      farspeak.resetChain();
      return result;
    },
    update: async <T>(
      entity: Partial<T> & { id: string } & Record<string, unknown>
    ) => {
      const result = await farspeak.update<Partial<T>>(entity);
      farspeak.resetChain();
      return result[0];
    },
    inquire: async (inquiry: string) => {
      const result = await farspeak.inquire(inquiry);
      farspeak.resetChain();
      return result;
    },
    fromDocument: async ({
      filePath,
      instructions,
      template,
    }: {
      filePath: string;
      instructions: string;
      template: Record<string, string>;
    }): Promise<Entity_ID & EntityType> => {
      if (!template || typeof template !== "object")
        throw new FarspeakError("Template is required");
      try {
        const fileStream = await readFile(filePath);
        const isPdf = await checkPdf(fileStream);
        if (!isPdf) {
          throw new FarspeakError("File is not a PDF");
        }
        const oneMBInMebi = 1 << 20;
        if (fileStream.byteLength > oneMBInMebi) {
          throw new FarspeakError("File size is too large");
        }
        const doc = await farspeak.fromDocument({
          file: fileStream,
          instructions,
          template: JSON.stringify(template),
        });
        farspeak.resetChain();
        return doc;
      } catch (e: any) {
        throw new FarspeakError(e.message);
      }
    },
  };
};

export { Farspeak };
