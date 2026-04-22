import { arrayBufferToText, toArrayBuffer, type BinaryLike } from '~/platform/binary';
import { useSettings } from '~/settings';
import { getRemoteContent } from '~/utils/get-content';
import logger from '~/utils/logger';
import { statVaultItem } from '~/utils/stat-item';
import type { OptionsWithRemoteFileStat } from '../decision/sync-decision.interface';
import { isMergeablePath } from '../utils/is-mergeable-path';
import { BaseTask, toTaskError } from './task.interface';

export default class PullTask extends BaseTask<OptionsWithRemoteFileStat> {
	readonly name = 'download';

	async exec() {
		try {
			const maxThroughput = (await useSettings()).maxThroughputConcurrency;
			const maxSize = maxThroughput.enabled ? maxThroughput.value : Infinity;
			let remoteContent: ArrayBuffer | undefined;

			if (this.remote.size <= maxSize) {
				remoteContent = await getRemoteContent(this.webdav, this.remotePath);
				await this.vault.adapter.writeBinary(this.localPath, remoteContent, {
					ctime: this.remote.mtime - 1000, // #1
				});
			} else {
				logger.debug(`Pulling large file \`${this.remotePath}\` in chunks.`);
				const fileEnd = this.remote.size - 1;
				for (let byte = 0; byte < this.remote.size; byte += maxSize) {
					const byteEnd = byte + maxSize - 1;
					const content = (await this.webdav.getFileContents(this.remotePath, {
						headers: {
							Range: `bytes=${byte}-${byteEnd <= fileEnd ? byteEnd : fileEnd}`,
						},
					})) as BinaryLike;
					await this.vault.adapter.appendBinary(
						this.localPath,
						await toArrayBuffer(content),
						{ ctime: this.remote.mtime - 1000 },
					);
				}
			}

			// no race condition since we've just written it
			const local = await statVaultItem(this.vault, this.localPath);
			if (!local || local.isDir)
				throw new Error(`failed to read local file stat after pull: ${this.localPath}`);
			await this.syncRecord.upsertRecords({
				key: this.localPath,
				local,
				remote: this.remote,
				baseText:
					isMergeablePath(this.localPath) && remoteContent
						? await arrayBufferToText(remoteContent)
						: undefined,
			});

			return { success: true } as const;
		} catch (e) {
			logger.error(`Failed to pull file ${this.remotePath} from remote`, e);
			return { success: false, error: toTaskError(e, this) };
		}
	}
}

/* #1 Solves incompatibility between this plugin and obsidian-paste-image-rename

When "Handle all attachments" is enabled, paste-image-rename checks every file write (except .md) in vault and tries to rename them.

During syncing, when files are downloaded, Paste-image-rename tries to rename all of them, causing severe rename chaos. If real-time sync is enabled, the file rename will in return trigger an auto sync, which will cause server chaos as well.

When ctime is more than 1 seconds ago, paste-image-rename will not rename the file: https://github.com/reorx/obsidian-paste-image-rename/blob/3801513c406a86ad90c94a1bd7c95c6b837e063d/src/main.ts#L81

So the only solution is to re-generate a ctime at local file creation. Which is set to server modification time - 1s.
*/
