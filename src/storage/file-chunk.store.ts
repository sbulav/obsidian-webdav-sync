import { FILE_CHUNK_STORE_NAME, BaseStore } from './store.interface';

export class IndexedDBFileChunkStore extends BaseStore {
	constructor() {
		super(FILE_CHUNK_STORE_NAME);
	}

	async get(namespace: string, path: string): Promise<ArrayBuffer | undefined> {
		return await this.run('read chunk', async () => {
			return (
				(await this.store.getItem<ArrayBuffer>(this.getKey(namespace, path))) ?? undefined
			);
		});
	}

	async set(namespace: string, path: string, chunk: ArrayBuffer): Promise<void> {
		await this.run('write chunk', async () => {
			await this.store.setItem(this.getKey(namespace, path), chunk);
		});
	}
}
