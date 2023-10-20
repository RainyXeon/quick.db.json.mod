import {
    Connection,
    ConnectOptions,
    createConnection,
    Model,
    pluralize,
    Schema,
    SchemaTypes,
} from "mongoose";

import { IRemoteDriver } from "../interfaces/IRemoteDriver";

export interface CollectionInterface<T = unknown> {
    ID: string;
    data: T;
    createdAt: Date;
    updatedAt: Date;
    expireAt?: Date;
}

/**
 * MongoDriver
 * @example
 * ```ts
 * const { MongoDriver } = require("quick.db/MongoDriver");
 * const mongoDriver = new MongoDriver("mongodb://localhost/quickdb");
 *
 * const db = new QuickDB({
 *  driver: mongoDriver
 * });
 * await db.init(); // Always needed!!!
 * await db.set("test", "Hello World");
 * console.log(await db.get("test"));
 * ```
 **/
export class MongoDriver implements IRemoteDriver {
    public conn?: Connection;
    private models = new Map<string, ReturnType<typeof this.modelSchema>>();
    docSchema: Schema<CollectionInterface<unknown>>;

    public constructor(
        public url: string,
        public options: ConnectOptions = {},
        pluralizeP = false
    ) {
        if (!pluralizeP) pluralize(null);

        this.docSchema = new Schema<CollectionInterface>(
            {
                ID: {
                    type: SchemaTypes.String,
                    required: true,
                    unique: true,
                },
                data: {
                    type: SchemaTypes.Mixed,
                    required: false,
                },
                expireAt: {
                    type: SchemaTypes.Date,
                    required: false,
                    default: null,
                },
            },
            {
                timestamps: true,
            }
        );
    }

    public async connect(): Promise<MongoDriver> {
        const connection = await createConnection(
            this.url,
            this.options
        ).asPromise();
        this.conn = connection;
        return this;
    }

    public async disconnect(): Promise<void> {
        return await this.conn?.close();
    }

    private checkConnection(): void {
        if (this.conn == null)
            throw new Error(`MongoDriver is not connected to the database`);
    }

    public async prepare(table: string): Promise<void> {
        this.checkConnection();
        if (!this.models.has(table))
            this.models.set(table, this.modelSchema(table));
    }

    private async getModel<T = unknown>(
        name: string
    ): Promise<Model<CollectionInterface<T>> | undefined> {
        await this.prepare(name);
        return this.models.get(name) as
            | Model<CollectionInterface<T>>
            | undefined;
    }

    public async getAllRows(
        table: string
    ): Promise<{ id: string; value: any }[]> {
        this.checkConnection();

        const model = await this.getModel(table);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return (await model!.find()).map((row: any) => ({
            id: row.ID,
            value: row.data,
        }));
    }

    public async getRowByKey<T>(
        table: string,
        key: string
    ): Promise<[T | null, boolean]> {
        this.checkConnection();

        const model = await this.getModel(table);
        const res = await model!.findOne({ ID: key });

        return res ? [res.data as T | null, true] : [null, false];
    }

    public async getStartsWith(
        table: string,
        query: string
    ): Promise<{ id: string; value: any }[]> {
        this.checkConnection();

        const model = await this.getModel(table);
        const res = await model!.find({
            ID: `/^${query}/`,
        });

        return res.map((row) => ({
            id: row.ID,
            value: row.data,
        }));
    }

    public async setRowByKey<T>(
        table: string,
        key: string,
        value: any,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _update: boolean
    ): Promise<T> {
        this.checkConnection();

        const model = await this.getModel(table);
        await model?.findOneAndUpdate(
            {
                ID: key,
            },
            {
                $set: { data: value },
            },
            { upsert: true }
        );

        return value;
    }

    public async deleteAllRows(table: string): Promise<number> {
        this.checkConnection();

        const model = await this.getModel(table);
        const res = await model?.deleteMany();

        return res!.deletedCount!;
    }

    public async deleteRowByKey(table: string, key: string): Promise<number> {
        this.checkConnection();

        const model = await this.getModel(table);
        const res = await model?.deleteMany({
            ID: key,
        });

        return res!.deletedCount!;
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    modelSchema<T = unknown>(
        modelName = "JSON"
    ): Model<CollectionInterface<T>> {
        this.checkConnection();

        const model = this.conn!.model(modelName, this.docSchema);
        model.collection
            .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
            .catch(() => {
                /* void */
            });

        return model as Model<CollectionInterface<T>>;
    }
}
