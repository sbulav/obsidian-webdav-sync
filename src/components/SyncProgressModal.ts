import { ButtonComponent, Modal, Setting } from 'obsidian';
import WebDAVSyncPlugin from '~';
import { syncCancel } from '~/events';
import t from '~/i18n';

export default class SyncProgressModal extends Modal {
	private progressBar!: HTMLDivElement;
	private progressText!: HTMLDivElement;
	private progressStats!: HTMLDivElement;
	private currentFile!: HTMLDivElement;
	private syncCancelled = false;
	private cancelSubscription: () => void;
	private stopButtonComponent!: ButtonComponent;
	private hideButtonComponent!: ButtonComponent;
	private syncStateProgressStats!: HTMLDivElement;
	private syncStateCurrentOperation!: HTMLDivElement;

	constructor(
		private plugin: WebDAVSyncPlugin,
		private closeCallback?: () => void,
	) {
		super(plugin.app);
		this.cancelSubscription = syncCancel.subscribe(() => {
			this.syncCancelled = true;
			this.update();
		});
	}

	public update(): void {
		if (!this.progressBar || !this.progressText || !this.progressStats || !this.currentFile)
			return;

		const progress = this.plugin.progressService.syncProgress;
		const planningProgress = this.plugin.progressService.planningProgress;
		const currentRun = this.plugin.progressService.currentRun;
		const isPlanningStage = currentRun?.stage === 'planning' || currentRun?.stage === 'queued';
		const completedUnits = isPlanningStage
			? (planningProgress?.completedWorkUnits ?? 0)
			: progress.completedTasks;
		const totalUnits = isPlanningStage
			? (planningProgress?.totalWorkUnits ?? 0)
			: progress.totalTasks;

		const percent = Math.round((completedUnits / totalUnits) * 100) || 0;

		const percentText = `${percent}%`;
		this.progressBar.style.width = percentText;
		this.progressText.setText(percentText);

		this.progressStats.setText(
			t('sync.progressStats', {
				completed: completedUnits,
				total: totalUnits,
			}),
		);

		if (isPlanningStage) {
			this.currentFile.setText(
				planningProgress?.currentItem ? planningProgress.currentItem : t('sync.preparing'),
			);
		} else if (currentRun?.stage === 'awaiting_confirmation') {
			this.currentFile.setText(t('sync.awaitingConfirmation'));
		} else if (currentRun?.stage === 'executing' && progress.completed.length === 0) {
			this.currentFile.setText(t('sync.start'));
		} else if (this.plugin.progressService.syncEnd) {
			if (currentRun?.stage === 'cancelled' || this.syncCancelled) {
				this.stopButtonComponent.buttonEl.addClass('hidden');
				this.hideButtonComponent.setButtonText(t('sync.closeButton'));
				this.currentFile.setText(t('sync.cancelled'));
			} else if (currentRun?.stage === 'failed') {
				this.stopButtonComponent.buttonEl.addClass('hidden');
				this.hideButtonComponent.setButtonText(t('sync.closeButton'));
				this.currentFile.setText(t('sync.failedStatus'));
			} else if (currentRun?.stage === 'completed_noop') {
				this.stopButtonComponent.buttonEl.addClass('hidden');
				this.hideButtonComponent.setButtonText(t('sync.closeButton'));
				this.currentFile.setText(t('sync.alreadyUpToDate'));
			} else {
				this.stopButtonComponent.buttonEl.addClass('hidden');
				this.hideButtonComponent.setButtonText(t('sync.closeButton'));
				this.currentFile.setText(t('sync.complete'));
			}
		} else if (progress.completed.length > 0) {
			const lastFile = progress.completed.at(-1);
			if (lastFile) this.currentFile.setText(`${lastFile.taskName} ${lastFile.path}`);
		}
	}

	onOpen() {
		const { contentEl } = this;
		this.setTitle(t('sync.progressTitle'));
		contentEl.empty();

		const container = contentEl.createDiv({
			cls: 'flex flex-col gap-4 max-h-[75vh]',
		});

		const progressSection = container.createDiv({
			cls: 'flex flex-col gap-2 mt-5',
		});

		const progressTextContainer = progressSection.createDiv({
			cls: 'flex flex-row',
		});

		const currentFile = progressTextContainer.createDiv({
			cls: 'text-3.25 text-[var(--text-muted)] truncate overflow-hidden whitespace-nowrap',
		});

		const progressStats = progressTextContainer.createDiv({
			cls: 'text-3.25 text-[var(--text-muted)] ml-auto',
		});

		const progressBarContainer = progressSection.createDiv({
			cls: 'relative h-5 bg-[var(--background-secondary)] rounded overflow-hidden',
		});

		const progressBar = progressBarContainer.createDiv({
			cls: 'absolute h-full bg-[var(--interactive-accent)] w-0 transition-width',
		});

		const progressText = progressBarContainer.createDiv({
			cls: 'absolute w-full text-center text-3 leading-5 text-[var(--text-on-accent)] mix-blend-difference',
		});

		const syncStateProgressSection = container.createDiv({
			cls: 'flex flex-col gap-1',
		});
		this.syncStateCurrentOperation = syncStateProgressSection.createDiv();
		this.syncStateCurrentOperation.setText(t('sync.updatingSyncState'));
		this.syncStateCurrentOperation.hide();

		const syncStateProgressStats = syncStateProgressSection.createDiv({
			cls: 'text-3.25',
		});
		this.syncStateProgressStats = syncStateProgressStats;
		this.syncStateProgressStats.hide();

		const syncStateProgressBarContainer = syncStateProgressSection.createDiv({
			cls: 'relative h-5 bg-[var(--background-secondary)] rounded overflow-hidden',
		});
		syncStateProgressBarContainer.hide();

		syncStateProgressBarContainer.createDiv({
			cls: 'absolute h-full bg-[var(--interactive-accent)] w-0 transition-width',
		});
		syncStateProgressBarContainer.createDiv({
			cls: 'absolute w-full text-center text-3 leading-5 text-[var(--text-on-accent)] mix-blend-difference',
		});

		this.progressBar = progressBar;
		this.progressText = progressText;
		this.progressStats = progressStats;
		this.currentFile = currentFile;

		const footerButtons = container.createDiv({
			cls: 'border-t border-[var(--background-modifier-border)]',
		});

		new Setting(footerButtons)
			.addButton((button) => {
				button.setButtonText(t('sync.hideButton')).onClick(() => this.close());
				this.hideButtonComponent = button;
			})
			.addButton((button) => {
				button.setButtonText(t('sync.stopButton')).setWarning().onClick(syncCancel);
				this.stopButtonComponent = button;
			});

		this.update();
	}

	onClose(): void {
		this.cancelSubscription();
		const { contentEl } = this;
		contentEl.empty();
		if (this.closeCallback) this.closeCallback();
	}
}
